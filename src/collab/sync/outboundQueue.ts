import type { CollabTransport } from '../types';

type PendingUpdate = {
	clientUpdateId: string;
	updateBase64: string;
	baseSeq: number;
	bytes: number;
};

type OutboundQueueOptions = {
	transport: CollabTransport;
	roomId: string;
	actorId: string;
	onAck: (seq: number, acceptedClientUpdateIds: string[]) => void;
	onNeedReconnect: () => void;
	onError: (error: string) => void;
	maxPendingCount?: number;
	maxPendingBytes?: number;
};

const byteLengthFromBase64 = (base64: string): number => {
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
	return (base64.length * 3) / 4 - padding;
};

export class OutboundUpdateQueue {
	private readonly options: OutboundQueueOptions;
	private readonly pending: PendingUpdate[] = [];
	private inflight = false;
	private stopped = false;
	private lastAckSeq = 0;
	private pendingBytes = 0;
	private retryDelayMs = 500;
	private retryTimer: number | null = null;

	constructor(options: OutboundQueueOptions) {
		this.options = options;
	}

	setLastAckSeq(seq: number): void {
		this.lastAckSeq = Math.max(this.lastAckSeq, seq);
	}

	getDepth(): number {
		return this.pending.length;
	}

	enqueue(update: { clientUpdateId: string; updateBase64: string; baseSeq: number }): boolean {
		if (this.stopped) return false;
		const maxPendingCount = this.options.maxPendingCount ?? 500;
		const maxPendingBytes = this.options.maxPendingBytes ?? 2 * 1024 * 1024;
		const bytes = byteLengthFromBase64(update.updateBase64);
		if (this.pending.length >= maxPendingCount || this.pendingBytes + bytes > maxPendingBytes) {
			this.options.onNeedReconnect();
			return false;
		}
		this.pending.push({ ...update, bytes });
		this.pendingBytes += bytes;
		void this.flush();
		return true;
	}

	stop(): void {
		this.stopped = true;
		if (this.retryTimer !== null) {
			globalThis.window.clearTimeout(this.retryTimer);
			this.retryTimer = null;
		}
	}

	private async flush(): Promise<void> {
		if (this.stopped || this.inflight || this.pending.length === 0) {
			return;
		}
		this.inflight = true;
		try {
			while (!this.stopped && this.pending.length > 0) {
				const item = this.pending[0];
				const response = await this.options.transport.appendRoomUpdates({
					roomId: this.options.roomId,
					actorId: this.options.actorId,
					baseSeq: Math.max(this.lastAckSeq, item.baseSeq),
					updates: [{ clientUpdateId: item.clientUpdateId, updateBase64: item.updateBase64 }],
				});
				this.lastAckSeq = Math.max(this.lastAckSeq, response.lastSeq);
				this.pending.shift();
				this.pendingBytes -= item.bytes;
				this.options.onAck(this.lastAckSeq, response.acceptedClientUpdateIds);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to flush collaboration updates';
			this.options.onError(message);
			if (!this.stopped && this.retryTimer === null) {
				const delay = this.retryDelayMs;
				this.retryTimer = globalThis.window.setTimeout(() => {
					this.retryTimer = null;
					void this.flush();
				}, delay);
				this.retryDelayMs = Math.min(4000, Math.floor(this.retryDelayMs * 1.7));
			}
		} finally {
			if (this.pending.length === 0) {
				this.retryDelayMs = 500;
			}
			this.inflight = false;
		}
	}
}

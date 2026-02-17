import type { CollabTransport, RoomUpdate } from '../types';

type InboundStreamOptions = {
	transport: CollabTransport;
	roomId: string;
	pollIntervalMs?: number;
	initialSeq?: number;
	onUpdate: (update: RoomUpdate) => void;
	onGapRecovery: () => void;
	onError: (error: string) => void;
};

export class InboundUpdateStream {
	private readonly options: InboundStreamOptions;
	private timer: number | null = null;
	private afterSeq: number;
	private fetching = false;
	private gapSinceMs: number | null = null;

	constructor(options: InboundStreamOptions) {
		this.options = options;
		this.afterSeq = options.initialSeq ?? 0;
	}

	setAfterSeq(value: number): void {
		this.afterSeq = Math.max(this.afterSeq, value);
	}

	start(): void {
		if (this.timer !== null) return;
		const interval = this.options.pollIntervalMs ?? 800;
		this.timer = globalThis.window.setInterval(() => {
			void this.tick();
		}, interval);
		void this.tick();
	}

	stop(): void {
		if (this.timer !== null) {
			globalThis.window.clearInterval(this.timer);
			this.timer = null;
		}
	}

	private async tick(): Promise<void> {
		if (this.fetching) return;
		this.fetching = true;
		try {
			const updates = await this.options.transport.listRoomUpdatesSince({
				roomId: this.options.roomId,
				afterSeq: this.afterSeq,
				limit: 120,
			});
			if (updates.length === 0) {
				this.gapSinceMs = null;
				return;
			}
			updates.sort((a, b) => a.seq - b.seq);
			for (const update of updates) {
				if (update.seq <= this.afterSeq) continue;
				if (update.seq > this.afterSeq + 1) {
					if (this.gapSinceMs === null) {
						this.gapSinceMs = Date.now();
					}
					if (Date.now() - this.gapSinceMs > 2000) {
						this.options.onGapRecovery();
						this.afterSeq = update.seq - 1;
						this.gapSinceMs = null;
					}
					continue;
				}
				this.gapSinceMs = null;
				this.afterSeq = update.seq;
				this.options.onUpdate(update);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to fetch collaboration updates';
			this.options.onError(message);
		} finally {
			this.fetching = false;
		}
	}
}

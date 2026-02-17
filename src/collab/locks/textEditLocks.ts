import type { CollabTransport, TextLockAcquireResult } from '../types';

export class TextEditLockManager {
	private readonly transport: CollabTransport;
	private readonly roomId: string;
	private readonly actorId: string;
	private readonly renewTimers = new Map<string, number>();

	constructor(transport: CollabTransport, roomId: string, actorId: string) {
		this.transport = transport;
		this.roomId = roomId;
		this.actorId = actorId;
	}

	async acquire(nodeId: string, leaseMs: number = 8000): Promise<TextLockAcquireResult> {
		const result = await this.transport.acquireTextEditLock({
			roomId: this.roomId,
			nodeId,
			actorId: this.actorId,
			leaseMs,
		});
		if (result.ok) {
			this.startRenew(nodeId, leaseMs);
		}
		return result;
	}

	async release(nodeId: string): Promise<void> {
		this.stopRenew(nodeId);
		await this.transport.releaseTextEditLock({
			roomId: this.roomId,
			nodeId,
			actorId: this.actorId,
		});
	}

	releaseAll(): void {
		for (const nodeId of this.renewTimers.keys()) {
			void this.release(nodeId);
		}
	}

	private startRenew(nodeId: string, leaseMs: number): void {
		this.stopRenew(nodeId);
		const renewMs = Math.max(1000, Math.floor(leaseMs * 0.375));
		const timer = globalThis.window.setInterval(() => {
			void this.transport.acquireTextEditLock({
				roomId: this.roomId,
				nodeId,
				actorId: this.actorId,
				leaseMs,
			});
		}, renewMs);
		this.renewTimers.set(nodeId, timer);
	}

	private stopRenew(nodeId: string): void {
		const timer = this.renewTimers.get(nodeId);
		if (timer !== undefined) {
			globalThis.window.clearInterval(timer);
			this.renewTimers.delete(nodeId);
		}
	}
}

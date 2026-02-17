import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import type {
	AppendRoomUpdatesArgs,
	AppendRoomUpdatesResult,
	CollabTransport,
	CollaboratorPresence,
	CreateRoomArgs,
	CreateRoomResult,
	JoinRoomArgs,
	JoinRoomResult,
	ListRoomUpdatesArgs,
	PresenceUpsertArgs,
	RoomUpdate,
	TextLockAcquireArgs,
	TextLockAcquireResult,
	TextLockReleaseArgs,
} from '../types';

const createRoomRef = makeFunctionReference<'mutation'>('rooms:createRoomFromDocument');
const joinRoomRef = makeFunctionReference<'mutation'>('invites:joinRoomByInvite');
const appendUpdatesRef = makeFunctionReference<'mutation'>('updates:appendRoomUpdates');
const listUpdatesRef = makeFunctionReference<'query'>('updates:listRoomUpdatesSince');
const saveSnapshotRef = makeFunctionReference<'mutation'>('updates:saveRoomSnapshot');
const upsertPresenceRef = makeFunctionReference<'mutation'>('presence:upsertPresence');
const listPresenceRef = makeFunctionReference<'query'>('presence:listPresence');
const acquireTextLockRef = makeFunctionReference<'mutation'>('presence:acquireTextEditLock');
const releaseTextLockRef = makeFunctionReference<'mutation'>('presence:releaseTextEditLock');

const trimSlash = (value: string): string => value.replace(/\/$/, '');

export const getConvexUrlFromEnv = (): string | null => {
	const raw =
		(import.meta.env?.VITE_CONVEX_URL as string | undefined) ??
		(import.meta.env?.VITE_CONVEX_SITE_URL as string | undefined) ??
		null;
	if (!raw || raw.trim().length === 0) return null;
	return trimSlash(raw.trim());
};

export class ConvexCollabTransport implements CollabTransport {
	private readonly client: ConvexHttpClient;

	constructor(url: string) {
		this.client = new ConvexHttpClient(url);
	}

	async createRoomFromDocument(args: CreateRoomArgs): Promise<CreateRoomResult> {
		const result = await this.client.mutation(createRoomRef, args);
		return result as CreateRoomResult;
	}

	async joinRoomByInvite(args: JoinRoomArgs): Promise<JoinRoomResult> {
		const result = await this.client.mutation(joinRoomRef, args);
		return result as JoinRoomResult;
	}

	async appendRoomUpdates(args: AppendRoomUpdatesArgs): Promise<AppendRoomUpdatesResult> {
		const result = await this.client.mutation(appendUpdatesRef, args);
		return result as AppendRoomUpdatesResult;
	}

	async listRoomUpdatesSince(args: ListRoomUpdatesArgs): Promise<RoomUpdate[]> {
		const result = await this.client.query(listUpdatesRef, args);
		return (result as RoomUpdate[]) ?? [];
	}

	async saveRoomSnapshot(args: { roomId: string; seq: number; snapshotBase64: string; checksum: string }): Promise<void> {
		await this.client.mutation(saveSnapshotRef, args);
	}

	async upsertPresence(args: PresenceUpsertArgs): Promise<void> {
		await this.client.mutation(upsertPresenceRef, args);
	}

	async listPresence(roomId: string): Promise<CollaboratorPresence[]> {
		const result = await this.client.query(listPresenceRef, { roomId });
		return (result as CollaboratorPresence[]) ?? [];
	}

	async acquireTextEditLock(args: TextLockAcquireArgs): Promise<TextLockAcquireResult> {
		const result = await this.client.mutation(acquireTextLockRef, args);
		return result as TextLockAcquireResult;
	}

	async releaseTextEditLock(args: TextLockReleaseArgs): Promise<void> {
		await this.client.mutation(releaseTextLockRef, args);
	}
}

export const createConvexCollabTransport = (): CollabTransport | null => {
	const url = getConvexUrlFromEnv();
	if (!url) return null;
	return new ConvexCollabTransport(url);
};

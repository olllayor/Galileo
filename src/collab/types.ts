import type { Document } from '../core/doc/types';
import type { Command } from '../core/commands/types';

export type CollabStatus = 'disabled' | 'local' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type PresenceCursor = {
	x: number;
	y: number;
};

export type PresenceViewport = {
	panX: number;
	panY: number;
	zoom: number;
};

export type PresenceState = {
	cursor?: PresenceCursor;
	selectionIds: string[];
	viewport?: PresenceViewport;
	activeTool?: string;
	editingTextNodeId?: string;
};

export type CollaboratorPresence = {
	actorId: string;
	displayName: string;
	color: string;
	lastSeenAt: number;
	cursor?: PresenceCursor;
	selectionIds: string[];
	viewport?: PresenceViewport;
	activeTool?: string;
	editingTextNodeId?: string;
};

export type CollabTelemetry = {
	lastAppliedSeq: number;
	queueDepth: number;
	reconnectCount: number;
	gapRecoveries: number;
	lockContentionCount: number;
};

export type CollabSessionState = {
	collabStatus: CollabStatus;
	collabError: string | null;
	collaborators: CollaboratorPresence[];
	roomId: string | null;
	actorId: string;
	shareLink: string | null;
	collabTelemetry: CollabTelemetry;
};

export type RoomUpdate = {
	seq: number;
	roomId: string;
	actorId: string;
	clientUpdateId: string;
	baseSeq: number;
	updateBase64: string;
	createdAt: number;
};

export type RoomSnapshot = {
	seq: number;
	snapshotBase64: string;
	checksum: string;
	createdAt: number;
};

export type CreateRoomArgs = {
	name: string;
	initialSnapshotBase64: string;
	inviteExpiryMs: number;
	actorId: string;
	displayName: string;
	deviceId: string;
};

export type CreateRoomResult = {
	roomId: string;
	inviteToken: string;
	shareLink: string;
};

export type JoinRoomArgs = {
	inviteToken: string;
	displayName: string;
	deviceId: string;
	actorId: string;
};

export type JoinRoomResult = {
	roomId: string;
	shareLink: string;
	snapshotBase64: string;
	snapshotSeq: number;
	latestSeq: number;
};

export type AppendRoomUpdatesArgs = {
	roomId: string;
	actorId: string;
	baseSeq: number;
	updates: Array<{
		clientUpdateId: string;
		updateBase64: string;
	}>;
};

export type AppendRoomUpdatesResult = {
	lastSeq: number;
	acceptedClientUpdateIds: string[];
	dedupedClientUpdateIds: string[];
};

export type ListRoomUpdatesArgs = {
	roomId: string;
	afterSeq: number;
	limit: number;
};

export type PresenceUpsertArgs = {
	roomId: string;
	actorId: string;
	displayName: string;
	color: string;
	cursor?: PresenceCursor;
	selectionIds: string[];
	viewport?: PresenceViewport;
	activeTool?: string;
	editingTextNodeId?: string;
};

export type TextLockAcquireArgs = {
	roomId: string;
	nodeId: string;
	actorId: string;
	leaseMs: number;
};

export type TextLockAcquireResult =
	| { ok: true; leaseExpiresAt: number }
	| { ok: false; holderActorId: string; leaseExpiresAt: number };

export type TextLockReleaseArgs = {
	roomId: string;
	nodeId: string;
	actorId: string;
};

export interface CollabTransport {
	createRoomFromDocument(args: CreateRoomArgs): Promise<CreateRoomResult>;
	joinRoomByInvite(args: JoinRoomArgs): Promise<JoinRoomResult>;
	appendRoomUpdates(args: AppendRoomUpdatesArgs): Promise<AppendRoomUpdatesResult>;
	listRoomUpdatesSince(args: ListRoomUpdatesArgs): Promise<RoomUpdate[]>;
	saveRoomSnapshot(args: { roomId: string; seq: number; snapshotBase64: string; checksum: string }): Promise<void>;
	upsertPresence(args: PresenceUpsertArgs): Promise<void>;
	listPresence(roomId: string): Promise<CollaboratorPresence[]>;
	acquireTextEditLock(args: TextLockAcquireArgs): Promise<TextLockAcquireResult>;
	releaseTextEditLock(args: TextLockReleaseArgs): Promise<void>;
}

export type CollabExecuteCommand = (command: Command) => void;

export type CollaborativeDocumentApi = {
	document: Document;
	selectedIds: string[];
	executeCommand: CollabExecuteCommand;
	undoCommand: () => void;
	redoCommand: () => void;
	selectNode: (nodeId: string) => void;
	toggleSelection: (nodeId: string) => void;
	setSelection: (ids: string[]) => void;
	clearSelection: () => void;
	replaceDocument: (doc: Document) => void;
	markSaved: () => void;
	markDirty: () => void;
	isDirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	createSharedRoom: (name: string) => Promise<string | null>;
	joinSharedRoomByInvite: (inviteToken: string) => Promise<boolean>;
	leaveSharedRoom: () => void;
	updatePresence: (presence: PresenceState) => void;
	acquireTextEditLock: (nodeId: string, leaseMs?: number) => Promise<TextLockAcquireResult>;
	releaseTextEditLock: (nodeId: string) => Promise<void>;
} & CollabSessionState;

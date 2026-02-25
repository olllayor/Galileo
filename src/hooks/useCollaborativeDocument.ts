import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Patch } from 'immer';
import type { UndoManager } from 'yjs';
import { useDocument } from './useDocument';
import type { Document } from '../core/doc/types';
import { createDocument } from '../core/doc/types';
import type {
	CollaborativeDocumentApi,
	CollaboratorPresence,
	CollabStatus,
	CollabTelemetry,
	CollabTransport,
	JoinRoomResult,
	PresenceState,
	TextLockAcquireResult,
} from '../collab/types';
import { createConvexCollabTransport } from '../collab/transport/convexTransport';
import { createActorId, createClientUpdateId, createDeviceId, createDisplayName } from '../collab/utils/ids';
import { DocumentYDocAdapter } from '../collab/crdt/documentYDocAdapter';
import { OutboundUpdateQueue } from '../collab/sync/outboundQueue';
import { InboundUpdateStream } from '../collab/sync/inboundStream';
import { TextEditLockManager } from '../collab/locks/textEditLocks';
import { ENABLE_COLLAB_V1, ENABLE_COLLAB_TEXT_LOCKS_V1 } from '../core/feature-flags';
import { getCommandPatches } from '../core/commands/executor';
import { bytesToBase64, encodeJsonBase64 } from '../collab/utils/base64';

const PRESENCE_STALE_MS = 15_000;
const PRESENCE_HEARTBEAT_MS = 1_500;
const PRESENCE_CURSOR_THROTTLE_MS = 80;
const SNAPSHOT_UPDATE_THRESHOLD = 300;
const SNAPSHOT_TIME_THRESHOLD_MS = 120_000;

type SessionRuntime = {
	roomId: string;
	localOrigin: string;
	adapter: DocumentYDocAdapter;
	undoManager: UndoManager;
	outbound: OutboundUpdateQueue;
	inbound: InboundUpdateStream;
	textLocks: TextEditLockManager;
	unsubscribeAdapter: () => void;
	presencePollTimer: number;
	lastAppliedSeq: number;
	lastSnapshotAt: number;
	updatesSinceSnapshot: number;
	updateCounter: number;
};

const mergeTelemetry = (prev: CollabTelemetry, updates: Partial<CollabTelemetry>): CollabTelemetry => ({
	...prev,
	...updates,
});

const derivePresenceColor = (actorId: string): string => {
	let hash = 0;
	for (let i = 0; i < actorId.length; i += 1) {
		hash = (hash * 31 + actorId.charCodeAt(i)) | 0;
	}
	const hue = Math.abs(hash) % 360;
	return `hsl(${hue}, 78%, 62%)`;
};

const filterStalePresence = (items: CollaboratorPresence[]): CollaboratorPresence[] => {
	const now = Date.now();
	return items.filter((item) => now - item.lastSeenAt <= PRESENCE_STALE_MS);
};

const normalizeInviteToken = (input: string): string | null => {
	const raw = input.trim();
	if (raw.length === 0) return null;
	if (raw.startsWith('galileo://')) {
		const segment = raw.split('/').filter(Boolean).pop() ?? '';
		return segment.length > 0 ? segment : null;
	}
	if (raw.includes('://')) {
		try {
			const parsed = new URL(raw);
			const pathSegment = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
			if (pathSegment.length > 0) return pathSegment;
			const token = parsed.searchParams.get('inviteToken') ?? parsed.searchParams.get('token');
			return token && token.trim().length > 0 ? token.trim() : null;
		} catch {
			return null;
		}
	}
	return raw;
};

export const useCollaborativeDocument = (initialDoc: Document = createDocument()): CollaborativeDocumentApi => {
	const base = useDocument(initialDoc);
	const collabEnabled = ENABLE_COLLAB_V1;
	const actorIdRef = useRef(createActorId());
	const deviceIdRef = useRef(createDeviceId());
	const displayNameRef = useRef(createDisplayName());
	const transportRef = useRef<CollabTransport | null>(collabEnabled ? createConvexCollabTransport() : null);
	const sessionRef = useRef<SessionRuntime | null>(null);
	const selectedIdsRef = useRef(base.selectedIds);
	const documentRef = useRef(base.document);
	const lastPresenceStateRef = useRef<PresenceState>({ selectionIds: [] });
	const presenceThrottleTimerRef = useRef<number | null>(null);
	const collabStatusRef = useRef<CollabStatus>(collabEnabled ? 'local' : 'disabled');

	const [collabStatus, setCollabStatus] = useState<CollabStatus>(collabEnabled ? 'local' : 'disabled');
	const [collabError, setCollabError] = useState<string | null>(null);
	const [roomId, setRoomId] = useState<string | null>(null);
	const [shareLink, setShareLink] = useState<string | null>(null);
	const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
	const [collabTelemetry, setCollabTelemetry] = useState<CollabTelemetry>({
		lastAppliedSeq: 0,
		queueDepth: 0,
		reconnectCount: 0,
		gapRecoveries: 0,
		lockContentionCount: 0,
	});

	const actorId = actorIdRef.current;

	useEffect(() => {
		selectedIdsRef.current = base.selectedIds;
	}, [base.selectedIds]);

	useEffect(() => {
		documentRef.current = base.document;
	}, [base.document]);

	const setStatus = useCallback((next: CollabStatus, error: string | null = null) => {
		collabStatusRef.current = next;
		setCollabStatus(next);
		setCollabError(error);
	}, []);

	const applyProjectedDocument = useCallback(
		(next: Document) => {
			const previousSelection = selectedIdsRef.current;
			base.replaceDocument(next);
			if (previousSelection.length > 0) {
				const validSelection = previousSelection.filter((id) => Boolean(next.nodes[id]));
				if (validSelection.length > 0) {
					base.setSelection(validSelection);
				}
			}
			base.markDirty();
		},
		[base],
	);

	const refreshPresence = useCallback(async () => {
		const session = sessionRef.current;
		const transport = transportRef.current;
		if (!session || !transport) return;
		try {
			const list = await transport.listPresence(session.roomId);
			setCollaborators(filterStalePresence(list));
		} catch {
			// Presence is best-effort.
		}
	}, []);

	const flushPresence = useCallback(async () => {
		const session = sessionRef.current;
		const transport = transportRef.current;
		if (!session || !transport || collabStatusRef.current !== 'connected') {
			return;
		}
		const presence = lastPresenceStateRef.current;
		try {
			await transport.upsertPresence({
				roomId: session.roomId,
				actorId,
				displayName: displayNameRef.current,
				color: derivePresenceColor(actorId),
				cursor: presence.cursor,
				selectionIds: presence.selectionIds,
				viewport: presence.viewport,
				activeTool: presence.activeTool,
				editingTextNodeId: presence.editingTextNodeId,
			});
		} catch {
			// Presence updates should not interrupt editing.
		}
	}, [actorId]);

	const schedulePresenceFlush = useCallback(
		(immediate: boolean) => {
			if (immediate) {
				if (presenceThrottleTimerRef.current !== null) {
					globalThis.window.clearTimeout(presenceThrottleTimerRef.current);
					presenceThrottleTimerRef.current = null;
				}
				void flushPresence();
				return;
			}
			if (presenceThrottleTimerRef.current !== null) return;
			presenceThrottleTimerRef.current = globalThis.window.setTimeout(() => {
				presenceThrottleTimerRef.current = null;
				void flushPresence();
			}, PRESENCE_CURSOR_THROTTLE_MS);
		},
		[flushPresence],
	);

	const cleanupSession = useCallback(() => {
		if (presenceThrottleTimerRef.current !== null) {
			globalThis.window.clearTimeout(presenceThrottleTimerRef.current);
			presenceThrottleTimerRef.current = null;
		}
		const session = sessionRef.current;
		if (!session) {
			setCollaborators([]);
			setRoomId(null);
			setShareLink(null);
			setStatus(collabEnabled ? 'local' : 'disabled');
			return;
		}
		session.unsubscribeAdapter();
		session.inbound.stop();
		session.outbound.stop();
		session.textLocks.releaseAll();
		globalThis.window.clearInterval(session.presencePollTimer);
		session.adapter.destroy();
		sessionRef.current = null;
		setCollaborators([]);
		setRoomId(null);
		setShareLink(null);
		setStatus(collabEnabled ? 'local' : 'disabled');
	}, [collabEnabled, setStatus]);

	const maybeSaveSnapshot = useCallback(async () => {
		const transport = transportRef.current;
		const session = sessionRef.current;
		if (!transport || !session) return;
		const now = Date.now();
		if (
			session.updatesSinceSnapshot < SNAPSHOT_UPDATE_THRESHOLD &&
			now - session.lastSnapshotAt < SNAPSHOT_TIME_THRESHOLD_MS
		) {
			return;
		}
		const snapshotBase64 = session.adapter.toSnapshotBase64();
		const checksum = session.adapter.getDocumentChecksum();
		try {
			await transport.saveRoomSnapshot({
				roomId: session.roomId,
				seq: session.lastAppliedSeq,
				snapshotBase64,
				checksum,
			});
			session.lastSnapshotAt = now;
			session.updatesSinceSnapshot = 0;
		} catch {
			// Snapshot persistence is best-effort and retried on next threshold pass.
		}
	}, []);

	const startJoinedSession = useCallback(
		(joined: JoinRoomResult) => {
			const transport = transportRef.current;
			if (!transport) {
				setStatus('error', 'Collaboration transport is unavailable.');
				return;
			}
			cleanupSession();

			const localOrigin = `actor:${actorId}`;
			const adapter = new DocumentYDocAdapter();
			const docFromSnapshot = adapter.loadSnapshotBase64(joined.snapshotBase64, 'snapshot');
			applyProjectedDocument(docFromSnapshot);

			const undoManager = adapter.createUndoManager(localOrigin);
			const outbound = new OutboundUpdateQueue({
				transport,
				roomId: joined.roomId,
				actorId,
				onAck: (seq) => {
					const runtime = sessionRef.current;
					if (!runtime) return;
					runtime.lastAppliedSeq = Math.max(runtime.lastAppliedSeq, seq);
					setCollabTelemetry((prev) => mergeTelemetry(prev, { lastAppliedSeq: runtime.lastAppliedSeq, queueDepth: runtime.outbound.getDepth() }));
					if (collabStatusRef.current !== 'connected') {
						setStatus('connected', null);
					}
				},
				onNeedReconnect: () => {
					setStatus('reconnecting', 'Reconnect required to continue syncing.');
					setCollabTelemetry((prev) => mergeTelemetry(prev, { reconnectCount: prev.reconnectCount + 1 }));
				},
				onError: (error) => {
					setStatus('reconnecting', error);
				},
			});
			outbound.setLastAckSeq(joined.latestSeq);

			const inbound = new InboundUpdateStream({
				transport,
				roomId: joined.roomId,
				initialSeq: joined.snapshotSeq,
				onGapRecovery: () => {
					setCollabTelemetry((prev) => mergeTelemetry(prev, { gapRecoveries: prev.gapRecoveries + 1 }));
				},
				onError: (error) => {
					setStatus('reconnecting', error);
				},
				onUpdate: (update) => {
					const runtime = sessionRef.current;
					if (!runtime) return;
					runtime.lastAppliedSeq = update.seq;
					setCollabTelemetry((prev) =>
						mergeTelemetry(prev, {
							lastAppliedSeq: update.seq,
							queueDepth: runtime.outbound.getDepth(),
						}),
					);
					if (update.actorId === actorId) {
						return;
					}
					runtime.adapter.applyUpdateBase64(update.updateBase64, 'remote');
					applyProjectedDocument(runtime.adapter.getDocument());
				},
			});

			const unsubscribeAdapter = adapter.observeUpdates((bytes, origin) => {
				const runtime = sessionRef.current;
				if (!runtime || origin !== localOrigin) return;
				runtime.updateCounter += 1;
				const clientUpdateId = createClientUpdateId(actorId, runtime.updateCounter);
				const updateBase64 = bytesToBase64(bytes);
				runtime.outbound.enqueue({
					clientUpdateId,
					updateBase64,
					baseSeq: runtime.lastAppliedSeq,
				});
				runtime.updatesSinceSnapshot += 1;
				setCollabTelemetry((prev) => mergeTelemetry(prev, { queueDepth: runtime.outbound.getDepth() }));
				void maybeSaveSnapshot();
			});

			const textLocks = new TextEditLockManager(transport, joined.roomId, actorId);
			const presencePollTimer = globalThis.window.setInterval(() => {
				void refreshPresence();
			}, PRESENCE_HEARTBEAT_MS);

			sessionRef.current = {
				roomId: joined.roomId,
				localOrigin,
				adapter,
				undoManager,
				outbound,
				inbound,
				textLocks,
				unsubscribeAdapter,
				presencePollTimer,
				lastAppliedSeq: joined.latestSeq,
				lastSnapshotAt: Date.now(),
				updatesSinceSnapshot: 0,
				updateCounter: 0,
			};

			setRoomId(joined.roomId);
			setShareLink(joined.shareLink);
			setStatus('connected', null);
			inbound.start();
			void refreshPresence();
			void flushPresence();
		},
		[actorId, applyProjectedDocument, cleanupSession, flushPresence, maybeSaveSnapshot, refreshPresence, setStatus],
	);

	const createSharedRoom = useCallback(
		async (name: string): Promise<string | null> => {
			if (!collabEnabled) return null;
			const transport = transportRef.current;
			if (!transport) {
				setStatus('error', 'VITE_CONVEX_URL (or VITE_CONVEX_SITE_URL) is missing.');
				return null;
			}
			try {
				setStatus('connecting', null);
				const created = await transport.createRoomFromDocument({
					name: name.trim().length > 0 ? name.trim() : 'Untitled Collaboration',
					initialSnapshotBase64: encodeJsonBase64(documentRef.current),
					inviteExpiryMs: 1000 * 60 * 60 * 24 * 7,
					actorId,
					displayName: displayNameRef.current,
					deviceId: deviceIdRef.current,
				});
				const joined = await transport.joinRoomByInvite({
					inviteToken: created.inviteToken,
					displayName: displayNameRef.current,
					deviceId: deviceIdRef.current,
					actorId,
				});
				startJoinedSession({ ...joined, shareLink: created.shareLink });
				return created.shareLink;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to create collaboration room';
				setStatus('error', message);
				return null;
			}
		},
		[actorId, collabEnabled, setStatus, startJoinedSession],
	);

	const joinSharedRoomByInvite = useCallback(
		async (inviteToken: string): Promise<boolean> => {
			if (!collabEnabled) return false;
			const transport = transportRef.current;
			if (!transport) {
				setStatus('error', 'VITE_CONVEX_URL (or VITE_CONVEX_SITE_URL) is missing.');
				return false;
			}
			const token = normalizeInviteToken(inviteToken);
			if (!token) {
				setStatus('error', 'Invite token is required.');
				return false;
			}
			try {
				setStatus('connecting', null);
				const joined = await transport.joinRoomByInvite({
					inviteToken: token,
					displayName: displayNameRef.current,
					deviceId: deviceIdRef.current,
					actorId,
				});
				startJoinedSession(joined);
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to join collaboration room';
				setStatus('error', message);
				return false;
			}
		},
		[actorId, collabEnabled, setStatus, startJoinedSession],
	);

	const leaveSharedRoom = useCallback(() => {
		cleanupSession();
	}, [cleanupSession]);

	const updatePresence = useCallback(
		(presence: PresenceState) => {
			lastPresenceStateRef.current = {
				...lastPresenceStateRef.current,
				...presence,
				selectionIds: presence.selectionIds,
			};
			schedulePresenceFlush(!presence.cursor);
		},
		[schedulePresenceFlush],
	);

	const executeCommand = useCallback(
		(command: Parameters<typeof base.executeCommand>[0]) => {
			const session = sessionRef.current;
			if (!session) {
				base.executeCommand(command);
				return;
			}
			const { patches } = getCommandPatches(documentRef.current, command) as { patches: Patch[] };
			base.executeCommand(command);
			session.adapter.applyPatches(patches, session.localOrigin);
		},
		[base],
	);

	const undoCommand = useCallback(() => {
		const session = sessionRef.current;
		if (!session) {
			base.undoCommand();
			return;
		}
		if (!session.undoManager.canUndo()) return;
		session.undoManager.undo();
		applyProjectedDocument(session.adapter.getDocument());
	}, [applyProjectedDocument, base]);

	const redoCommand = useCallback(() => {
		const session = sessionRef.current;
		if (!session) {
			base.redoCommand();
			return;
		}
		if (!session.undoManager.canRedo()) return;
		session.undoManager.redo();
		applyProjectedDocument(session.adapter.getDocument());
	}, [applyProjectedDocument, base]);

	const acquireTextEditLock = useCallback(
		async (nodeId: string, leaseMs: number = 8000): Promise<TextLockAcquireResult> => {
			const session = sessionRef.current;
			if (!ENABLE_COLLAB_TEXT_LOCKS_V1 || !session || collabStatusRef.current !== 'connected') {
				return { ok: true, leaseExpiresAt: Date.now() + leaseMs };
			}
			const result = await session.textLocks.acquire(nodeId, leaseMs);
			if (!result.ok) {
				setCollabTelemetry((prev) => mergeTelemetry(prev, { lockContentionCount: prev.lockContentionCount + 1 }));
			}
			return result;
		},
		[],
	);

	const releaseTextEditLock = useCallback(async (nodeId: string): Promise<void> => {
		const session = sessionRef.current;
		if (!ENABLE_COLLAB_TEXT_LOCKS_V1 || !session || collabStatusRef.current !== 'connected') {
			return;
		}
		await session.textLocks.release(nodeId);
	}, []);

	useEffect(
		() => () => {
			cleanupSession();
		},
		[cleanupSession],
	);

	const canUndo = useMemo(() => {
		const session = sessionRef.current;
		if (!session) return base.canUndo;
		return session.undoManager.canUndo();
	}, [base.canUndo]);

	const canRedo = useMemo(() => {
		const session = sessionRef.current;
		if (!session) return base.canRedo;
		return session.undoManager.canRedo();
	}, [base.canRedo]);

	return {
		document: base.document,
		selectedIds: base.selectedIds,
		executeCommand,
		undoCommand,
		redoCommand,
		selectNode: base.selectNode,
		toggleSelection: base.toggleSelection,
		setSelection: base.setSelection,
		clearSelection: base.clearSelection,
		replaceDocument: base.replaceDocument,
		markSaved: base.markSaved,
		markDirty: base.markDirty,
		isDirty: base.isDirty,
		canUndo,
		canRedo,
		createSharedRoom,
		joinSharedRoomByInvite,
		leaveSharedRoom,
		updatePresence,
		acquireTextEditLock,
		releaseTextEditLock,
		collabStatus,
		collabError,
		collaborators,
		roomId,
		actorId,
		shareLink,
		collabTelemetry,
	};
};

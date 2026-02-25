import type { Patch } from 'immer';
import * as Y from 'yjs';
import type { Document } from '../../core/doc/types';
import { createDocument } from '../../core/doc/types';
import { parseDocumentText } from '../../core/doc/serialization';
import { applyImmerPatchesToYDoc } from './applyImmerPatchToYDoc';
import { projectDocumentFromYDoc } from './projectDocumentFromYDoc';
import { base64ToBytes, bytesToBase64, decodeJsonBase64 } from '../utils/base64';
import { checksumText } from '../utils/checksum';
import { toYValue } from './yValue';

type UpdateListener = (update: Uint8Array, origin: unknown) => void;

export class DocumentYDocAdapter {
	private readonly ydoc: Y.Doc;
	private readonly root: Y.Map<unknown>;

	constructor(initialDoc?: Document) {
		this.ydoc = new Y.Doc();
		this.root = this.ydoc.getMap<unknown>('document');
		this.loadDocument(initialDoc ?? createDocument(), 'bootstrap');
	}

	observeUpdates(listener: UpdateListener): () => void {
		const cb = (update: Uint8Array, origin: unknown) => {
			listener(update, origin);
		};
		this.ydoc.on('update', cb);
		return () => this.ydoc.off('update', cb);
	}

	loadDocument(doc: Document, origin: unknown = 'load'): void {
		this.ydoc.transact(() => {
			this.root.clear();
			const asMap = toYValue(doc);
			if (asMap instanceof Y.Map) {
				for (const [key, value] of asMap.entries()) {
					this.root.set(key, value);
				}
			}
		}, origin);
	}

	loadSnapshotBase64(snapshotBase64: string, origin: unknown = 'snapshot'): Document {
		const raw = decodeJsonBase64<unknown>(snapshotBase64);
		const parsed = parseDocumentText(JSON.stringify(raw));
		const next = parsed.ok ? parsed.doc : createDocument();
		this.loadDocument(next, origin);
		return next;
	}

	applyPatches(patches: Patch[], origin: unknown): void {
		if (patches.length === 0) return;
		this.ydoc.transact(() => {
			applyImmerPatchesToYDoc(this.root, patches);
		}, origin);
	}

	applyUpdate(updateBytes: Uint8Array, origin: unknown = 'remote'): void {
		Y.applyUpdate(this.ydoc, updateBytes, origin);
	}

	applyUpdateBase64(updateBase64: string, origin: unknown = 'remote'): void {
		this.applyUpdate(base64ToBytes(updateBase64), origin);
	}

	encodeStateAsUpdate(): Uint8Array {
		return Y.encodeStateAsUpdate(this.ydoc);
	}

	encodeStateAsUpdateBase64(): string {
		return bytesToBase64(this.encodeStateAsUpdate());
	}

	getDocument(): Document {
		return projectDocumentFromYDoc(this.root);
	}

	getDocumentJson(): string {
		return JSON.stringify(this.getDocument());
	}

	getDocumentChecksum(): string {
		return checksumText(this.getDocumentJson());
	}

	toSnapshotBase64(): string {
		const json = this.getDocumentJson();
		const bytes = new TextEncoder().encode(json);
		return bytesToBase64(bytes);
	}

	createUndoManager(localOrigin: unknown): Y.UndoManager {
		return new Y.UndoManager([this.root], {
			trackedOrigins: new Set([localOrigin]),
			captureTimeout: 350,
		});
	}

	destroy(): void {
		this.ydoc.destroy();
	}
}

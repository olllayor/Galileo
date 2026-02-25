import * as Y from 'yjs';
import type { Document } from '../../core/doc/types';
import { createDocument } from '../../core/doc/types';
import { parseDocumentText } from '../../core/doc/serialization';
import { fromYValue } from './yValue';

export const projectDocumentFromYDoc = (root: Y.Map<unknown>): Document => {
	const raw = fromYValue(root);
	if (!raw || typeof raw !== 'object') {
		return createDocument();
	}
	const parse = parseDocumentText(JSON.stringify(raw));
	if (!parse.ok) {
		return createDocument();
	}
	return parse.doc;
};

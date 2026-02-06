import { createDocument } from '../../core/doc/types';
import type { Document, Node } from '../../core/doc/types';
import { buildDrawList } from './builder';
import type { DrawCommand } from './types';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) {
		failures.push(label);
	}
};

const getImageCommand = (commands: DrawCommand[]): Extract<DrawCommand, { type: 'image' }> | null => {
	for (const command of commands) {
		if (command.type === 'image' && command.nodeId === 'subject') {
			return command;
		}
	}
	return null;
};

const makeDoc = (options: {
	mask: boolean;
	outline?: Partial<NonNullable<Node['image']>['outline']>;
}): Document => {
	const doc = createDocument();

	const node: Node = {
		id: 'subject',
		type: 'image',
		position: { x: 100, y: 80 },
		size: { width: 320, height: 240 },
		visible: true,
		image: {
			src: 'data:image/png;base64,AAAA',
			maskAssetId: options.mask ? 'mask' : undefined,
			outline: options.outline,
		},
	};

	doc.nodes.subject = node;
	doc.nodes[doc.rootId] = { ...doc.nodes[doc.rootId], children: ['subject'] };

	if (options.mask) {
		doc.assets.mask = {
			type: 'image',
			mime: 'image/png',
			dataBase64: 'AAAA',
			width: 320,
			height: 240,
		};
	}

	return doc;
};

export const runDrawListOutlineUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	const defaultsDoc = makeDoc({ mask: true, outline: { enabled: true } });
	const defaultsCommand = getImageCommand(buildDrawList(defaultsDoc));
	assert(failures, 'image command exists for outline defaults test', Boolean(defaultsCommand));
	assert(failures, 'outline exists when enabled and mask exists', Boolean(defaultsCommand?.outline));
	assertEqual(failures, 'default outline color', defaultsCommand?.outline?.color, '#ffffff');
	assertEqual(failures, 'default outline width', defaultsCommand?.outline?.width, 12);
	assertEqual(failures, 'default outline blur', defaultsCommand?.outline?.blur, 0);

	const missingMaskDoc = makeDoc({ mask: false, outline: { enabled: true, width: 8 } });
	const missingMaskCommand = getImageCommand(buildDrawList(missingMaskDoc));
	assertEqual(failures, 'outline omitted when mask is missing', missingMaskCommand?.outline, undefined);

	const disabledDoc = makeDoc({ mask: true, outline: { enabled: false, width: 18 } });
	const disabledCommand = getImageCommand(buildDrawList(disabledDoc));
	assertEqual(failures, 'outline omitted when disabled', disabledCommand?.outline, undefined);

	const explicitDoc = makeDoc({
		mask: true,
		outline: {
			enabled: true,
			color: '#ff0000',
			width: 9,
			blur: 5,
		},
	});
	const explicitCommand = getImageCommand(buildDrawList(explicitDoc));
	assertEqual(failures, 'explicit outline color preserved', explicitCommand?.outline?.color, '#ff0000');
	assertEqual(failures, 'explicit outline width preserved', explicitCommand?.outline?.width, 9);
	assertEqual(failures, 'explicit outline blur preserved', explicitCommand?.outline?.blur, 5);

	return {
		passed: failures.length === 0,
		failures,
	};
};

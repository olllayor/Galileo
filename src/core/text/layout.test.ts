import { layoutText } from './layout';

type UnitTestResult = {
	passed: boolean;
	failures: string[];
};

const assert = (failures: string[], label: string, condition: boolean): void => {
	if (!condition) {
		failures.push(label);
	}
};

const assertEqual = (failures: string[], label: string, actual: unknown, expected: unknown): void => {
	if (actual !== expected) {
		failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
	}
};

const measureMono = (text: string): number => {
	return Array.from(text).length * 10;
};

export const runTextLayoutUnitTests = (): UnitTestResult => {
	const failures: string[] = [];

	const autoWidth = layoutText(
		{
			text: 'Hello',
			width: 1,
			height: 1,
			fontSize: 16,
			textResizeMode: 'auto-width',
		},
		measureMono,
	);
	assertEqual(failures, 'auto-width line count', autoWidth.lines.length, 1);
	assert(failures, 'auto-width expands width', autoWidth.boxWidth >= 58);

	const autoHeight = layoutText(
		{
			text: 'Wrap me into multiple lines',
			width: 80,
			height: 20,
			fontSize: 16,
			textResizeMode: 'auto-height',
		},
		measureMono,
	);
	assert(failures, 'auto-height wraps into multiple lines', autoHeight.lines.length > 1);
	assert(failures, 'auto-height grows box height', autoHeight.boxHeight > 20);

	const fixedOverflow = layoutText(
		{
			text: 'Line 1\nLine 2\nLine 3\nLine 4',
			width: 120,
			height: 40,
			fontSize: 16,
			textResizeMode: 'fixed',
		},
		measureMono,
	);
	assertEqual(failures, 'fixed mode reports overflow', fixedOverflow.isOverflowing, true);

	const centered = layoutText(
		{
			text: 'AB',
			width: 100,
			height: 40,
			fontSize: 16,
			textResizeMode: 'fixed',
			textAlign: 'center',
		},
		measureMono,
	);
	assert(failures, 'center alignment shifts line x', centered.lines[0].x > 4);

	const spacingNone = layoutText(
		{
			text: 'ABCD',
			width: 200,
			height: 40,
			fontSize: 16,
			textResizeMode: 'auto-width',
			letterSpacingPx: 0,
		},
		measureMono,
	);
	const spacingWide = layoutText(
		{
			text: 'ABCD',
			width: 200,
			height: 40,
			fontSize: 16,
			textResizeMode: 'auto-width',
			letterSpacingPx: 2,
		},
		measureMono,
	);
	assert(failures, 'letter spacing increases measured content width', spacingWide.contentWidth > spacingNone.contentWidth);

	return {
		passed: failures.length === 0,
		failures,
	};
};

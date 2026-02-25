import React from 'react';
import type { Document, MaskSettings, Node } from '../../core/doc/types';
import { colors, radii, spacing, typography } from '../design-system';
import { SelectField } from '../controls/SelectField';

interface MaskSectionProps {
	node: Node;
	document: Document;
	onChange: (nextMask: MaskSettings | undefined) => void;
}

const MASKABLE_TYPES = new Set<Node['type']>(['rectangle', 'ellipse', 'path', 'image', 'text', 'boolean']);

export const MaskSection: React.FC<MaskSectionProps> = ({ node, document, onChange }) => {
	const mask = node.mask;
	const enabled = mask?.enabled ?? false;
	const mode = mask?.mode ?? 'alpha';
	const sourceNodeId = mask?.sourceNodeId ?? '';
	const sourceOptions = React.useMemo(() => {
		const options = [{ value: '', label: 'No source selected' }];
		for (const candidate of Object.values(document.nodes)) {
			if (candidate.id === node.id) continue;
			if (!MASKABLE_TYPES.has(candidate.type)) continue;
			options.push({
				value: candidate.id,
				label: candidate.name?.trim() ? `${candidate.name} (${candidate.type})` : `${candidate.type} (${candidate.id.slice(0, 6)})`,
			});
		}
		return options;
	}, [document.nodes, node.id]);

	return (
		<div
			style={{
				display: 'grid',
				gap: spacing.sm,
				padding: spacing.sm,
				borderRadius: radii.md,
				border: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.tertiary,
			}}
		>
			<label style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, fontSize: typography.fontSize.md, color: colors.text.secondary }}>
				<input
					type="checkbox"
					checked={enabled}
					onChange={(event) =>
						onChange({
							enabled: event.target.checked,
							mode,
							sourceNodeId: sourceNodeId || undefined,
						})
					}
					style={{ accentColor: colors.accent.primary }}
				/>
				Enable mask
			</label>

			<SelectField
				label="Mask source"
				value={sourceNodeId}
				onChange={(nextSource) =>
					onChange({
						enabled,
						mode,
						sourceNodeId: nextSource || undefined,
					})
				}
				options={sourceOptions}
				disabled={!enabled}
				hint={!enabled ? 'Enable mask to choose a source node.' : undefined}
			/>

			<SelectField
				label="Mask mode"
				value={mode}
				onChange={(nextMode) =>
					onChange({
						enabled,
						mode: nextMode === 'luminance' ? 'luminance' : 'alpha',
						sourceNodeId: sourceNodeId || undefined,
					})
				}
				options={[
					{ value: 'alpha', label: 'Alpha' },
					{ value: 'luminance', label: 'Luminance' },
				]}
				disabled={!enabled}
			/>
		</div>
	);
};

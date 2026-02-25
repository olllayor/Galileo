import React from 'react';
import { colors, spacing, typography, radii } from './design-system';

export type FigmaImportFormValues = {
	fileOrUrl: string;
	nodeIds: string;
	token: string;
	importToNewPage: boolean;
};

type FigmaImportModalProps = {
	open: boolean;
	values: FigmaImportFormValues;
	onChange: (next: FigmaImportFormValues) => void;
	onClose: () => void;
	onSubmit: () => void;
	isImporting: boolean;
	errorMessage: string | null;
};

const fieldStyle: React.CSSProperties = {
	width: '100%',
	padding: `${spacing.sm} ${spacing.md}`,
	borderRadius: radii.md,
	border: `1px solid ${colors.border.default}`,
	backgroundColor: colors.bg.tertiary,
	color: colors.text.primary,
	fontSize: typography.fontSize.md,
	outline: 'none',
};

export const FigmaImportModal: React.FC<FigmaImportModalProps> = ({
	open,
	values,
	onChange,
	onClose,
	onSubmit,
	isImporting,
	errorMessage,
}) => {
	if (!open) return null;

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				backgroundColor: 'rgba(0, 0, 0, 0.45)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 1700,
			}}
			onClick={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				onClick={(event) => event.stopPropagation()}
				style={{
					width: 'min(560px, calc(100vw - 32px))',
					backgroundColor: colors.bg.secondary,
					border: `1px solid ${colors.border.default}`,
					borderRadius: radii.lg,
					padding: spacing.lg,
					display: 'grid',
					gap: spacing.md,
				}}
			>
				<div style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold }}>
					Import From Figma
				</div>
				<div style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
					Best editable fidelity: paste from the Figma Bridge plugin. PAT import is a secondary path.
				</div>
				<label style={{ display: 'grid', gap: spacing.xs, fontSize: typography.fontSize.sm }}>
					<span>Figma file URL or key</span>
					<input
						type="text"
						value={values.fileOrUrl}
						onChange={(event) => onChange({ ...values, fileOrUrl: event.target.value })}
						placeholder="https://www.figma.com/file/... or AbCDef123"
						style={fieldStyle}
					/>
				</label>
				<label style={{ display: 'grid', gap: spacing.xs, fontSize: typography.fontSize.sm }}>
					<span>Node IDs (optional, comma separated)</span>
					<input
						type="text"
						value={values.nodeIds}
						onChange={(event) => onChange({ ...values, nodeIds: event.target.value })}
						placeholder="12:34,56:78"
						style={fieldStyle}
					/>
				</label>
				<label style={{ display: 'grid', gap: spacing.xs, fontSize: typography.fontSize.sm }}>
					<span>Personal Access Token (session-only)</span>
					<input
						type="password"
						value={values.token}
						onChange={(event) => onChange({ ...values, token: event.target.value })}
						placeholder="figd_..."
						style={fieldStyle}
					/>
				</label>
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.sm,
						fontSize: typography.fontSize.sm,
					}}
				>
					<input
						type="checkbox"
						checked={values.importToNewPage}
						onChange={(event) => onChange({ ...values, importToNewPage: event.target.checked })}
					/>
					<span>Import to new page</span>
				</label>
				{errorMessage ? (
					<div style={{ color: colors.semantic.error, fontSize: typography.fontSize.sm }}>{errorMessage}</div>
				) : null}
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm }}>
					<button
						type="button"
						onClick={onClose}
						disabled={isImporting}
						style={{
							padding: `${spacing.sm} ${spacing.md}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							cursor: isImporting ? 'not-allowed' : 'pointer',
						}}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onSubmit}
						disabled={isImporting}
						style={{
							padding: `${spacing.sm} ${spacing.md}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.accent.primary}`,
							backgroundColor: colors.accent.primary,
							color: colors.text.primary,
							cursor: isImporting ? 'not-allowed' : 'pointer',
						}}
					>
						{isImporting ? 'Importing...' : 'Import'}
					</button>
				</div>
			</div>
		</div>
	);
};

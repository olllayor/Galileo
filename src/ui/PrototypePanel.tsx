import React from 'react';
import type {
	PrototypeAction,
	PrototypeInteraction,
	PrototypePageGraph,
	PrototypeTransition,
	PrototypeTrigger,
} from '../core/doc/types';
import { colors, panels, radii, spacing, transitions, typography } from './design-system';
import { SelectField } from './controls/SelectField';

interface FrameOption {
	id: string;
	name: string;
}

interface PrototypePanelProps {
	pageId: string;
	width?: number;
	collapsed?: boolean;
	isResizing?: boolean;
	onToggleCollapsed?: () => void;
	frames: FrameOption[];
	selectedFrameId: string | null;
	pagePrototype?: PrototypePageGraph;
	onSetStartFrame: (pageId: string, frameId?: string) => void;
	onSetInteraction: (
		pageId: string,
		sourceFrameId: string,
		trigger: PrototypeTrigger,
		interaction?: PrototypeInteraction,
	) => void;
	onLaunchPreview: () => void;
}

const TRANSITION_OPTIONS: Array<{ value: PrototypeTransition; label: string }> = [
	{ value: 'instant', label: 'Instant' },
	{ value: 'dissolve', label: 'Dissolve' },
	{ value: 'slide-left', label: 'Slide Left' },
	{ value: 'slide-right', label: 'Slide Right' },
	{ value: 'slide-up', label: 'Slide Up' },
	{ value: 'slide-down', label: 'Slide Down' },
];

const ACTION_OPTIONS: Array<{ value: PrototypeAction; label: string }> = [
	{ value: 'navigate', label: 'Navigate' },
	{ value: 'overlay', label: 'Open Overlay' },
	{ value: 'open-link', label: 'Open Link' },
	{ value: 'back', label: 'Back' },
];

const TRIGGER_LABELS: Record<PrototypeTrigger, string> = {
	click: 'On Click',
	hover: 'On Hover',
	key: 'On Key Press',
	delay: 'After Delay',
	drag: 'On Drag',
};

const PanelSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
	<div
		style={{
			padding: spacing.md,
			borderBottom: `1px solid ${colors.border.subtle}`,
		}}
	>
		<div
			style={{
				fontSize: typography.fontSize.sm,
				color: colors.text.secondary,
				textTransform: 'uppercase',
				letterSpacing: '0.06em',
				marginBottom: spacing.sm,
			}}
		>
			{title}
		</div>
		{children}
	</div>
);

const buttonStyle: React.CSSProperties = {
	width: '100%',
	padding: `8px ${spacing.sm}`,
	borderRadius: radii.sm,
	border: `1px solid ${colors.border.focus}`,
	backgroundColor: colors.bg.active,
	color: colors.text.primary,
	fontSize: typography.fontSize.sm,
	cursor: 'pointer',
	transition: `background-color ${transitions.fast}`,
};

const TriggerRow: React.FC<{
	trigger: PrototypeTrigger;
	sourceFrameId: string;
	frames: FrameOption[];
	interaction?: PrototypeInteraction;
	onSetInteraction: (
		sourceFrameId: string,
		trigger: PrototypeTrigger,
		interaction?: PrototypeInteraction,
	) => void;
}> = ({ trigger, sourceFrameId, frames, interaction, onSetInteraction }) => {
	const action = interaction?.action ?? 'navigate';
	const targetFrameId = interaction?.targetFrameId ?? '';
	const transition = interaction?.transition ?? 'instant';
	const keyValue = interaction?.key ?? '';
	const delayMs = interaction?.delayMs ?? 300;

	const applyPatch = (patch: Partial<PrototypeInteraction>) => {
		onSetInteraction(sourceFrameId, trigger, {
			transition,
			action,
			...interaction,
			...patch,
		});
	};

	const needsTarget = action === 'navigate' || action === 'overlay';
	const canUseTransition = action === 'navigate' || action === 'overlay' || action === 'back';

	return (
		<div style={{ marginBottom: spacing.md }}>
			<div
				style={{
					fontSize: typography.fontSize.xs,
					color: colors.text.tertiary,
					marginBottom: spacing.xs,
					textTransform: 'uppercase',
					letterSpacing: '0.04em',
				}}
			>
				{TRIGGER_LABELS[trigger]}
			</div>

			<SelectField
				label="Action"
				value={action}
				onChange={(nextAction) => {
					const actionValue = nextAction as PrototypeAction;
					const basePatch: Partial<PrototypeInteraction> = {
						action: actionValue,
						targetFrameId: actionValue === 'navigate' || actionValue === 'overlay' ? interaction?.targetFrameId : undefined,
						url: actionValue === 'open-link' ? interaction?.url ?? '' : undefined,
					};
					applyPatch(basePatch);
				}}
				options={ACTION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
			/>

			<div style={{ height: spacing.sm }} />

			{needsTarget && (
				<>
					<SelectField
						label="Destination"
						value={targetFrameId}
						onChange={(value) => {
							if (!value) {
								onSetInteraction(sourceFrameId, trigger, undefined);
								return;
							}
							applyPatch({ targetFrameId: value });
						}}
						options={[{ value: '', label: 'No destination' }, ...frames.map((frame) => ({ value: frame.id, label: frame.name }))]}
					/>
					<div style={{ height: spacing.sm }} />
				</>
			)}

			{action === 'open-link' && (
				<>
					<label
						style={{
							display: 'block',
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							marginBottom: '4px',
						}}
					>
						URL
					</label>
					<input
						type="text"
						value={interaction?.url ?? ''}
						onChange={(event) => applyPatch({ url: event.target.value })}
						placeholder="https://example.com"
						style={{
							width: '100%',
							padding: spacing.xs,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.sm,
							fontSize: typography.fontSize.md,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
						}}
					/>
					<div style={{ height: spacing.sm }} />
				</>
			)}

			{trigger === 'key' && (
				<>
					<label
						style={{
							display: 'block',
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							marginBottom: '4px',
						}}
					>
						Key
					</label>
					<input
						type="text"
						value={keyValue}
						onChange={(event) => applyPatch({ key: event.target.value })}
						placeholder="Enter key (e.g. Enter, ArrowRight)"
						style={{
							width: '100%',
							padding: spacing.xs,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.sm,
							fontSize: typography.fontSize.md,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
						}}
					/>
					<div style={{ height: spacing.sm }} />
				</>
			)}

			{trigger === 'delay' && (
				<>
					<label
						style={{
							display: 'block',
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							marginBottom: '4px',
						}}
					>
						Delay (ms)
					</label>
					<input
						type="number"
						min={0}
						value={delayMs}
						onChange={(event) => applyPatch({ delayMs: Math.max(0, Number(event.target.value) || 0) })}
						style={{
							width: '100%',
							padding: spacing.xs,
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.sm,
							fontSize: typography.fontSize.md,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
						}}
					/>
					<div style={{ height: spacing.sm }} />
				</>
			)}

			<SelectField
				label="Transition"
				value={transition}
				onChange={(nextTransition) => applyPatch({ transition: nextTransition as PrototypeTransition })}
				disabled={!canUseTransition}
				hint={!canUseTransition ? 'Transition not used for this action.' : undefined}
				options={TRANSITION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
			/>
		</div>
	);
};

export const PrototypePanel: React.FC<PrototypePanelProps> = ({
	pageId,
	width = panels.right.width,
	collapsed = false,
	isResizing = false,
	onToggleCollapsed,
	frames,
	selectedFrameId,
	pagePrototype,
	onSetStartFrame,
	onSetInteraction,
	onLaunchPreview,
}) => {
	const selectedFrame = selectedFrameId ? frames.find((frame) => frame.id === selectedFrameId) ?? null : null;
	const selectedInteractions =
		selectedFrameId && pagePrototype?.interactionsBySource
			? pagePrototype.interactionsBySource[selectedFrameId]
			: undefined;

	if (collapsed) {
		return (
			<div
				style={{
					width: `${panels.right.collapsedWidth}px`,
					borderLeft: `1px solid ${colors.border.subtle}`,
					backgroundColor: colors.bg.secondary,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: spacing.sm,
					transition: isResizing ? 'none' : `width ${transitions.normal}`,
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Expand Prototype Panel"
					style={{
						width: '28px',
						height: '28px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.md,
						cursor: 'pointer',
						color: colors.text.secondary,
						fontSize: '14px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M15 18l-6-6 6-6" />
					</svg>
				</button>
			</div>
		);
	}

	return (
		<div
			style={{
				width: `${width}px`,
				borderLeft: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.secondary,
				display: 'flex',
				flexDirection: 'column',
				transition: isResizing ? 'none' : `width ${transitions.normal}`,
			}}
		>
			<div
				style={{
					height: '32px',
					padding: `0 ${spacing.sm}`,
					borderBottom: `1px solid ${colors.border.subtle}`,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<div style={{ color: colors.text.primary, fontSize: typography.fontSize.sm, fontWeight: 600 }}>Prototype</div>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Collapse Prototype Panel"
					style={{
						backgroundColor: 'transparent',
						border: 'none',
						color: colors.text.tertiary,
						cursor: 'pointer',
						padding: '2px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 6l6 6-6 6" />
					</svg>
				</button>
			</div>

			<PanelSection title="Flow Start">
				<SelectField
					label="Start Frame"
					value={pagePrototype?.startFrameId ?? ''}
					onChange={(value) => onSetStartFrame(pageId, value || undefined)}
					options={[{ value: '', label: 'None' }, ...frames.map((frame) => ({ value: frame.id, label: frame.name }))]}
				/>
			</PanelSection>

			<PanelSection title="Interactions">
				{selectedFrame ? (
					<>
						<div
							style={{
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
								marginBottom: spacing.sm,
							}}
						>
							Editing: <span style={{ color: colors.text.primary }}>{selectedFrame.name}</span>
						</div>
						{(['click', 'hover', 'key', 'delay', 'drag'] as const).map((trigger) => (
							<TriggerRow
								key={trigger}
								trigger={trigger}
								sourceFrameId={selectedFrame.id}
								frames={frames}
								interaction={selectedInteractions?.[trigger]}
								onSetInteraction={(sourceFrameId, triggerId, interaction) =>
									onSetInteraction(pageId, sourceFrameId, triggerId, interaction)
								}
							/>
						))}
					</>
				) : (
					<div style={{ color: colors.text.tertiary, fontSize: typography.fontSize.sm }}>
						Select a frame on canvas to edit interactions.
					</div>
				)}
			</PanelSection>

			<div style={{ padding: spacing.md }}>
				<button type="button" onClick={onLaunchPreview} style={buttonStyle}>
					Play Preview
				</button>
			</div>
		</div>
	);
};

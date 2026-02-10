import React from 'react';
import type { PrototypeInteraction, PrototypePageGraph, PrototypeTransition } from '../core/doc/types';
import { colors, panels, radii, spacing, transitions, typography } from './design-system';

type PrototypeTrigger = 'click' | 'hover';

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

const labelStyle: React.CSSProperties = {
	display: 'block',
	fontSize: typography.fontSize.sm,
	color: colors.text.tertiary,
	marginBottom: spacing.xs,
};

const selectStyle: React.CSSProperties = {
	width: '100%',
	backgroundColor: colors.bg.tertiary,
	border: `1px solid ${colors.border.subtle}`,
	borderRadius: radii.sm,
	color: colors.text.primary,
	fontSize: typography.fontSize.sm,
	padding: `6px ${spacing.sm}`,
	outline: 'none',
};

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
	const targetFrameId = interaction?.targetFrameId ?? '';
	const transition = interaction?.transition ?? 'instant';

	return (
		<div style={{ marginBottom: spacing.md }}>
			<div style={labelStyle}>{trigger === 'click' ? 'On Click' : 'On Hover'}</div>
			<select
				value={targetFrameId}
				onChange={(event) => {
					const value = event.target.value;
					if (!value) {
						onSetInteraction(sourceFrameId, trigger, undefined);
						return;
					}
					onSetInteraction(sourceFrameId, trigger, {
						targetFrameId: value,
						transition,
					});
				}}
				style={selectStyle}
			>
				<option value="">No destination</option>
				{frames.map((frame) => (
					<option key={frame.id} value={frame.id}>
						{frame.name}
					</option>
				))}
			</select>
			<div style={{ height: spacing.sm }} />
			<select
				value={transition}
				onChange={(event) => {
					if (!targetFrameId) return;
					onSetInteraction(sourceFrameId, trigger, {
						targetFrameId,
						transition: event.target.value as PrototypeTransition,
					});
				}}
				disabled={!targetFrameId}
				style={{
					...selectStyle,
					opacity: targetFrameId ? 1 : 0.5,
				}}
			>
				{TRANSITION_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
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
				<label style={labelStyle}>Start Frame</label>
				<select
					value={pagePrototype?.startFrameId ?? ''}
					onChange={(event) => onSetStartFrame(pageId, event.target.value || undefined)}
					style={selectStyle}
				>
					<option value="">None</option>
					{frames.map((frame) => (
						<option key={frame.id} value={frame.id}>
							{frame.name}
						</option>
					))}
				</select>
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
						<TriggerRow
							trigger="click"
							sourceFrameId={selectedFrame.id}
							frames={frames}
							interaction={selectedInteractions?.click}
							onSetInteraction={(sourceFrameId, trigger, interaction) =>
								onSetInteraction(pageId, sourceFrameId, trigger, interaction)
							}
						/>
						<TriggerRow
							trigger="hover"
							sourceFrameId={selectedFrame.id}
							frames={frames}
							interaction={selectedInteractions?.hover}
							onSetInteraction={(sourceFrameId, trigger, interaction) =>
								onSetInteraction(pageId, sourceFrameId, trigger, interaction)
							}
						/>
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

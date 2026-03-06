import React, { useEffect, useRef, useState } from 'react';
import { colors, spacing, typography, radii, transitions } from './design-system';
import type { AIAssistantStatus, AIImageSize } from '../ai/contracts';
import type { ImageModelOption, TextModelOption } from '../ai/model-catalog';

export type AIPanelMode = 'edit' | 'image';
export type AIImageIntent = 'generate' | 'edit';

type AIImagePreview = {
	intent: AIImageIntent;
	beforeImage?: { mimeType: string; base64: string; width: number; height: number };
	afterImages: Array<{ mimeType: string; base64: string; width: number; height: number }>;
};

interface AIPanelProps {
	mode: AIPanelMode;
	onModeChange: (mode: AIPanelMode) => void;
	status: AIAssistantStatus;
	selectionCount: number;
	summary: string;
	warnings: string[];
	errorMessage: string | null;
	proposedChanges: string[];
	imageIntent: AIImageIntent;
	onImageIntentChange: (intent: AIImageIntent) => void;
	enableImageEditFeature: boolean;
	enableImageEdit: boolean;
	imagePreview: AIImagePreview | null;
	textModels: TextModelOption[];
	imageModels: ImageModelOption[];
	selectedTextModelId: string;
	selectedImageModelId: string;
	selectedImageSize: AIImageSize;
	enableModelPicker: boolean;
	onSelectTextModel: (modelId: string) => void;
	onSelectImageModel: (modelId: string) => void;
	onSelectImageSize: (size: AIImageSize) => void;
	onRunEdit: (prompt: string, signal: AbortSignal, modelId?: string) => Promise<void>;
	onRunImage: (
		prompt: string,
		signal: AbortSignal,
		options?: { modelId?: string; size?: AIImageSize; intent?: AIImageIntent },
	) => Promise<void>;
	onPreview: () => void;
	onApply: () => void;
	onReject: () => void;
	onOpenProperties: () => void;
}

const statusLabel: Record<AIAssistantStatus, string> = {
	idle: 'Idle',
	generating: 'Generating',
	'preview-ready': 'Preview Ready',
	applied: 'Applied',
	error: 'Error',
};

const statusColor: Record<AIAssistantStatus, string> = {
	idle: colors.text.tertiary,
	generating: colors.accent.primary,
	'preview-ready': colors.semantic.success,
	applied: colors.semantic.success,
	error: colors.semantic.error,
};

const modeButtonStyle = (active: boolean): React.CSSProperties => ({
	border: active ? `1px solid ${colors.border.focus}` : `1px solid transparent`,
	backgroundColor: active ? colors.bg.tertiary : 'transparent',
	color: active ? colors.text.primary : colors.text.tertiary,
	fontSize: typography.fontSize.sm,
	padding: `3px ${spacing.sm}`,
	borderRadius: radii.md,
	cursor: 'pointer',
});

export const AIPanel: React.FC<AIPanelProps> = ({
	mode,
	onModeChange,
	status,
	selectionCount,
	summary,
	warnings,
	errorMessage,
	proposedChanges,
	imageIntent,
	onImageIntentChange,
	enableImageEditFeature,
	enableImageEdit,
	imagePreview,
	textModels,
	imageModels,
	selectedTextModelId,
	selectedImageModelId,
	selectedImageSize,
	enableModelPicker,
	onSelectTextModel,
	onSelectImageModel,
	onSelectImageSize,
	onRunEdit,
	onRunImage,
	onPreview,
	onApply,
	onReject,
	onOpenProperties,
}) => {
	const [prompt, setPrompt] = useState('');
	const abortRef = useRef<AbortController | null>(null);
	const activeImageIntent: AIImageIntent = enableImageEditFeature ? imageIntent : 'generate';
	const canRunImageEdit = mode !== 'image' || activeImageIntent !== 'edit' || enableImageEdit;

	useEffect(() => {
		if (status !== 'generating') {
			abortRef.current = null;
		}
	}, [status]);

	const handleRun = async () => {
		if (status === 'generating') return;
		const trimmed = prompt.trim();
		if (trimmed.length === 0) return;
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			if (mode === 'edit') {
				await onRunEdit(trimmed, controller.signal, enableModelPicker ? selectedTextModelId : undefined);
				return;
			}
			await onRunImage(
				trimmed,
				controller.signal,
				{
					modelId: enableModelPicker ? selectedImageModelId : undefined,
					size: selectedImageSize,
					intent: activeImageIntent,
				},
			);
		} catch {
			// App-level state handles errors.
		} finally {
			if (abortRef.current === controller) {
				abortRef.current = null;
			}
		}
	};

	const hasPreview = status === 'preview-ready';

	return (
		<div
			style={{
				height: '100%',
				overflow: 'auto',
				padding: spacing.md,
				display: 'flex',
				flexDirection: 'column',
				gap: spacing.md,
				backgroundColor: colors.bg.secondary,
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
				<div style={{ fontSize: typography.fontSize.lg, color: colors.text.primary, fontWeight: 600 }}>AI Assistant</div>
				<div style={{ fontSize: typography.fontSize.sm, color: statusColor[status] }}>{statusLabel[status]}</div>
			</div>

			<div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
				<button type="button" onClick={() => onModeChange('edit')} style={modeButtonStyle(mode === 'edit')}>
					Edit
				</button>
				<button type="button" onClick={() => onModeChange('image')} style={modeButtonStyle(mode === 'image')}>
					Image
				</button>
			</div>

			<div
				style={{
					padding: `${spacing.xs} ${spacing.sm}`,
					backgroundColor: colors.bg.tertiary,
					border: `1px solid ${colors.border.subtle}`,
					borderRadius: radii.md,
					fontSize: typography.fontSize.sm,
					color: colors.text.secondary,
				}}
			>
				{selectionCount} node{selectionCount === 1 ? '' : 's'} selected
			</div>

			{enableModelPicker && mode === 'edit' && (
				<label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
					<span style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>Text Model</span>
					<select
						value={selectedTextModelId}
						onChange={(event) => onSelectTextModel(event.target.value)}
						style={{
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.primary,
							color: colors.text.primary,
						}}
					>
						{textModels.map((model) => (
							<option key={model.id} value={model.id}>
								{model.label}
							</option>
						))}
					</select>
				</label>
			)}

			{mode === 'image' && enableImageEditFeature && (
				<>
					<div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
						<button
							type="button"
							onClick={() => onImageIntentChange('generate')}
							style={modeButtonStyle(imageIntent === 'generate')}
						>
							Generate
						</button>
						<button
							type="button"
							onClick={() => onImageIntentChange('edit')}
							disabled={!enableImageEdit}
							style={{
								...modeButtonStyle(imageIntent === 'edit'),
								opacity: enableImageEdit ? 1 : 0.45,
								cursor: enableImageEdit ? 'pointer' : 'not-allowed',
							}}
						>
							Edit Selected
						</button>
					</div>
					{enableModelPicker && (
						<>
							<label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
								<span style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>Image Model</span>
								<select
									value={selectedImageModelId}
									onChange={(event) => onSelectImageModel(event.target.value)}
									style={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radii.md,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.primary,
										color: colors.text.primary,
									}}
								>
									{imageModels.map((model) => (
										<option key={model.id} value={model.id}>
											{model.label}
										</option>
									))}
								</select>
							</label>
							<label style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
								<span style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>Image Size</span>
								<select
									value={selectedImageSize}
									onChange={(event) => onSelectImageSize(event.target.value as AIImageSize)}
									style={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radii.md,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.primary,
										color: colors.text.primary,
									}}
								>
									<option value="1024x1024">1024x1024</option>
									<option value="1536x1024">1536x1024</option>
									<option value="1024x1536">1024x1536</option>
								</select>
							</label>
						</>
					)}
					{activeImageIntent === 'edit' && !enableImageEdit && (
						<div
							style={{
								padding: spacing.sm,
								borderRadius: radii.md,
								backgroundColor: 'rgba(255, 159, 10, 0.08)',
								border: `1px solid rgba(255, 159, 10, 0.35)`,
								color: colors.text.secondary,
								fontSize: typography.fontSize.sm,
							}}
						>
							Select exactly one image layer to enable edit mode.
						</div>
					)}
				</>
			)}

			<textarea
				value={prompt}
				onChange={(event) => setPrompt(event.target.value)}
				placeholder={
					mode === 'edit'
						? 'Describe what to edit. Example: Make this title bold and move it 24px up.'
						: activeImageIntent === 'edit'
							? 'Describe how to edit the selected image. Example: Keep subject, replace background with warm sunset.'
							: 'Describe image to generate. Example: Soft gradient mesh background with abstract blobs.'
				}
				style={{
					minHeight: '116px',
					resize: 'vertical',
					padding: spacing.sm,
					borderRadius: radii.md,
					border: `1px solid ${colors.border.default}`,
					backgroundColor: colors.bg.primary,
					color: colors.text.primary,
					fontSize: typography.fontSize.md,
					lineHeight: 1.4,
					outline: 'none',
				}}
			/>

			<div style={{ display: 'flex', gap: spacing.xs }}>
				<button
					type="button"
					onClick={() => {
						void handleRun();
					}}
					disabled={status === 'generating' || prompt.trim().length === 0 || !canRunImageEdit}
					style={{
						flex: 1,
						padding: `${spacing.xs} ${spacing.sm}`,
						borderRadius: radii.md,
						border: 'none',
						cursor: status === 'generating' ? 'wait' : 'pointer',
						backgroundColor: colors.accent.primary,
						color: colors.text.primary,
						fontSize: typography.fontSize.md,
						transition: `opacity ${transitions.fast}`,
						opacity: status === 'generating' || prompt.trim().length === 0 || !canRunImageEdit ? 0.55 : 1,
					}}
				>
					{status === 'generating'
						? 'Running...'
						: mode === 'edit'
							? 'Run Edit'
							: activeImageIntent === 'edit'
								? 'Edit Selected Image'
								: 'Generate Image'}
				</button>
				{status === 'generating' && (
					<button
						type="button"
						onClick={() => abortRef.current?.abort()}
						style={{
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.primary,
							color: colors.text.secondary,
							cursor: 'pointer',
							fontSize: typography.fontSize.md,
						}}
					>
						Cancel
					</button>
				)}
			</div>

			{summary && (
				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.md,
						backgroundColor: colors.bg.tertiary,
						border: `1px solid ${colors.border.subtle}`,
					}}
				>
					<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: spacing.xs }}>
						Summary
					</div>
					<div style={{ fontSize: typography.fontSize.md, color: colors.text.secondary }}>{summary}</div>
				</div>
			)}

			{warnings.length > 0 && (
				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.md,
						backgroundColor: 'rgba(255, 159, 10, 0.08)',
						border: `1px solid rgba(255, 159, 10, 0.35)`,
					}}
				>
					<div style={{ fontSize: typography.fontSize.xs, color: colors.semantic.warning, marginBottom: spacing.xs }}>
						Warnings
					</div>
					<ul style={{ margin: 0, paddingLeft: 16, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
						{warnings.map((warning, index) => (
							<li key={`${warning}-${index}`}>{warning}</li>
						))}
					</ul>
				</div>
			)}

			{errorMessage && (
				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.md,
						backgroundColor: 'rgba(255, 69, 58, 0.08)',
						border: `1px solid rgba(255, 69, 58, 0.35)`,
						color: colors.text.secondary,
						fontSize: typography.fontSize.sm,
					}}
				>
					{errorMessage}
				</div>
			)}

			{proposedChanges.length > 0 && (
				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.md,
						backgroundColor: colors.bg.tertiary,
						border: `1px solid ${colors.border.subtle}`,
					}}
				>
					<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: spacing.xs }}>
						Proposed Changes
					</div>
					<ul style={{ margin: 0, paddingLeft: 16, color: colors.text.secondary, fontSize: typography.fontSize.sm }}>
						{proposedChanges.map((change, index) => (
							<li key={`${change}-${index}`}>{change}</li>
						))}
					</ul>
				</div>
			)}

			{mode === 'image' && imagePreview && (
				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.md,
						backgroundColor: colors.bg.tertiary,
						border: `1px solid ${colors.border.subtle}`,
					}}
				>
					<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: spacing.xs }}>
						Image Preview
					</div>
					{imagePreview.intent === 'edit' && imagePreview.beforeImage && imagePreview.afterImages[0] && (
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs, marginBottom: spacing.sm }}>
							<div>
								<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: 4 }}>Before</div>
								<img
									alt="AI edit before"
									src={`data:${imagePreview.beforeImage.mimeType};base64,${imagePreview.beforeImage.base64}`}
									style={{ width: '100%', borderRadius: radii.sm, border: `1px solid ${colors.border.default}` }}
								/>
							</div>
							<div>
								<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: 4 }}>After</div>
								<img
									alt="AI edit after"
									src={`data:${imagePreview.afterImages[0].mimeType};base64,${imagePreview.afterImages[0].base64}`}
									style={{ width: '100%', borderRadius: radii.sm, border: `1px solid ${colors.border.focus}` }}
								/>
							</div>
						</div>
					)}
					{imagePreview.afterImages.length > 0 &&
						(imagePreview.intent === 'generate' || imagePreview.afterImages.length > 1) && (
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: spacing.xs }}>
							{imagePreview.afterImages.map((image, index) => (
								<div key={`preview-${index}`}>
									<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: 4 }}>
										Candidate {index + 1}
									</div>
									<img
										alt={`AI image candidate ${index + 1}`}
										src={`data:${image.mimeType};base64,${image.base64}`}
										style={{ width: '100%', borderRadius: radii.sm, border: `1px solid ${colors.border.default}` }}
									/>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{hasPreview && (
				<div style={{ display: 'flex', gap: spacing.xs }}>
					{mode === 'edit' && (
						<button
							type="button"
							onClick={onPreview}
							style={{
								flex: 1,
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radii.md,
								border: `1px solid ${colors.border.default}`,
								cursor: 'pointer',
								backgroundColor: colors.bg.primary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
							}}
						>
							Preview
						</button>
					)}
					<button
						type="button"
						onClick={onApply}
						style={{
							flex: 1,
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.md,
							border: 'none',
							cursor: 'pointer',
							backgroundColor: colors.semantic.success,
							color: colors.text.inverse,
							fontSize: typography.fontSize.md,
						}}
					>
						Apply
					</button>
					<button
						type="button"
						onClick={onReject}
						style={{
							flex: 1,
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.md,
							border: `1px solid ${colors.border.default}`,
							cursor: 'pointer',
							backgroundColor: colors.bg.primary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
						}}
					>
						Reject
					</button>
				</div>
			)}

			{status === 'applied' && (
				<button
					type="button"
					onClick={onOpenProperties}
					style={{
						padding: `${spacing.xs} ${spacing.sm}`,
						borderRadius: radii.md,
						border: `1px solid ${colors.border.default}`,
						backgroundColor: colors.bg.primary,
						color: colors.text.secondary,
						cursor: 'pointer',
						fontSize: typography.fontSize.sm,
					}}
				>
					Back to Properties
				</button>
			)}
		</div>
	);
};

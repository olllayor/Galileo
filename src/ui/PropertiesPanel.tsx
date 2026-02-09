import React from 'react';
import {
	LockOn,
	LockOff,
	AlignLeft,
	AlignHorizontalCenter,
	AlignRight,
	AlignTop,
	AlignVerticalCenter,
	AlignBottom,
	ArrowClockwise,
} from 'akar-icons';
import type {
	ComponentVariantMap,
	ConstraintAxisX,
	ConstraintAxisY,
	Constraints,
	ComponentOverridePatch,
	Document,
	Layout,
	LayoutGuideType,
	LayoutSizing,
	Node,
	ImageOutline,
	ShadowBlendMode,
	ShadowEffect,
} from '../core/doc/types';
import {
	ENABLE_AUTO_SHADOWS_V2,
	ENABLE_BOOLEAN_V1,
	ENABLE_SHADOWS_V1,
	createDefaultLayoutGuides,
	findParentNode,
	resolveShadowOverflow,
} from '../core/doc';
import { colors, spacing, typography, radii, transitions, panels } from './design-system';
import { ScrubbableNumberInput } from './ScrubbableNumberInput';
import { FontPickerModal } from './FontPickerModal';

interface PropertiesPanelProps {
	selectedNode: Node | null;
	document: Document;
	width?: number;
	collapsed?: boolean;
	isResizing?: boolean;
	onToggleCollapsed?: () => void;
	onUpdateNode: (id: string, updates: Partial<Node>) => void;
	onOpenPlugin?: (pluginId: string) => void;
	onRemoveBackground?: (id: string) => void;
	onClearBackground?: (id: string) => void;
	onUpdateImageOutline?: (id: string, updates: Partial<ImageOutline>) => void | Promise<void>;
	isRemovingBackground?: boolean;
	zoom?: number;
	onCopyEffects?: (nodeId: string) => void;
	onPasteEffects?: (nodeId: string) => void;
	canPasteEffects?: boolean;
	vectorTarget?: {
		pathId: string;
		closed: boolean;
		pointCount: number;
		selectedPointId: string | null;
	} | null;
	onToggleVectorClosed?: (pathId: string, closed: boolean) => void;
	textOverflow?: {
		isOverflowing: boolean;
	} | null;
	componentContext?: {
		instanceId: string;
		componentName: string;
		propertyOptions: Record<string, string[]>;
		currentVariant: ComponentVariantMap;
		isNestedSelection: boolean;
		selectedSourceNodeId?: string | null;
		selectedOverride?: ComponentOverridePatch;
		overrideCount: number;
	} | null;
	onSetComponentVariant?: (instanceId: string, variant: ComponentVariantMap) => void;
	onDetachComponentInstance?: (instanceId: string) => void;
	onResetComponentOverride?: (instanceId: string, sourceNodeId: string) => void;
	onResetAllComponentOverrides?: (instanceId: string) => void;
}

const defaultLayout: Layout = {
	type: 'auto',
	direction: 'row',
	gap: 8,
	padding: { top: 8, right: 8, bottom: 8, left: 8 },
	alignment: 'start',
	crossAlignment: 'center',
};

const DEFAULT_IMAGE_OUTLINE = {
	color: '#ffffff',
	width: 12,
	blur: 0,
} as const;

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value));
};

const safeNumber = (value: number | undefined, fallback = 0): number => {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const safeRound = (value: number | undefined, fallback = 0): number => {
	return Math.round(safeNumber(value, fallback));
};

const isHexColor = (value: string | undefined): boolean => {
	if (typeof value !== 'string') return false;
	return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
};

const createDefaultShadowEffect = (type: 'drop' | 'inner' | 'auto'): ShadowEffect => {
	if (type === 'auto') {
		return {
			type: 'auto',
			elevation: 6,
			angle: 90,
			distance: 18,
			softness: 55,
			color: '#000000',
			opacity: 0.28,
			blendMode: 'normal',
			enabled: true,
			bindings: {},
		};
	}
	if (type === 'inner') {
		return {
			type: 'inner',
			x: 0,
			y: 1,
			blur: 4,
			spread: 0,
			color: '#000000',
			opacity: 0.2,
			blendMode: 'normal',
			enabled: true,
		};
	}
	return {
		type: 'drop',
		x: 0,
		y: 8,
		blur: 24,
		spread: 0,
		color: '#000000',
		opacity: 0.24,
		blendMode: 'normal',
		enabled: true,
	};
};

type AutoShadowBindingField = 'elevation' | 'angle' | 'distance' | 'softness' | 'color' | 'opacity' | 'blendMode';
type EffectVariableRow = { key: string; value: string };

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
	selectedNode,
	document,
	width = panels.right.width,
	collapsed = false,
	isResizing = false,
	onToggleCollapsed,
	onUpdateNode,
	onOpenPlugin,
	onRemoveBackground,
	onClearBackground,
	onUpdateImageOutline,
	isRemovingBackground = false,
	zoom = 1,
	onCopyEffects,
	onPasteEffects,
	canPasteEffects = false,
	vectorTarget = null,
	onToggleVectorClosed,
	textOverflow = null,
	componentContext = null,
	onSetComponentVariant,
	onDetachComponentInstance,
	onResetComponentOverride,
	onResetAllComponentOverrides,
}) => {
	const [draggedEffectIndex, setDraggedEffectIndex] = React.useState<number | null>(null);
	const [fontPickerOpen, setFontPickerOpen] = React.useState(false);
	const [fontPickerAnchorRect, setFontPickerAnchorRect] = React.useState<DOMRect | null>(null);
	const fontPickerTriggerRef = React.useRef<HTMLButtonElement | null>(null);

	React.useEffect(() => {
		if (selectedNode?.type !== 'text' && fontPickerOpen) {
			setFontPickerOpen(false);
		}
	}, [selectedNode?.type, fontPickerOpen]);

	React.useEffect(() => {
		if (!fontPickerOpen) return;
		const updateAnchor = () => {
			setFontPickerAnchorRect(fontPickerTriggerRef.current?.getBoundingClientRect() ?? null);
		};
		updateAnchor();
		window.addEventListener('resize', updateAnchor);
		window.addEventListener('scroll', updateAnchor, true);
		return () => {
			window.removeEventListener('resize', updateAnchor);
			window.removeEventListener('scroll', updateAnchor, true);
		};
	}, [fontPickerOpen]);

	// Collapsed rail mode
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
					title="Expand Properties"
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
				<div
					style={{
						marginTop: spacing.sm,
						width: '28px',
						height: '28px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: colors.bg.active,
						borderRadius: radii.md,
						fontSize: typography.fontSize.xs,
						fontWeight: typography.fontWeight.semibold,
						color: colors.text.secondary,
					}}
					title="Properties"
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M12 3v18M3 12h18M5.3 5.3l13.4 13.4M18.7 5.3L5.3 18.7" />
					</svg>
				</div>
				{selectedNode && (
					<div
						style={{
							marginTop: spacing.sm,
							width: '24px',
							height: '24px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: colors.accent.primary,
							borderRadius: radii.md,
							fontSize: typography.fontSize.xs,
							fontWeight: typography.fontWeight.semibold,
							color: colors.text.primary,
						}}
						title={selectedNode.type}
					>
						{selectedNode.type.charAt(0).toUpperCase()}
					</div>
				)}
			</div>
		);
	}

	if (!selectedNode) {
		return (
			<div
				style={{
					width: `${width}px`,
					padding: spacing.md,
					backgroundColor: colors.bg.secondary,
					borderLeft: `1px solid ${colors.border.subtle}`,
					overflowY: 'auto',
					transition: isResizing ? 'none' : `width ${transitions.normal}`,
				}}
			>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						marginBottom: spacing.lg,
					}}
				>
					<span
						style={{
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							color: colors.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: '0.5px',
						}}
					>
						Design
					</span>
					<button
						type="button"
						onClick={onToggleCollapsed}
						title="Collapse panel"
						style={{
							width: '20px',
							height: '20px',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							backgroundColor: 'transparent',
							border: 'none',
							borderRadius: radii.sm,
							cursor: 'pointer',
							color: colors.text.tertiary,
							fontSize: '12px',
						}}
					>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M9 18l6-6-6-6" />
						</svg>
					</button>
				</div>
				<p
					style={{
						color: colors.text.tertiary,
						fontSize: typography.fontSize.md,
						textAlign: 'center',
						marginTop: '80px',
					}}
				>
					Select a layer to see its properties
				</p>
			</div>
		);
	}

	const parentNode = findParentNode(document, selectedNode.id);
	const supportsConstraints =
		parentNode?.type === 'frame' && parentNode.id !== document.rootId && !parentNode.layout;
	const currentConstraints: Constraints = selectedNode.constraints ?? { horizontal: 'left', vertical: 'top' };
	const imageMeta = selectedNode.type === 'image' ? selectedNode.image?.meta : undefined;
	const is3dIcon = imageMeta?.kind === '3d-icon';
	const isUnsplashPhoto = imageMeta?.kind === 'unsplash';
	const isIconifyIcon = imageMeta?.kind === 'iconify-icon';
	const hasBgMask = selectedNode.type === 'image' && Boolean(selectedNode.image?.maskAssetId);
	const bgRemoveMeta = selectedNode.type === 'image' ? selectedNode.image?.bgRemoveMeta : undefined;
	const imageOutline = selectedNode.type === 'image' ? selectedNode.image?.outline : undefined;
	const booleanData = selectedNode.type === 'boolean' ? selectedNode.booleanData : undefined;
	const outlineEnabled = imageOutline?.enabled === true;
	const outlineColor = isHexColor(imageOutline?.color) ? (imageOutline?.color as string) : DEFAULT_IMAGE_OUTLINE.color;
	const outlineWidth = safeNumber(imageOutline?.width, DEFAULT_IMAGE_OUTLINE.width);
	const outlineBlur = safeNumber(imageOutline?.blur, DEFAULT_IMAGE_OUTLINE.blur);
	const outlineControlsDisabled = isRemovingBackground || !hasBgMask;

	const handleInputChange = (field: keyof Node, value: unknown) => {
		onUpdateNode(selectedNode.id, { [field]: value });
	};

	const handleNestedInputChange = (parent: 'position' | 'size', field: string, value: number) => {
		const current = selectedNode[parent];
		if (!current || Number.isNaN(value)) return;

		// Handle aspect ratio lock for size changes
		if (parent === 'size' && selectedNode.aspectRatioLocked) {
			const currentSize = selectedNode.size;
			const aspectRatio = currentSize.width / currentSize.height;

			if (field === 'width') {
				const newHeight = value / aspectRatio;
				onUpdateNode(selectedNode.id, {
					size: { width: value, height: Math.max(1, Math.round(newHeight)) },
				});
				return;
			} else if (field === 'height') {
				const newWidth = value * aspectRatio;
				onUpdateNode(selectedNode.id, {
					size: { width: Math.max(1, Math.round(newWidth)), height: value },
				});
				return;
			}
		}

		onUpdateNode(selectedNode.id, {
			[parent]: { ...current, [field]: value },
		});
	};

	const handleLayoutToggle = (enabled: boolean) => {
		if (enabled) {
			const baseLayout = selectedNode.layout || defaultLayout;
			onUpdateNode(selectedNode.id, {
				layout: {
					...baseLayout,
					padding: { ...baseLayout.padding },
				},
			});
		} else {
			onUpdateNode(selectedNode.id, { layout: undefined });
		}
	};

	const handleLayoutChange = (updates: Partial<Layout>) => {
		const baseLayout = selectedNode.layout || defaultLayout;
		const nextLayout = {
			...baseLayout,
			...updates,
			padding: { ...baseLayout.padding },
		};
		onUpdateNode(selectedNode.id, { layout: nextLayout });
	};

	const handlePaddingChange = (field: keyof Layout['padding'], value: number) => {
		if (Number.isNaN(value)) return;
		const nextLayout = selectedNode.layout || defaultLayout;
		onUpdateNode(selectedNode.id, {
			layout: {
				...nextLayout,
				padding: {
					...nextLayout.padding,
					[field]: value,
				},
			},
		});
	};

	const handleAlign = (axis: 'horizontal' | 'vertical', alignment: 'start' | 'center' | 'end') => {
		if (!parentNode) return;
		const parentSize = parentNode.size;
		const size = selectedNode.size;
		const position = { ...selectedNode.position };

		if (axis === 'horizontal') {
			if (alignment === 'start') position.x = 0;
			if (alignment === 'center') position.x = (parentSize.width - size.width) / 2;
			if (alignment === 'end') position.x = parentSize.width - size.width;
		} else {
			if (alignment === 'start') position.y = 0;
			if (alignment === 'center') position.y = (parentSize.height - size.height) / 2;
			if (alignment === 'end') position.y = parentSize.height - size.height;
		}

		onUpdateNode(selectedNode.id, { position });
	};

	const defaultFill = selectedNode.type === 'text' ? '#f5f5f5' : '#888888';
	const effectiveOpacity = safeNumber(selectedNode.opacity, 1);
	const rotationValue = safeNumber(selectedNode.rotation, 0);
	const layout = selectedNode.layout;
	const parentLayout = parentNode?.layout;
	const layoutSizing: LayoutSizing = selectedNode.layoutSizing ?? { horizontal: 'fixed', vertical: 'fixed' };
	const layoutGuides = selectedNode.layoutGuides;
	const hasLayoutGuides = Boolean(layoutGuides);
	const layoutGuideType = layoutGuides?.type ?? 'grid';
	const effects = selectedNode.effects ?? [];
	const enabledEffectsCount = effects.filter((effect) => effect.enabled !== false).length;
	const shadowOverflow = selectedNode.type === 'frame' ? resolveShadowOverflow(selectedNode) : 'visible';
	const effectVariables = selectedNode.effectVariables ?? {};
	const effectVariableRows: EffectVariableRow[] = Object.entries(effectVariables).map(([key, value]) => ({
		key,
		value: String(value),
	}));

	const updateEffects = (nextEffects: ShadowEffect[]) => {
		handleInputChange('effects', nextEffects);
	};

	const addEffect = (type: 'drop' | 'inner' | 'auto') => {
		updateEffects([...effects, createDefaultShadowEffect(type)]);
	};

	const updateEffect = (index: number, updater: (effect: ShadowEffect) => ShadowEffect) => {
		updateEffects(effects.map((effect, i) => (i === index ? updater(effect) : effect)));
	};

	const updateEffectPatch = (index: number, updates: Partial<ShadowEffect>) => {
		updateEffect(index, (effect) => ({ ...effect, ...updates } as ShadowEffect));
	};

	const updateAutoBinding = (index: number, field: AutoShadowBindingField, bindingKey: string) => {
		updateEffect(index, (effect) => {
			if (effect.type !== 'auto') return effect;
			const current = effect.bindings ?? {};
			const trimmed = bindingKey.trim();
			const nextBindings =
				trimmed.length > 0
					? { ...current, [field]: trimmed }
					: Object.fromEntries(Object.entries(current).filter(([key]) => key !== field));
			return {
				...effect,
				bindings: Object.keys(nextBindings).length > 0 ? nextBindings : undefined,
			};
		});
	};

	const removeEffect = (index: number) => {
		updateEffects(effects.filter((_, i) => i !== index));
	};

	const reorderEffects = (fromIndex: number, toIndex: number) => {
		if (fromIndex === toIndex) return;
		const next = effects.slice();
		const [moved] = next.splice(fromIndex, 1);
		if (!moved) return;
		next.splice(toIndex, 0, moved);
		updateEffects(next);
	};

	const handleShadowOverflowChange = (value: 'visible' | 'clipped' | 'clip-content-only') => {
		handleInputChange('shadowOverflow', value);
		handleInputChange('clipContent', value !== 'visible');
	};

	const updateEffectVariable = (currentKey: string, nextKey: string, value: string) => {
		const trimmedCurrentKey = currentKey.trim();
		const trimmedNextKey = nextKey.trim();
		const baseEntries = Object.entries(effectVariables).filter(([key]) => key !== trimmedCurrentKey);
		if (!trimmedNextKey) {
			handleInputChange('effectVariables', baseEntries.length > 0 ? Object.fromEntries(baseEntries) : undefined);
			return;
		}
		const numericValue = Number(value);
		const normalizedValue = Number.isFinite(numericValue) && value.trim() !== '' ? numericValue : value;
		const next = Object.fromEntries([...baseEntries, [trimmedNextKey, normalizedValue]]);
		handleInputChange('effectVariables', next);
	};

	const addEffectVariable = () => {
		let index = 1;
		let candidate = `var${index}`;
		while (effectVariables[candidate] !== undefined) {
			index += 1;
			candidate = `var${index}`;
		}
		handleInputChange('effectVariables', { ...effectVariables, [candidate]: 0 });
	};

	return (
		<div
			style={{
				width: `${width}px`,
				padding: spacing.md,
				backgroundColor: colors.bg.secondary,
				borderLeft: `1px solid ${colors.border.subtle}`,
				overflowY: 'auto',
				transition: isResizing ? 'none' : `width ${transitions.normal}`,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: spacing.lg,
				}}
			>
				<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
					<span
						style={{
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							color: colors.text.secondary,
							textTransform: 'uppercase',
							letterSpacing: '0.5px',
						}}
					>
						Design
					</span>
					<span
						style={{
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							fontFamily: typography.fontFamily.mono,
						}}
					>
						{Math.round(zoom * 100)}%
					</span>
				</div>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Collapse panel"
					style={{
						width: '20px',
						height: '20px',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'transparent',
						border: 'none',
						borderRadius: radii.sm,
						cursor: 'pointer',
						color: colors.text.tertiary,
						fontSize: '12px',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</button>
			</div>

			{is3dIcon && imageMeta && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						3D Icon
					</h4>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: '1fr 1fr',
							gap: spacing.sm,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							marginBottom: spacing.sm,
						}}
					>
						<div>Provider: {imageMeta.provider}</div>
						<div>Style: {imageMeta.style}</div>
						<div>Angle: {imageMeta.angle}</div>
						<div>Size: {Math.round(imageMeta.size)}px</div>
					</div>
					<button
						type="button"
						onClick={() => onOpenPlugin?.('com.galileo.3dicons')}
						style={{
							width: '100%',
							padding: `${spacing.xs} ${spacing.sm}`,
							backgroundColor: colors.accent.primary,
							color: colors.text.primary,
							border: 'none',
							borderRadius: radii.sm,
							cursor: 'pointer',
							fontSize: typography.fontSize.sm,
							fontWeight: typography.fontWeight.medium,
							transition: `background-color ${transitions.fast}`,
						}}
					>
						Edit 3D Icon
					</button>
				</div>
			)}

			{isUnsplashPhoto && imageMeta && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Unsplash Attribution
					</h4>
					<div
						style={{
							display: 'grid',
							gap: spacing.xs,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
						}}
					>
						<div>Photographer: {imageMeta.photographerName}</div>
						<a
							href={imageMeta.photographerProfileUrl}
							target="_blank"
							rel="noreferrer noopener"
							style={{ color: colors.accent.primary, textDecoration: 'none' }}
						>
							View photographer profile
						</a>
						<a
							href={imageMeta.photoUnsplashUrl}
							target="_blank"
							rel="noreferrer noopener"
							style={{ color: colors.accent.primary, textDecoration: 'none' }}
						>
							View photo on Unsplash
						</a>
					</div>
				</div>
			)}

			{isIconifyIcon && imageMeta && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Iconify Icon
					</h4>
					<div
						style={{
							display: 'grid',
							gap: spacing.xs,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							marginBottom: spacing.sm,
						}}
					>
						<div>Icon: {imageMeta.icon}</div>
						<div>Set: {imageMeta.prefix}</div>
						{imageMeta.customizations?.color ? <div>Color: {imageMeta.customizations.color}</div> : null}
						{imageMeta.license?.title ? <div>License: {imageMeta.license.title}</div> : null}
						{imageMeta.author?.name ? <div>Author: {imageMeta.author.name}</div> : null}
					</div>
					<div style={{ display: 'grid', gap: spacing.xs }}>
						<button
							type="button"
							onClick={() => onOpenPlugin?.('com.galileo.iconify')}
							style={{
								width: '100%',
								padding: `${spacing.xs} ${spacing.sm}`,
								backgroundColor: colors.accent.primary,
								color: colors.text.primary,
								border: 'none',
								borderRadius: radii.sm,
								cursor: 'pointer',
								fontSize: typography.fontSize.sm,
								fontWeight: typography.fontWeight.medium,
								transition: `background-color ${transitions.fast}`,
							}}
						>
							Edit in Iconify
						</button>
						{imageMeta.license?.url ? (
							<a
								href={imageMeta.license.url}
								target="_blank"
								rel="noreferrer noopener"
								style={{ color: colors.accent.primary, textDecoration: 'none', fontSize: typography.fontSize.sm }}
							>
								View license
							</a>
						) : null}
						{imageMeta.author?.url ? (
							<a
								href={imageMeta.author.url}
								target="_blank"
								rel="noreferrer noopener"
								style={{ color: colors.accent.primary, textDecoration: 'none', fontSize: typography.fontSize.sm }}
							>
								View author
							</a>
						) : null}
					</div>
				</div>
			)}

			{ENABLE_BOOLEAN_V1 && selectedNode.type === 'boolean' && booleanData && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Boolean
					</h4>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Operation
							</label>
							<select
								value={booleanData.op}
								onChange={(event) =>
									onUpdateNode(selectedNode.id, {
										booleanData: {
											...booleanData,
											op: event.target.value as typeof booleanData.op,
										},
									})
								}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="union">Union</option>
								<option value="subtract">Subtract</option>
								<option value="intersect">Intersect</option>
								<option value="exclude">Exclude</option>
							</select>
						</div>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Tolerance
							</label>
							<input
								type="number"
								step="0.0001"
								min="0.0001"
								value={booleanData.tolerance}
								onChange={(event) =>
									onUpdateNode(selectedNode.id, {
										booleanData: {
											...booleanData,
											tolerance: Math.max(0.0001, Number(event.target.value) || 0.001),
										},
									})
								}
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
						</div>
					</div>
					<div
						style={{
							marginTop: spacing.sm,
							padding: spacing.sm,
							borderRadius: radii.sm,
							backgroundColor: colors.bg.tertiary,
							color: booleanData.status === 'ok' ? colors.text.secondary : '#ff8f8f',
							fontSize: typography.fontSize.sm,
						}}
					>
						Status: {booleanData.status === 'ok' ? 'Valid' : `Invalid (${booleanData.lastErrorCode ?? 'engine_error'})`}
					</div>
				</div>
			)}

			{componentContext && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Component
					</h4>
					<div
						style={{
							display: 'grid',
							gap: spacing.sm,
							padding: spacing.sm,
							borderRadius: radii.sm,
							backgroundColor: colors.bg.tertiary,
							marginBottom: spacing.sm,
						}}
					>
						<div style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>{componentContext.componentName}</div>
						<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>
							Overrides: {componentContext.overrideCount}
						</div>
						{componentContext.isNestedSelection && (
							<div style={{ fontSize: typography.fontSize.xs, color: colors.semantic.warning }}>
								Inspect mode: only override fields are editable in nested layers.
							</div>
						)}
					</div>

					<div style={{ display: 'grid', gap: spacing.sm, marginBottom: spacing.sm }}>
						{Object.entries(componentContext.propertyOptions).map(([property, options]) => (
							<div key={property}>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									{property}
								</label>
								<select
									value={componentContext.currentVariant[property] ?? ''}
									onChange={(event) =>
										onSetComponentVariant?.(componentContext.instanceId, {
											...componentContext.currentVariant,
											[property]: event.target.value,
										})
									}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									{options.map((option) => (
										<option key={`${property}-${option}`} value={option}>
											{option}
										</option>
									))}
								</select>
							</div>
						))}
					</div>

					<div style={{ display: 'flex', gap: spacing.sm }}>
						{componentContext.selectedSourceNodeId && (
							<button
								type="button"
								onClick={() =>
									onResetComponentOverride?.(componentContext.instanceId, componentContext.selectedSourceNodeId!)
								}
								style={{
									padding: `${spacing.xs} ${spacing.sm}`,
									borderRadius: radii.sm,
									border: `1px solid ${colors.border.default}`,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.secondary,
									fontSize: typography.fontSize.md,
									cursor: 'pointer',
									flex: 1,
								}}
							>
								Reset This Override
							</button>
						)}
						<button
							type="button"
							onClick={() => onResetAllComponentOverrides?.(componentContext.instanceId)}
							style={{
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
								flex: 1,
							}}
						>
							Reset All
						</button>
						<button
							type="button"
							onClick={() => onDetachComponentInstance?.(componentContext.instanceId)}
							style={{
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
								flex: 1,
							}}
						>
							Detach
						</button>
					</div>
				</div>
			)}

			{vectorTarget && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Vector Path
					</h4>
					<div
						style={{
							display: 'grid',
							gridTemplateColumns: '1fr 1fr',
							gap: spacing.sm,
							marginBottom: spacing.sm,
						}}
					>
						<div
							style={{
								padding: spacing.sm,
								borderRadius: radii.sm,
								backgroundColor: colors.bg.tertiary,
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
							}}
						>
							Points: {vectorTarget.pointCount}
						</div>
						<div
							style={{
								padding: spacing.sm,
								borderRadius: radii.sm,
								backgroundColor: colors.bg.tertiary,
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
								whiteSpace: 'nowrap',
								textOverflow: 'ellipsis',
								overflow: 'hidden',
							}}
						>
							Selected: {vectorTarget.selectedPointId ?? 'None'}
						</div>
					</div>
					<button
						type="button"
						onClick={() => onToggleVectorClosed?.(vectorTarget.pathId, !vectorTarget.closed)}
						disabled={vectorTarget.closed ? vectorTarget.pointCount < 3 : false}
						style={{
							width: '100%',
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.primary,
							cursor: vectorTarget.closed || vectorTarget.pointCount >= 3 ? 'pointer' : 'not-allowed',
							opacity: vectorTarget.closed || vectorTarget.pointCount >= 3 ? 1 : 0.5,
							fontSize: typography.fontSize.md,
						}}
					>
						{vectorTarget.closed ? 'Open Path' : 'Close Path'}
					</button>
				</div>
			)}

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Alignment
				</h4>
				<div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.lg }}>
					<div
						style={{
							display: 'flex',
							gap: '1px',
							backgroundColor: colors.border.subtle,
							padding: '1px',
							borderRadius: radii.md,
							flex: 1,
						}}
					>
						{(['start', 'center', 'end'] as const).map((alignment) => (
							<button
								key={`h-${alignment}`}
								type="button"
								onClick={() => handleAlign('horizontal', alignment)}
								disabled={!parentNode}
								title={`Align Horizontal ${alignment}`}
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									padding: spacing.xs,
									backgroundColor: colors.bg.tertiary,
									border: 'none',
									borderRadius: radii.sm,
									fontSize: typography.fontSize.sm,
									cursor: parentNode ? 'pointer' : 'not-allowed',
									opacity: parentNode ? 1 : 0.4,
									height: '26px',
									color: colors.text.secondary,
								}}
							>
								{alignment === 'start' && <AlignLeft size={14} />}
								{alignment === 'center' && <AlignHorizontalCenter size={14} />}
								{alignment === 'end' && <AlignRight size={14} />}
							</button>
						))}
					</div>

					<div
						style={{
							display: 'flex',
							gap: '1px',
							backgroundColor: colors.border.subtle,
							padding: '1px',
							borderRadius: radii.md,
							flex: 1,
						}}
					>
						{(['start', 'center', 'end'] as const).map((alignment) => (
							<button
								key={`v-${alignment}`}
								type="button"
								onClick={() => handleAlign('vertical', alignment)}
								disabled={!parentNode}
								title={`Align Vertical ${alignment}`}
								style={{
									flex: 1,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									padding: spacing.xs,
									backgroundColor: colors.bg.tertiary,
									border: 'none',
									borderRadius: radii.sm,
									fontSize: typography.fontSize.sm,
									cursor: parentNode ? 'pointer' : 'not-allowed',
									opacity: parentNode ? 1 : 0.4,
									height: '26px',
									color: colors.text.secondary,
								}}
							>
								{alignment === 'start' && <AlignTop size={14} />}
								{alignment === 'center' && <AlignVerticalCenter size={14} />}
								{alignment === 'end' && <AlignBottom size={14} />}
							</button>
						))}
					</div>
				</div>

				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Transform
				</h4>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							X
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.position.x)}
							onChange={(e) => handleNestedInputChange('position', 'x', Number(e.target.value))}
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
					</div>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Y
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.position.y)}
							onChange={(e) => handleNestedInputChange('position', 'y', Number(e.target.value))}
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
					</div>
				</div>

				{supportsConstraints && (
					<div style={{ marginBottom: spacing.lg }}>
						<h4
							style={{
								margin: `0 0 ${spacing.sm} 0`,
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
								fontWeight: typography.fontWeight.medium,
							}}
						>
							Constraints
						</h4>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Horizontal
								</label>
								<select
									value={currentConstraints.horizontal}
									onChange={(e) =>
										handleInputChange('constraints', {
											...currentConstraints,
											horizontal: e.target.value as ConstraintAxisX,
										})
									}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									<option value="left">Left</option>
									<option value="right">Right</option>
									<option value="left-right">Left &amp; Right</option>
									<option value="center">Center</option>
								</select>
							</div>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Vertical
								</label>
								<select
									value={currentConstraints.vertical}
									onChange={(e) =>
										handleInputChange('constraints', {
											...currentConstraints,
											vertical: e.target.value as ConstraintAxisY,
										})
									}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									<option value="top">Top</option>
									<option value="bottom">Bottom</option>
									<option value="top-bottom">Top &amp; Bottom</option>
									<option value="center">Center</option>
								</select>
							</div>
						</div>
					</div>
				)}
				<div style={{ marginBottom: spacing.sm }}>
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '4px',
							fontSize: typography.fontSize.xs,
							color: colors.text.tertiary,
							marginBottom: '4px',
						}}
					>
						<ArrowClockwise size={12} /> Rotation
					</label>
					<input
						type="number"
						value={rotationValue}
						onChange={(e) => handleInputChange('rotation', Number(e.target.value))}
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
				</div>
			</div>

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Layout
				</h4>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: '1fr auto 1fr',
						gap: spacing.sm,
						marginBottom: spacing.sm,
						alignItems: 'end',
					}}
				>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							W
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.size.width, 100)}
							onChange={(e) => handleNestedInputChange('size', 'width', Number(e.target.value))}
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
					</div>
					{selectedNode.type === 'image' && (
						<button
							type="button"
							onClick={() => handleInputChange('aspectRatioLocked', !selectedNode.aspectRatioLocked)}
							title={selectedNode.aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
							style={{
								padding: `${spacing.xs} ${spacing.sm}`,
								backgroundColor: selectedNode.aspectRatioLocked ? colors.accent.primary : 'transparent',
								color: selectedNode.aspectRatioLocked ? colors.text.primary : colors.text.tertiary,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: '14px',
								cursor: 'pointer',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: '28px',
								height: '28px',
								marginBottom: '1px',
								transition: `all ${transitions.fast}`,
							}}
						>
							{selectedNode.aspectRatioLocked ? (
								<LockOn size={14} strokeWidth={2} />
							) : (
								<LockOff size={14} strokeWidth={2} />
							)}
						</button>
					)}
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							H
						</label>
						<input
							type="number"
							value={safeRound(selectedNode.size.height, 100)}
							onChange={(e) => handleNestedInputChange('size', 'height', Number(e.target.value))}
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
					</div>
				</div>

				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.sm,
						fontSize: typography.fontSize.md,
						color: colors.text.secondary,
					}}
				>
					<input
						type="checkbox"
						checked={Boolean(layout)}
						onChange={(e) => handleLayoutToggle(e.target.checked)}
						style={{ accentColor: colors.accent.primary }}
					/>
					Auto layout
				</label>

				{selectedNode.type === 'frame' && ENABLE_SHADOWS_V1 && (
					<div style={{ marginTop: spacing.sm }}>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Shadow overflow
						</label>
						<select
							value={shadowOverflow}
							onChange={(e) =>
								handleShadowOverflowChange(e.target.value as 'visible' | 'clipped' | 'clip-content-only')
							}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						>
							<option value="visible">Visible</option>
							<option value="clipped">Clipped</option>
							<option value="clip-content-only">Clip Content Only</option>
						</select>
					</div>
				)}

				{selectedNode.type === 'frame' && !ENABLE_SHADOWS_V1 && (
					<label
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: spacing.sm,
							fontSize: typography.fontSize.md,
							color: colors.text.secondary,
							marginTop: spacing.sm,
						}}
					>
						<input
							type="checkbox"
							checked={Boolean(selectedNode.clipContent)}
							onChange={(e) => handleInputChange('clipContent', e.target.checked)}
							style={{ accentColor: colors.accent.primary }}
						/>
						Clip content
					</label>
				)}

				{layout && (
					<div style={{ marginTop: spacing.sm, display: 'grid', gap: spacing.sm }}>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Direction
								</label>
								<select
									value={layout.direction}
									onChange={(e) => handleLayoutChange({ direction: e.target.value as Layout['direction'] })}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									<option value="row">Row</option>
									<option value="column">Column</option>
								</select>
							</div>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Gap
								</label>
								<input
									type="number"
									value={safeNumber(layout.gap)}
									onChange={(e) => {
										const value = Number(e.target.value);
										if (Number.isNaN(value)) return;
										handleLayoutChange({ gap: value });
									}}
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
							</div>
						</div>

						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Main axis align
							</label>
							<select
								value={layout.alignment}
								onChange={(e) => handleLayoutChange({ alignment: e.target.value as Layout['alignment'] })}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="start">Start</option>
								<option value="center">Center</option>
								<option value="end">End</option>
							</select>
						</div>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Cross axis align
							</label>
							<select
								value={layout.crossAlignment ?? 'center'}
								onChange={(e) =>
									handleLayoutChange({ crossAlignment: e.target.value as Layout['crossAlignment'] })
								}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="start">Start</option>
								<option value="center">Center</option>
								<option value="end">End</option>
								<option value="stretch">Stretch</option>
							</select>
						</div>

						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Padding
							</label>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
								<input
									type="number"
									value={safeNumber(layout.padding.top)}
									onChange={(e) => handlePaddingChange('top', Number(e.target.value))}
									placeholder="T"
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
								<input
									type="number"
									value={safeNumber(layout.padding.right)}
									onChange={(e) => handlePaddingChange('right', Number(e.target.value))}
									placeholder="R"
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
								<input
									type="number"
									value={safeNumber(layout.padding.bottom)}
									onChange={(e) => handlePaddingChange('bottom', Number(e.target.value))}
									placeholder="B"
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
								<input
									type="number"
									value={safeNumber(layout.padding.left)}
									onChange={(e) => handlePaddingChange('left', Number(e.target.value))}
									placeholder="L"
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
							</div>
						</div>
					</div>
				)}

				{parentLayout && (
					<div style={{ marginTop: spacing.lg }}>
						<h4
							style={{
								margin: `0 0 ${spacing.sm} 0`,
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
								fontWeight: typography.fontWeight.medium,
							}}
						>
							Resizing
						</h4>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Horizontal
								</label>
								<select
									value={layoutSizing.horizontal}
									onChange={(e) =>
										handleInputChange('layoutSizing', {
											...layoutSizing,
											horizontal: e.target.value as LayoutSizing['horizontal'],
										})
									}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									<option value="fixed">Fixed</option>
									<option value="hug">Hug</option>
									<option value="fill">Fill</option>
								</select>
							</div>
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Vertical
								</label>
								<select
									value={layoutSizing.vertical}
									onChange={(e) =>
										handleInputChange('layoutSizing', {
											...layoutSizing,
											vertical: e.target.value as LayoutSizing['vertical'],
										})
									}
									style={{
										width: '100%',
										padding: spacing.xs,
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.md,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
									}}
								>
									<option value="fixed">Fixed</option>
									<option value="hug">Hug</option>
									<option value="fill">Fill</option>
								</select>
							</div>
						</div>
					</div>
				)}

				{selectedNode.type === 'frame' && (
					<div style={{ marginTop: spacing.lg }}>
						<h4
							style={{
								margin: `0 0 ${spacing.sm} 0`,
								fontSize: typography.fontSize.sm,
								color: colors.text.secondary,
								fontWeight: typography.fontWeight.medium,
							}}
						>
							Layout guides
						</h4>
						<div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
							<label
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: spacing.xs,
									fontSize: typography.fontSize.xs,
									color: colors.text.secondary,
								}}
							>
								<input
									type="checkbox"
									checked={hasLayoutGuides}
									onChange={(e) =>
										handleInputChange(
											'layoutGuides',
											e.target.checked ? createDefaultLayoutGuides(layoutGuideType as LayoutGuideType) : undefined,
										)
									}
								/>
								Show guides
							</label>
							<select
								value={layoutGuideType}
								disabled={!hasLayoutGuides}
								onChange={(e) =>
									handleInputChange(
										'layoutGuides',
										createDefaultLayoutGuides(e.target.value as LayoutGuideType),
									)
								}
								style={{
									flex: 1,
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="grid">Grid</option>
								<option value="columns">Columns</option>
								<option value="rows">Rows</option>
							</select>
						</div>

						{hasLayoutGuides && layoutGuides?.type === 'grid' && (
							<div>
								<label
									style={{
										display: 'block',
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
										marginBottom: '4px',
									}}
								>
									Size
								</label>
								<input
									type="number"
									value={safeRound(layoutGuides.grid?.size ?? 8)}
									onChange={(e) =>
										handleInputChange('layoutGuides', {
											...layoutGuides,
											grid: { size: Number(e.target.value) },
										})
									}
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
							</div>
						)}

						{hasLayoutGuides && layoutGuides?.type === 'columns' && (
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Count
									</label>
									<input
										type="number"
										value={safeRound(layoutGuides.columns?.count ?? 12)}
										onChange={(e) =>
											handleInputChange('layoutGuides', {
												...layoutGuides,
												columns: {
													count: Number(e.target.value),
													gutter: layoutGuides.columns?.gutter ?? 16,
													margin: layoutGuides.columns?.margin ?? 16,
												},
											})
										}
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
								</div>
								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Gutter
									</label>
									<input
										type="number"
										value={safeRound(layoutGuides.columns?.gutter ?? 16)}
										onChange={(e) =>
											handleInputChange('layoutGuides', {
												...layoutGuides,
												columns: {
													count: layoutGuides.columns?.count ?? 12,
													gutter: Number(e.target.value),
													margin: layoutGuides.columns?.margin ?? 16,
												},
											})
										}
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
								</div>
								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Margin
									</label>
									<input
										type="number"
										value={safeRound(layoutGuides.columns?.margin ?? 16)}
										onChange={(e) =>
											handleInputChange('layoutGuides', {
												...layoutGuides,
												columns: {
													count: layoutGuides.columns?.count ?? 12,
													gutter: layoutGuides.columns?.gutter ?? 16,
													margin: Number(e.target.value),
												},
											})
										}
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
								</div>
							</div>
						)}

						{hasLayoutGuides && layoutGuides?.type === 'rows' && (
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Count
									</label>
									<input
										type="number"
										value={safeRound(layoutGuides.rows?.count ?? 8)}
										onChange={(e) =>
											handleInputChange('layoutGuides', {
												...layoutGuides,
												rows: {
													count: Number(e.target.value),
													gutter: layoutGuides.rows?.gutter ?? 16,
													margin: layoutGuides.rows?.margin ?? 16,
												},
											})
										}
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
								</div>
								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Gutter
									</label>
									<input
										type="number"
										value={safeRound(layoutGuides.rows?.gutter ?? 16)}
										onChange={(e) =>
											handleInputChange('layoutGuides', {
												...layoutGuides,
												rows: {
													count: layoutGuides.rows?.count ?? 8,
													gutter: Number(e.target.value),
													margin: layoutGuides.rows?.margin ?? 16,
												},
											})
										}
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
								</div>
								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Margin
									</label>
									<input
										type="number"
										value={safeRound(layoutGuides.rows?.margin ?? 16)}
										onChange={(e) =>
											handleInputChange('layoutGuides', {
												...layoutGuides,
												rows: {
													count: layoutGuides.rows?.count ?? 8,
													gutter: layoutGuides.rows?.gutter ?? 16,
													margin: Number(e.target.value),
												},
											})
										}
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
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			{ENABLE_SHADOWS_V1 && (
				<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Appearance
				</h4>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Opacity
						</label>
						<div style={{ position: 'relative' }}>
							<input
								type="number"
								min={0}
								max={100}
								value={safeRound(effectiveOpacity * 100)}
								onChange={(e) => {
									const val = Number(e.target.value);
									if (!Number.isNaN(val)) {
										handleInputChange('opacity', clamp(val / 100, 0, 1));
									}
								}}
								style={{
									width: '100%',
									padding: spacing.xs,
									paddingRight: '22px',
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							/>
							<span
								style={{
									position: 'absolute',
									right: '6px',
									top: '50%',
									transform: 'translateY(-50%)',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
								}}
							>
								%
							</span>
						</div>
					</div>

					{(selectedNode.type === 'rectangle' ||
						selectedNode.type === 'frame' ||
						selectedNode.type === 'image' ||
						selectedNode.type === 'componentInstance') && (
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Radius
							</label>
							<input
								type="number"
								value={safeNumber(selectedNode.cornerRadius, 0)}
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isNaN(value)) return;
									handleInputChange('cornerRadius', value);
								}}
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
						</div>
					)}
				</div>
				</div>
			)}

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Effects
				</h4>
				<div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
					<button
						type="button"
						onClick={() => addEffect('drop')}
						style={{
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
							cursor: 'pointer',
							flex: 1,
						}}
					>
						+ Drop
					</button>
					<button
						type="button"
						onClick={() => addEffect('inner')}
						style={{
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
							cursor: 'pointer',
							flex: 1,
						}}
					>
						+ Inner
					</button>
					{ENABLE_AUTO_SHADOWS_V2 && (
						<button
							type="button"
							onClick={() => addEffect('auto')}
							style={{
								padding: `${spacing.xs} ${spacing.sm}`,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
								flex: 1,
							}}
						>
							+ Auto
						</button>
					)}
				</div>
				<div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
					<button
						type="button"
						onClick={() => onCopyEffects?.(selectedNode.id)}
						disabled={effects.length === 0}
						style={{
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
							cursor: effects.length === 0 ? 'not-allowed' : 'pointer',
							opacity: effects.length === 0 ? 0.5 : 1,
							flex: 1,
						}}
					>
						Copy Effects
					</button>
					<button
						type="button"
						onClick={() => onPasteEffects?.(selectedNode.id)}
						disabled={!canPasteEffects}
						style={{
							padding: `${spacing.xs} ${spacing.sm}`,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
							cursor: canPasteEffects ? 'pointer' : 'not-allowed',
							opacity: canPasteEffects ? 1 : 0.5,
							flex: 1,
						}}
					>
						Paste Effects
					</button>
				</div>

				{enabledEffectsCount > 6 && (
					<div
						style={{
							marginBottom: spacing.sm,
							padding: spacing.xs,
							borderRadius: radii.sm,
							backgroundColor: 'rgba(255, 159, 10, 0.12)',
							border: '1px solid rgba(255, 159, 10, 0.35)',
							fontSize: typography.fontSize.xs,
							color: colors.text.secondary,
						}}
					>
						Performance warning: more than 6 enabled effects may reduce rendering speed.
					</div>
				)}

				{effects.length === 0 && (
					<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>No effects on this layer.</div>
				)}

				{effects.map((effect, index) => (
					<div
						key={`${effect.type}-${index}`}
						draggable
						onDragStart={() => setDraggedEffectIndex(index)}
						onDragEnd={() => setDraggedEffectIndex(null)}
						onDragOver={(e) => {
							e.preventDefault();
						}}
						onDrop={() => {
							if (draggedEffectIndex === null) return;
							reorderEffects(draggedEffectIndex, index);
							setDraggedEffectIndex(null);
						}}
						style={{
							border: `1px solid ${colors.border.default}`,
							borderRadius: radii.sm,
							padding: spacing.sm,
							marginBottom: spacing.sm,
							backgroundColor:
								draggedEffectIndex === index ? colors.bg.active : colors.bg.tertiary,
						}}
					>
						<div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.xs }}>
							<div
								style={{
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									cursor: 'grab',
									userSelect: 'none',
								}}
								title="Drag to reorder"
							>
								:::
							</div>
							<div style={{ flex: 1, fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
								{effect.type === 'drop' ? 'Drop shadow' : effect.type === 'inner' ? 'Inner shadow' : 'Auto shadow'}
							</div>
							<button
								type="button"
								onClick={() => updateEffectPatch(index, { enabled: effect.enabled === false })}
								style={{
									border: `1px solid ${colors.border.default}`,
									backgroundColor: 'transparent',
									color: colors.text.tertiary,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.xs,
									cursor: 'pointer',
									padding: '2px 6px',
								}}
							>
								{effect.enabled === false ? 'Show' : 'Hide'}
							</button>
							<button
								type="button"
								onClick={() => removeEffect(index)}
								style={{
									border: `1px solid ${colors.border.default}`,
									backgroundColor: 'transparent',
									color: colors.semantic.error,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.xs,
									cursor: 'pointer',
									padding: '2px 6px',
								}}
							>
								Delete
							</button>
						</div>

						{(effect.type === 'drop' || effect.type === 'inner') && (
							<>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											X
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.x)}
											onChange={(value) => updateEffectPatch(index, { x: value })}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Y
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.y)}
											onChange={(value) => updateEffectPatch(index, { y: value })}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Blur
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.blur)}
											onChange={(value) => updateEffectPatch(index, { blur: Math.max(0, value) })}
											min={0}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Spread
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.spread)}
											onChange={(value) => updateEffectPatch(index, { spread: value })}
											step={1}
											scrubStep={0.2}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
								</div>

								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Color
										</label>
										<input
											type="color"
											value={effect.color}
											onChange={(e) => updateEffectPatch(index, { color: e.target.value })}
											style={{
												width: '100%',
												height: '28px',
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												cursor: 'pointer',
												backgroundColor: colors.bg.secondary,
											}}
										/>
									</div>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Opacity
										</label>
										<ScrubbableNumberInput
											value={safeRound(safeNumber(effect.opacity, 1) * 100)}
											onChange={(value) => updateEffectPatch(index, { opacity: clamp(value / 100, 0, 1) })}
											min={0}
											max={100}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
								</div>

								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Blend mode
									</label>
									<select
										value={effect.blendMode ?? 'normal'}
										onChange={(e) => updateEffectPatch(index, { blendMode: e.target.value as ShadowBlendMode })}
										style={{
											width: '100%',
											padding: spacing.xs,
											border: `1px solid ${colors.border.default}`,
											borderRadius: radii.sm,
											fontSize: typography.fontSize.md,
											backgroundColor: colors.bg.secondary,
											color: colors.text.primary,
										}}
									>
										<option value="normal">Normal</option>
										<option value="multiply">Multiply</option>
										<option value="screen">Screen</option>
										<option value="overlay">Overlay</option>
									</select>
								</div>
							</>
						)}

						{effect.type === 'auto' && (
							<>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
									<div>
										<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
											Elevation
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.elevation)}
											onChange={(value) => updateEffectPatch(index, { elevation: clamp(value, 0, 24) })}
											min={0}
											max={24}
											step={1}
											scrubStep={0.2}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
									<div>
										<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
											Angle
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.angle)}
											onChange={(value) => updateEffectPatch(index, { angle: value })}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
									<div>
										<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
											Distance
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.distance)}
											onChange={(value) => updateEffectPatch(index, { distance: clamp(value, 0, 80) })}
											min={0}
											max={80}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
									<div>
										<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
											Softness
										</label>
										<ScrubbableNumberInput
											value={safeNumber(effect.softness)}
											onChange={(value) => updateEffectPatch(index, { softness: clamp(value, 0, 100) })}
											min={0}
											max={100}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
								</div>

								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
									<div>
										<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
											Color
										</label>
										<input
											type="color"
											value={effect.color}
											onChange={(e) => updateEffectPatch(index, { color: e.target.value })}
											style={{
												width: '100%',
												height: '28px',
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												cursor: 'pointer',
												backgroundColor: colors.bg.secondary,
											}}
										/>
									</div>
									<div>
										<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
											Opacity
										</label>
										<ScrubbableNumberInput
											value={safeRound(safeNumber(effect.opacity, 1) * 100)}
											onChange={(value) => updateEffectPatch(index, { opacity: clamp(value / 100, 0, 1) })}
											min={0}
											max={100}
											step={1}
											scrubStep={0.25}
											inputStyle={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.secondary,
												color: colors.text.primary,
											}}
										/>
									</div>
								</div>

								<div style={{ marginBottom: spacing.sm }}>
									<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '4px' }}>
										Blend mode
									</label>
									<select
										value={effect.blendMode ?? 'normal'}
										onChange={(e) => updateEffectPatch(index, { blendMode: e.target.value as ShadowBlendMode })}
										style={{
											width: '100%',
											padding: spacing.xs,
											border: `1px solid ${colors.border.default}`,
											borderRadius: radii.sm,
											fontSize: typography.fontSize.md,
											backgroundColor: colors.bg.secondary,
											color: colors.text.primary,
										}}
									>
										<option value="normal">Normal</option>
										<option value="multiply">Multiply</option>
										<option value="screen">Screen</option>
										<option value="overlay">Overlay</option>
									</select>
								</div>

								<div style={{ borderTop: `1px solid ${colors.border.default}`, paddingTop: spacing.xs }}>
									<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: spacing.xs }}>
										Bindings (Advanced)
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs }}>
										{(['elevation', 'angle', 'distance', 'softness', 'color', 'opacity', 'blendMode'] as AutoShadowBindingField[]).map((field) => (
											<div key={field}>
												<label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.tertiary, marginBottom: '2px' }}>
													{field}
												</label>
												<input
													type="text"
													value={effect.bindings?.[field] ?? ''}
													onChange={(e) => updateAutoBinding(index, field, e.target.value)}
													placeholder="variable key"
													style={{
														width: '100%',
														padding: '4px 6px',
														border: `1px solid ${colors.border.default}`,
														borderRadius: radii.sm,
														fontSize: typography.fontSize.xs,
														backgroundColor: colors.bg.secondary,
														color: colors.text.primary,
													}}
												/>
											</div>
										))}
									</div>
								</div>
							</>
						)}
					</div>
				))}

				{ENABLE_AUTO_SHADOWS_V2 && (
					<div style={{ marginTop: spacing.sm, borderTop: `1px solid ${colors.border.default}`, paddingTop: spacing.sm }}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								marginBottom: spacing.xs,
							}}
						>
							<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>Effect Variables</div>
							<button
								type="button"
								onClick={addEffectVariable}
								style={{
									border: `1px solid ${colors.border.default}`,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.secondary,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.xs,
									cursor: 'pointer',
									padding: '2px 6px',
								}}
							>
								+ Variable
							</button>
						</div>
						{effectVariableRows.length === 0 && (
							<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>
								No effect variables on this node.
							</div>
						)}
						{effectVariableRows.map((row) => (
							<div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.xs, marginBottom: spacing.xs }}>
								<input
									type="text"
									value={row.key}
									onChange={(e) => updateEffectVariable(row.key, e.target.value, row.value)}
									placeholder="name"
									style={{
										width: '100%',
										padding: '4px 6px',
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.xs,
										backgroundColor: colors.bg.secondary,
										color: colors.text.primary,
									}}
								/>
								<input
									type="text"
									value={row.value}
									onChange={(e) => updateEffectVariable(row.key, row.key, e.target.value)}
									placeholder="value"
									style={{
										width: '100%',
										padding: '4px 6px',
										border: `1px solid ${colors.border.default}`,
										borderRadius: radii.sm,
										fontSize: typography.fontSize.xs,
										backgroundColor: colors.bg.secondary,
										color: colors.text.primary,
									}}
								/>
							</div>
						))}
					</div>
				)}
			</div>

			{selectedNode.type === 'image' && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Background
					</h4>
					<div style={{ display: 'grid', gap: spacing.sm }}>
						<button
							type="button"
							disabled={isRemovingBackground}
							onClick={() => onRemoveBackground?.(selectedNode.id)}
							style={{
								padding: spacing.xs,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: isRemovingBackground ? 'not-allowed' : 'pointer',
								width: '100%',
							}}
						>
							{isRemovingBackground
								? 'Removing background...'
								: hasBgMask
									? 'Re-run background removal'
									: 'Remove background'}
						</button>
						{hasBgMask && (
							<button
								type="button"
								disabled={isRemovingBackground}
								onClick={() => onClearBackground?.(selectedNode.id)}
								style={{
									padding: spacing.xs,
									borderRadius: radii.sm,
									border: `1px solid ${colors.border.default}`,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.secondary,
									fontSize: typography.fontSize.md,
									cursor: isRemovingBackground ? 'not-allowed' : 'pointer',
									width: '100%',
								}}
							>
								Clear background removal
							</button>
							)}
							{bgRemoveMeta && (
								<div
									style={{
										fontSize: typography.fontSize.xs,
										color: colors.text.tertiary,
									}}
								>
									Background removed (Apple Vision)
								</div>
							)}

							<div
								style={{
									marginTop: spacing.xs,
									paddingTop: spacing.sm,
									borderTop: `1px solid ${colors.border.subtle}`,
									display: 'grid',
									gap: spacing.sm,
								}}
							>
								<label
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: spacing.sm,
										fontSize: typography.fontSize.md,
										color: colors.text.secondary,
									}}
								>
									<input
										type="checkbox"
										checked={outlineEnabled}
										disabled={isRemovingBackground}
										onChange={(e) => onUpdateImageOutline?.(selectedNode.id, { enabled: e.target.checked })}
										style={{ accentColor: colors.accent.primary }}
									/>
									Subject outline
								</label>

								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Width
										</label>
										<input
											type="number"
											min={0}
											max={24}
											step={1}
											disabled={outlineControlsDisabled}
											value={safeRound(outlineWidth, DEFAULT_IMAGE_OUTLINE.width)}
											onChange={(e) => {
												const value = Number(e.target.value);
												if (Number.isNaN(value)) return;
												onUpdateImageOutline?.(selectedNode.id, { width: Math.max(0, value) });
											}}
											style={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.tertiary,
												color: colors.text.primary,
												cursor: outlineControlsDisabled ? 'not-allowed' : 'text',
												opacity: outlineControlsDisabled ? 0.6 : 1,
											}}
										/>
									</div>
									<div>
										<label
											style={{
												display: 'block',
												fontSize: typography.fontSize.xs,
												color: colors.text.tertiary,
												marginBottom: '4px',
											}}
										>
											Blur
										</label>
										<input
											type="number"
											min={0}
											max={48}
											step={1}
											disabled={outlineControlsDisabled}
											value={safeRound(outlineBlur, DEFAULT_IMAGE_OUTLINE.blur)}
											onChange={(e) => {
												const value = Number(e.target.value);
												if (Number.isNaN(value)) return;
												onUpdateImageOutline?.(selectedNode.id, { blur: Math.max(0, value) });
											}}
											style={{
												width: '100%',
												padding: spacing.xs,
												border: `1px solid ${colors.border.default}`,
												borderRadius: radii.sm,
												fontSize: typography.fontSize.md,
												backgroundColor: colors.bg.tertiary,
												color: colors.text.primary,
												cursor: outlineControlsDisabled ? 'not-allowed' : 'text',
												opacity: outlineControlsDisabled ? 0.6 : 1,
											}}
										/>
									</div>
								</div>

								<div>
									<label
										style={{
											display: 'block',
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
											marginBottom: '4px',
										}}
									>
										Color
									</label>
									<input
										type="color"
										disabled={outlineControlsDisabled}
										value={outlineColor}
										onChange={(e) => onUpdateImageOutline?.(selectedNode.id, { color: e.target.value })}
										style={{
											width: '100%',
											height: '28px',
											border: `1px solid ${colors.border.default}`,
											borderRadius: radii.sm,
											backgroundColor: colors.bg.tertiary,
											cursor: outlineControlsDisabled ? 'not-allowed' : 'pointer',
											opacity: outlineControlsDisabled ? 0.6 : 1,
										}}
									/>
								</div>

								{!hasBgMask && (
									<div
										style={{
											fontSize: typography.fontSize.xs,
											color: colors.text.tertiary,
										}}
									>
										Outline needs a subject mask. Enabling outline will run background removal first.
									</div>
								)}
							</div>
						</div>
					</div>
				)}

			<div style={{ marginBottom: spacing.lg }}>
				<h4
					style={{
						margin: `0 0 ${spacing.sm} 0`,
						fontSize: typography.fontSize.sm,
						color: colors.text.secondary,
						fontWeight: typography.fontWeight.medium,
					}}
				>
					Fill
				</h4>
				<label
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: spacing.sm,
						fontSize: typography.fontSize.md,
						color: colors.text.secondary,
						marginBottom: spacing.sm,
					}}
				>
					<input
						type="checkbox"
						checked={selectedNode.visible !== false}
						onChange={(e) => handleInputChange('visible', e.target.checked)}
						style={{ accentColor: colors.accent.primary }}
					/>
					Visible
				</label>

				{selectedNode.fill ? (
					<div style={{ display: 'grid', gap: spacing.sm }}>
						<input
							type="color"
							value={selectedNode.fill.type === 'solid' ? selectedNode.fill.value : defaultFill}
							onChange={(e) => handleInputChange('fill', { type: 'solid', value: e.target.value })}
							style={{
								width: '100%',
								height: '28px',
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								cursor: 'pointer',
								backgroundColor: colors.bg.tertiary,
							}}
						/>
						<button
							type="button"
							onClick={() => handleInputChange('fill', undefined)}
							style={{
								padding: spacing.xs,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.md,
								cursor: 'pointer',
							}}
						>
							Remove Fill
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => handleInputChange('fill', { type: 'solid', value: defaultFill })}
						style={{
							padding: spacing.xs,
							borderRadius: radii.sm,
							border: `1px solid ${colors.border.default}`,
							backgroundColor: colors.bg.tertiary,
							color: colors.text.secondary,
							fontSize: typography.fontSize.md,
							cursor: 'pointer',
							width: '100%',
						}}
					>
						Add Fill
					</button>
				)}
			</div>

			{selectedNode.type === 'text' && (
				<div style={{ marginBottom: spacing.lg }}>
					<h4
						style={{
							margin: `0 0 ${spacing.sm} 0`,
							fontSize: typography.fontSize.sm,
							color: colors.text.secondary,
							fontWeight: typography.fontWeight.medium,
						}}
					>
						Text
					</h4>
					<div style={{ marginBottom: spacing.sm }}>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Content
						</label>
						<textarea
							value={selectedNode.text || ''}
							onChange={(e) => handleInputChange('text', e.target.value)}
							style={{
								width: '100%',
								padding: spacing.xs,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								minHeight: '60px',
								resize: 'vertical',
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
							}}
						/>
					</div>

					<div style={{ marginBottom: spacing.sm }}>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Align
						</label>
						<div
							style={{
								display: 'flex',
								gap: '1px',
								backgroundColor: colors.border.subtle,
								padding: '1px',
								borderRadius: radii.md,
							}}
						>
							{([
								{ value: 'left', icon: <AlignLeft size={14} /> },
								{ value: 'center', icon: <AlignHorizontalCenter size={14} /> },
								{ value: 'right', icon: <AlignRight size={14} /> },
							] as const).map((item) => {
								const active = (selectedNode.textAlign ?? 'left') === item.value;
								return (
									<button
										key={`text-align-${item.value}`}
										type="button"
										onClick={() => handleInputChange('textAlign', item.value)}
										style={{
											flex: 1,
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											padding: spacing.xs,
											backgroundColor: active ? colors.accent.subtle : colors.bg.tertiary,
											border: 'none',
											borderRadius: radii.sm,
											fontSize: typography.fontSize.sm,
											color: active ? colors.accent.primary : colors.text.secondary,
											height: '26px',
											cursor: 'pointer',
										}}
									>
										{item.icon}
									</button>
								);
							})}
						</div>

						{textOverflow?.isOverflowing && (selectedNode.textResizeMode ?? 'auto-width') === 'fixed' && (
							<div
								style={{
									marginTop: spacing.xs,
									padding: spacing.xs,
									borderRadius: radii.sm,
									border: `1px solid rgba(255, 159, 10, 0.5)`,
									backgroundColor: 'rgba(255, 159, 10, 0.12)',
									color: colors.text.secondary,
									fontSize: typography.fontSize.xs,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									gap: spacing.sm,
								}}
							>
								<span>Text is clipped in fixed mode.</span>
								<button
									type="button"
									onClick={() => handleInputChange('textResizeMode', 'auto-height')}
									style={{
										padding: `2px ${spacing.xs}`,
										borderRadius: radii.sm,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.tertiary,
										color: colors.text.primary,
										fontSize: typography.fontSize.xs,
										cursor: 'pointer',
									}}
								>
									Auto-fit Height
								</button>
							</div>
						)}
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Size
							</label>
							<input
								type="number"
								value={safeNumber(selectedNode.fontSize, 16)}
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isNaN(value)) return;
									handleInputChange('fontSize', value);
								}}
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
						</div>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Weight
							</label>
							<select
								value={selectedNode.fontWeight ?? 'normal'}
								onChange={(e) => handleInputChange('fontWeight', e.target.value)}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: colors.bg.tertiary,
									color: colors.text.primary,
								}}
							>
								<option value="normal">Normal</option>
								<option value="500">Medium</option>
								<option value="600">Semibold</option>
								<option value="bold">Bold</option>
							</select>
						</div>
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, marginBottom: spacing.sm }}>
						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Line Height
							</label>
							<input
								type="number"
								value={safeNumber(selectedNode.lineHeightPx, Math.max(1, Math.round((selectedNode.fontSize ?? 16) * 1.2)))}
								disabled={selectedNode.lineHeightPx === undefined}
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isNaN(value)) return;
									handleInputChange('lineHeightPx', Math.max(1, value));
								}}
								style={{
									width: '100%',
									padding: spacing.xs,
									border: `1px solid ${colors.border.default}`,
									borderRadius: radii.sm,
									fontSize: typography.fontSize.md,
									backgroundColor: selectedNode.lineHeightPx === undefined ? colors.bg.secondary : colors.bg.tertiary,
									color: selectedNode.lineHeightPx === undefined ? colors.text.tertiary : colors.text.primary,
								}}
							/>
							<label
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: '6px',
									marginTop: '6px',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
								}}
							>
								<input
									type="checkbox"
									checked={selectedNode.lineHeightPx === undefined}
									onChange={(e) =>
										handleInputChange(
											'lineHeightPx',
											e.target.checked
												? undefined
												: Math.max(1, Math.round((selectedNode.fontSize ?? 16) * 1.2)),
										)
									}
								/>
								Auto
							</label>
							<div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
								{([1, 1.2, 1.4, 1.6] as const).map((ratio) => {
									const target = Math.max(1, Math.round((selectedNode.fontSize ?? 16) * ratio));
									const active =
										selectedNode.lineHeightPx !== undefined &&
										Math.abs((selectedNode.lineHeightPx ?? 0) - target) <= 0.5;
									return (
										<button
											key={`line-height-preset-${ratio}`}
											type="button"
											onClick={() => handleInputChange('lineHeightPx', target)}
											style={{
												padding: `2px ${spacing.xs}`,
												borderRadius: radii.sm,
												border: `1px solid ${active ? colors.accent.primary : colors.border.default}`,
												backgroundColor: active ? colors.accent.subtle : colors.bg.tertiary,
												color: active ? colors.accent.primary : colors.text.secondary,
												fontSize: typography.fontSize.xs,
												cursor: 'pointer',
											}}
										>
											{Math.round(ratio * 100)}%
										</button>
									);
								})}
							</div>
						</div>

						<div>
							<label
								style={{
									display: 'block',
									fontSize: typography.fontSize.xs,
									color: colors.text.tertiary,
									marginBottom: '4px',
								}}
							>
								Letter Spacing
							</label>
							<input
								type="number"
								value={safeNumber(selectedNode.letterSpacingPx, 0)}
								step="0.1"
								onChange={(e) => {
									const value = Number(e.target.value);
									if (Number.isNaN(value)) return;
									handleInputChange('letterSpacingPx', value);
								}}
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
						</div>
					</div>

					<div style={{ marginBottom: spacing.sm }}>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Resize
						</label>
						<div
							style={{
								display: 'flex',
								gap: '1px',
								backgroundColor: colors.border.subtle,
								padding: '1px',
								borderRadius: radii.md,
							}}
						>
							{([
								{ value: 'auto-width', label: 'Auto W' },
								{ value: 'auto-height', label: 'Auto H' },
								{ value: 'fixed', label: 'Fixed' },
							] as const).map((item) => {
								const active = (selectedNode.textResizeMode ?? 'auto-width') === item.value;
								return (
									<button
										key={`text-resize-${item.value}`}
										type="button"
										onClick={() => handleInputChange('textResizeMode', item.value)}
										style={{
											flex: 1,
											padding: spacing.xs,
											backgroundColor: active ? colors.accent.subtle : colors.bg.tertiary,
											border: 'none',
											borderRadius: radii.sm,
											fontSize: typography.fontSize.xs,
											color: active ? colors.accent.primary : colors.text.secondary,
											height: '26px',
											cursor: 'pointer',
										}}
									>
										{item.label}
									</button>
								);
							})}
						</div>
						<div
							style={{
								marginTop: '6px',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								display: 'grid',
								gap: '2px',
							}}
						>
							<div>Auto W: grows width with content.</div>
							<div>Auto H: wraps by width, grows height.</div>
							<div>Fixed: wraps and clips overflow.</div>
						</div>
					</div>

					<div>
						<label
							style={{
								display: 'block',
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								marginBottom: '4px',
							}}
						>
							Font Family
						</label>
						<button
							ref={fontPickerTriggerRef}
							type="button"
							onClick={() => {
								setFontPickerAnchorRect(fontPickerTriggerRef.current?.getBoundingClientRect() ?? null);
								setFontPickerOpen(true);
							}}
							style={{
								width: '100%',
								padding: `${spacing.xs} ${spacing.sm}`,
								border: `1px solid ${colors.border.default}`,
								borderRadius: radii.sm,
								fontSize: typography.fontSize.md,
								backgroundColor: colors.bg.tertiary,
								color: colors.text.primary,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								gap: spacing.sm,
								cursor: 'pointer',
							}}
						>
							<span
								style={{
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									fontFamily: selectedNode.fontFamily ?? 'Inter, sans-serif',
								}}
							>
								{selectedNode.fontFamily ?? 'Inter, sans-serif'}
							</span>
							<span style={{ color: colors.text.tertiary }}>▾</span>
						</button>
					</div>

					<FontPickerModal
						open={fontPickerOpen}
						selectedFontFamily={selectedNode.fontFamily ?? 'Inter, sans-serif'}
						anchorRect={fontPickerAnchorRect}
						onSelect={(fontFamily) => handleInputChange('fontFamily', fontFamily)}
						onClose={() => setFontPickerOpen(false)}
					/>
				</div>
			)}
		</div>
	);
};

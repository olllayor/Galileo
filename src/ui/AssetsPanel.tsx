import React from 'react';
import type { ComponentDefinition, ComponentSet, ComponentVariantMap, ComponentsLibrary } from '../core/doc/types';
import { colors, panels, radii, spacing, transitions, typography } from './design-system';

type AssetSetEntry = {
	set: ComponentSet;
	definitions: ComponentDefinition[];
	defaultDefinition?: ComponentDefinition;
};

interface AssetsPanelProps {
	components: ComponentsLibrary;
	width?: number;
	collapsed?: boolean;
	onToggleCollapsed?: () => void;
	onCreateComponent: () => void;
	onInsertComponent: (componentId: string, variant?: ComponentVariantMap) => void;
	onRevealMain: (componentId: string) => void;
	onAddVariant: (setId: string, property: string, value: string) => void;
	recentComponentIds?: string[];
	focusSearchNonce?: number;
}

const toVariantLabel = (variant?: ComponentVariantMap): string => {
	const entries = Object.entries(variant ?? {});
	if (entries.length === 0) return 'Default';
	return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
};

const buildAssetEntries = (components: ComponentsLibrary): AssetSetEntry[] => {
	return Object.values(components.sets)
		.map((set) => {
			const definitions = set.definitionIds
				.map((id) => components.definitions[id])
				.filter((definition): definition is ComponentDefinition => Boolean(definition));
			return {
				set,
				definitions,
				defaultDefinition: components.definitions[set.defaultDefinitionId],
			};
		})
		.sort((a, b) => a.set.name.localeCompare(b.set.name));
};

export const AssetsPanel: React.FC<AssetsPanelProps> = ({
	components,
	width = panels.left.width,
	collapsed = false,
	onToggleCollapsed,
	onCreateComponent,
	onInsertComponent,
	onRevealMain,
	onAddVariant,
	recentComponentIds = [],
	focusSearchNonce = 0,
}) => {
	const [search, setSearch] = React.useState('');
	const [draftBySet, setDraftBySet] = React.useState<Record<string, { property: string; value: string }>>({});
	const searchRef = React.useRef<HTMLInputElement | null>(null);

	React.useEffect(() => {
		if (!collapsed) {
			searchRef.current?.focus();
			searchRef.current?.select();
		}
	}, [focusSearchNonce, collapsed]);

	const entries = React.useMemo(() => buildAssetEntries(components), [components]);

	const filteredEntries = React.useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return entries;
		return entries.filter((entry) => {
			if (entry.set.name.toLowerCase().includes(query)) return true;
			return entry.definitions.some((definition) => toVariantLabel(definition.variant).toLowerCase().includes(query));
		});
	}, [entries, search]);

	const firstResult = filteredEntries[0];

	const recentSetEntries = React.useMemo(() => {
		if (recentComponentIds.length === 0) return [];
		const byId = new Map(entries.map((entry) => [entry.set.id, entry]));
		return recentComponentIds.map((id) => byId.get(id)).filter((entry): entry is AssetSetEntry => Boolean(entry));
	}, [entries, recentComponentIds]);

	if (collapsed) {
		return (
			<div
				style={{
					width: `${panels.left.collapsedWidth}px`,
					borderRight: `1px solid ${colors.border.subtle}`,
					backgroundColor: colors.bg.secondary,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: spacing.sm,
					transition: `width ${transitions.normal}`,
				}}
			>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Expand Assets"
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
				borderRight: `1px solid ${colors.border.subtle}`,
				backgroundColor: colors.bg.secondary,
				display: 'flex',
				flexDirection: 'column',
				transition: `width ${transitions.normal}`,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: spacing.sm,
					borderBottom: `1px solid ${colors.border.subtle}`,
					gap: spacing.xs,
				}}
			>
				<input
					ref={searchRef}
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && firstResult) {
							event.preventDefault();
							onInsertComponent(firstResult.set.id, firstResult.defaultDefinition?.variant);
						}
					}}
					placeholder="Search components"
					style={{
						flex: 1,
						padding: `${spacing.xs} ${spacing.sm}`,
						borderRadius: radii.sm,
						border: `1px solid ${colors.border.default}`,
						backgroundColor: colors.bg.tertiary,
						color: colors.text.primary,
						fontSize: typography.fontSize.md,
					}}
				/>
				<button
					type="button"
					onClick={onToggleCollapsed}
					title="Collapse Assets"
					style={{
						width: '24px',
						height: '24px',
						border: 'none',
						borderRadius: radii.sm,
						backgroundColor: colors.bg.tertiary,
						color: colors.text.secondary,
						cursor: 'pointer',
					}}
				>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M9 18l6-6-6-6" />
					</svg>
				</button>
			</div>

			<div style={{ padding: spacing.sm, borderBottom: `1px solid ${colors.border.subtle}` }}>
				<button
					type="button"
					onClick={onCreateComponent}
					style={{
						width: '100%',
						padding: `${spacing.xs} ${spacing.sm}`,
						border: 'none',
						borderRadius: radii.sm,
						backgroundColor: colors.accent.primary,
						color: colors.text.primary,
						fontSize: typography.fontSize.md,
						fontWeight: typography.fontWeight.medium,
						cursor: 'pointer',
					}}
				>
					Create Component
				</button>
			</div>

			<div style={{ flex: 1, overflowY: 'auto', padding: spacing.sm, display: 'grid', gap: spacing.sm }}>
				{recentSetEntries.length > 0 && (
					<div
						style={{
							padding: spacing.sm,
							borderRadius: radii.sm,
							backgroundColor: colors.bg.tertiary,
							display: 'grid',
							gap: spacing.xs,
						}}
					>
						<div
							style={{
								fontSize: typography.fontSize.xs,
								color: colors.text.tertiary,
								textTransform: 'uppercase',
							}}
						>
							Recent
						</div>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
							{recentSetEntries.map((entry) => (
								<button
									key={`recent-${entry.set.id}`}
									type="button"
									onClick={() => onInsertComponent(entry.set.id, entry.defaultDefinition?.variant)}
									style={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radii.full,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.secondary,
										color: colors.text.secondary,
										fontSize: typography.fontSize.sm,
										cursor: 'pointer',
									}}
								>
									{entry.set.name}
								</button>
							))}
						</div>
					</div>
				)}

				{filteredEntries.map((entry) => {
					const draft = draftBySet[entry.set.id] ?? { property: '', value: '' };
					return (
						<div
							key={entry.set.id}
							style={{
								padding: spacing.sm,
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.tertiary,
								display: 'grid',
								gap: spacing.sm,
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
								<div>
									<div style={{ fontSize: typography.fontSize.md, color: colors.text.primary }}>{entry.set.name}</div>
									<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>
										{entry.definitions.length} variant{entry.definitions.length === 1 ? '' : 's'}
									</div>
								</div>
								<div style={{ display: 'flex', gap: spacing.xs }}>
									<button
										type="button"
										onClick={() => onInsertComponent(entry.set.id, entry.defaultDefinition?.variant)}
										style={{
											padding: `${spacing.xs} ${spacing.sm}`,
											border: `1px solid ${colors.border.default}`,
											borderRadius: radii.sm,
											backgroundColor: colors.bg.secondary,
											color: colors.text.secondary,
											fontSize: typography.fontSize.sm,
											cursor: 'pointer',
										}}
									>
										Insert
									</button>
									<button
										type="button"
										onClick={() => onRevealMain(entry.set.id)}
										style={{
											padding: `${spacing.xs} ${spacing.sm}`,
											border: `1px solid ${colors.border.default}`,
											borderRadius: radii.sm,
											backgroundColor: colors.bg.secondary,
											color: colors.text.secondary,
											fontSize: typography.fontSize.sm,
											cursor: 'pointer',
										}}
									>
										Reveal Main
									</button>
								</div>
							</div>

							<div style={{ display: 'grid', gap: spacing.xs }}>
								{entry.definitions.map((definition) => (
									<button
										key={definition.id}
										type="button"
										onClick={() => onInsertComponent(entry.set.id, definition.variant)}
										style={{
											width: '100%',
											textAlign: 'left',
											padding: `${spacing.xs} ${spacing.sm}`,
											borderRadius: radii.sm,
											border: `1px solid ${colors.border.subtle}`,
											backgroundColor: colors.bg.secondary,
											color: colors.text.secondary,
											fontSize: typography.fontSize.sm,
											cursor: 'pointer',
										}}
									>
										{toVariantLabel(definition.variant)}
									</button>
								))}
							</div>

							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: spacing.xs }}>
								<input
									value={draft.property}
									onChange={(event) =>
										setDraftBySet((prev) => ({
											...prev,
											[entry.set.id]: { ...draft, property: event.target.value },
										}))
									}
									placeholder="property"
									style={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radii.sm,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.secondary,
										color: colors.text.primary,
										fontSize: typography.fontSize.sm,
									}}
								/>
								<input
									value={draft.value}
									onChange={(event) =>
										setDraftBySet((prev) => ({
											...prev,
											[entry.set.id]: { ...draft, value: event.target.value },
										}))
									}
									placeholder="value"
									style={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radii.sm,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.secondary,
										color: colors.text.primary,
										fontSize: typography.fontSize.sm,
									}}
								/>
								<button
									type="button"
									onClick={() => {
										const property = draft.property.trim();
										const value = draft.value.trim();
										if (!property || !value) return;
										onAddVariant(entry.set.id, property, value);
										setDraftBySet((prev) => ({ ...prev, [entry.set.id]: { property: '', value: '' } }));
									}}
									style={{
										padding: `${spacing.xs} ${spacing.sm}`,
										borderRadius: radii.sm,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.secondary,
										color: colors.text.secondary,
										fontSize: typography.fontSize.sm,
										cursor: 'pointer',
									}}
								>
									Add
								</button>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

import React from 'react';
import type {
	ComponentDefinition,
	ComponentSet,
	ComponentVariantMap,
	ComponentsLibrary,
	StyleLibrary,
	StyleVariableCollection,
	StyleVariableLibrary,
	StyleVariableToken,
} from '../core/doc/types';
import type { SharedStyleKind } from '../core/commands/types';
import { colors, panels, radii, spacing, transitions, typography } from './design-system';

type AssetSetEntry = {
	set: ComponentSet;
	definitions: ComponentDefinition[];
	defaultDefinition?: ComponentDefinition;
};

interface AssetsPanelProps {
	components: ComponentsLibrary;
	styles: StyleLibrary;
	variables: StyleVariableLibrary;
	width?: number;
	collapsed?: boolean;
	isResizing?: boolean;
	onToggleCollapsed?: () => void;
	onCreateComponent: () => void;
	onInsertComponent: (componentId: string, variant?: ComponentVariantMap) => void;
	onRevealMain: (componentId: string) => void;
	onAddVariant: (setId: string, property: string, value: string) => void;
	onCreateStyle: (kind: SharedStyleKind) => void;
	onRenameStyle: (kind: SharedStyleKind, id: string, name: string) => void;
	onRemoveStyle: (kind: SharedStyleKind, id: string) => void;
	onUpsertVariableCollection: (collection: StyleVariableCollection) => void;
	onRemoveVariableCollection: (collectionId: string) => void;
	onSetVariableMode: (collectionId: string, modeId: string) => void;
	onUpsertVariableToken: (token: StyleVariableToken) => void;
	onRemoveVariableToken: (tokenId: string) => void;
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

type StyleEntry = { id: string; name: string };

const STYLE_KIND_LABELS: Record<SharedStyleKind, string> = {
	paint: 'Paint',
	text: 'Text',
	effect: 'Effect',
	grid: 'Grid',
};

const buildStyleEntries = (styles: StyleLibrary): Record<SharedStyleKind, StyleEntry[]> => ({
	paint: Object.values(styles.paint)
		.map((style) => ({ id: style.id, name: style.name }))
		.sort((a, b) => a.name.localeCompare(b.name)),
	text: Object.values(styles.text)
		.map((style) => ({ id: style.id, name: style.name }))
		.sort((a, b) => a.name.localeCompare(b.name)),
	effect: Object.values(styles.effect)
		.map((style) => ({ id: style.id, name: style.name }))
		.sort((a, b) => a.name.localeCompare(b.name)),
	grid: Object.values(styles.grid)
		.map((style) => ({ id: style.id, name: style.name }))
		.sort((a, b) => a.name.localeCompare(b.name)),
});

export const AssetsPanel: React.FC<AssetsPanelProps> = ({
	components,
	styles,
	variables,
	width = panels.left.width,
	collapsed = false,
	isResizing = false,
	onToggleCollapsed,
	onCreateComponent,
	onInsertComponent,
	onRevealMain,
	onAddVariant,
	onCreateStyle,
	onRenameStyle,
	onRemoveStyle,
	onUpsertVariableCollection,
	onRemoveVariableCollection,
	onSetVariableMode,
	onUpsertVariableToken,
	onRemoveVariableToken,
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
	const styleEntries = React.useMemo(() => buildStyleEntries(styles), [styles]);
	const variableCollections = React.useMemo(
		() => Object.values(variables.collections).sort((a, b) => a.name.localeCompare(b.name)),
		[variables.collections],
	);

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
					transition: isResizing ? 'none' : `width ${transitions.normal}`,
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
				transition: isResizing ? 'none' : `width ${transitions.normal}`,
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

				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.sm,
						border: `1px solid ${colors.border.default}`,
						backgroundColor: colors.bg.tertiary,
						display: 'grid',
						gap: spacing.sm,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
						<div style={{ fontSize: typography.fontSize.md, color: colors.text.primary }}>Shared Styles</div>
					</div>
					{(['paint', 'text', 'effect', 'grid'] as SharedStyleKind[]).map((kind) => (
						<div key={kind} style={{ display: 'grid', gap: spacing.xs }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
								<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary, textTransform: 'uppercase' }}>
									{STYLE_KIND_LABELS[kind]}
								</div>
								<button
									type="button"
									onClick={() => onCreateStyle(kind)}
									style={{
										padding: '2px 6px',
										borderRadius: radii.sm,
										border: `1px solid ${colors.border.default}`,
										backgroundColor: colors.bg.secondary,
										color: colors.text.secondary,
										fontSize: typography.fontSize.xs,
										cursor: 'pointer',
									}}
								>
									+ Style
								</button>
							</div>
							{styleEntries[kind].length === 0 ? (
								<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>No styles.</div>
							) : (
								styleEntries[kind].map((style) => (
									<div key={style.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: spacing.xs }}>
										<input
											value={style.name}
											onChange={(event) => onRenameStyle(kind, style.id, event.target.value)}
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
											onClick={() => onRemoveStyle(kind, style.id)}
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
											Delete
										</button>
									</div>
								))
							)}
						</div>
					))}
				</div>

				<div
					style={{
						padding: spacing.sm,
						borderRadius: radii.sm,
						border: `1px solid ${colors.border.default}`,
						backgroundColor: colors.bg.tertiary,
						display: 'grid',
						gap: spacing.sm,
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
						<div style={{ fontSize: typography.fontSize.md, color: colors.text.primary }}>Variables</div>
						<button
							type="button"
							onClick={() => {
								const collectionId = `collection_${Date.now().toString(36)}`;
								const modeId = `mode_${Date.now().toString(36)}`;
								onUpsertVariableCollection({
									id: collectionId,
									name: 'New Collection',
									modes: [{ id: modeId, name: 'Default' }],
									defaultModeId: modeId,
								});
								onSetVariableMode(collectionId, modeId);
							}}
							style={{
								padding: '2px 6px',
								borderRadius: radii.sm,
								border: `1px solid ${colors.border.default}`,
								backgroundColor: colors.bg.secondary,
								color: colors.text.secondary,
								fontSize: typography.fontSize.xs,
								cursor: 'pointer',
							}}
						>
							+ Collection
						</button>
					</div>
					{variableCollections.length === 0 && (
						<div style={{ fontSize: typography.fontSize.xs, color: colors.text.tertiary }}>No variable collections.</div>
					)}
					{variableCollections.map((collection) => {
						const activeModeId =
							variables.activeModeByCollection[collection.id] ?? collection.defaultModeId ?? collection.modes[0]?.id;
						const collectionTokens = Object.values(variables.tokens)
							.filter((token) => token.collectionId === collection.id)
							.sort((a, b) => a.name.localeCompare(b.name));
						return (
							<div key={collection.id} style={{ display: 'grid', gap: spacing.xs, borderTop: `1px solid ${colors.border.subtle}`, paddingTop: spacing.xs }}>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: spacing.xs }}>
									<input
										value={collection.name}
										onChange={(event) => onUpsertVariableCollection({ ...collection, name: event.target.value })}
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
										onClick={() => onRemoveVariableCollection(collection.id)}
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
										Delete
									</button>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: spacing.xs }}>
									<select
										value={activeModeId}
										onChange={(event) => onSetVariableMode(collection.id, event.target.value)}
										style={{
											padding: `${spacing.xs} ${spacing.sm}`,
											borderRadius: radii.sm,
											border: `1px solid ${colors.border.default}`,
											backgroundColor: colors.bg.secondary,
											color: colors.text.primary,
											fontSize: typography.fontSize.sm,
										}}
									>
										{collection.modes.map((mode) => (
											<option key={mode.id} value={mode.id}>
												{mode.name}
											</option>
										))}
									</select>
									<button
										type="button"
										onClick={() => {
											const modeId = `mode_${Date.now().toString(36)}`;
											onUpsertVariableCollection({
												...collection,
												modes: [...collection.modes, { id: modeId, name: `Mode ${collection.modes.length + 1}` }],
											});
											onSetVariableMode(collection.id, modeId);
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
										+ Mode
									</button>
								</div>
								{collectionTokens.map((token) => {
									const value = token.valuesByMode[activeModeId] ?? (token.type === 'number' ? 0 : '');
									return (
										<div key={token.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: spacing.xs }}>
											<input
												value={token.name}
												onChange={(event) => onUpsertVariableToken({ ...token, name: event.target.value })}
												style={{
													padding: '4px 6px',
													borderRadius: radii.sm,
													border: `1px solid ${colors.border.default}`,
													backgroundColor: colors.bg.secondary,
													color: colors.text.primary,
													fontSize: typography.fontSize.xs,
												}}
											/>
											<input
												value={String(value)}
												onChange={(event) => {
													const raw = event.target.value;
													const nextValue = token.type === 'number' ? Number(raw) : raw;
													onUpsertVariableToken({
														...token,
														valuesByMode: {
															...token.valuesByMode,
															[activeModeId]: token.type === 'number' && !Number.isFinite(nextValue) ? 0 : nextValue,
														},
													});
												}}
												style={{
													padding: '4px 6px',
													borderRadius: radii.sm,
													border: `1px solid ${colors.border.default}`,
													backgroundColor: colors.bg.secondary,
													color: colors.text.primary,
													fontSize: typography.fontSize.xs,
												}}
											/>
											<select
												value={token.type}
												onChange={(event) =>
													onUpsertVariableToken({
														...token,
														type: event.target.value as StyleVariableToken['type'],
													})
												}
												style={{
													padding: '4px 6px',
													borderRadius: radii.sm,
													border: `1px solid ${colors.border.default}`,
													backgroundColor: colors.bg.secondary,
													color: colors.text.primary,
													fontSize: typography.fontSize.xs,
												}}
											>
												<option value="color">color</option>
												<option value="number">number</option>
												<option value="string">string</option>
											</select>
											<button
												type="button"
												onClick={() => onRemoveVariableToken(token.id)}
												style={{
													padding: '4px 6px',
													borderRadius: radii.sm,
													border: `1px solid ${colors.border.default}`,
													backgroundColor: colors.bg.secondary,
													color: colors.text.secondary,
													fontSize: typography.fontSize.xs,
													cursor: 'pointer',
												}}
											>
												Del
											</button>
										</div>
									);
								})}
								<button
									type="button"
									onClick={() => {
										const tokenId = `token_${Date.now().toString(36)}`;
										const modeId = activeModeId ?? collection.modes[0]?.id;
										if (!modeId) return;
										onUpsertVariableToken({
											id: tokenId,
											name: 'token',
											collectionId: collection.id,
											type: 'string',
											valuesByMode: { [modeId]: '' },
										});
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
									+ Token
								</button>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

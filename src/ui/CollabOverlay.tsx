import React from 'react';
import type { CollaboratorPresence } from '../collab/types';
import type { CanvasView } from '../hooks/useCanvas';
import type { WorldBoundsMap, Bounds } from '../core/doc/geometry';

type CollabOverlayProps = {
	collaborators: CollaboratorPresence[];
	view: CanvasView;
	boundsMap?: WorldBoundsMap;
};

export const CollabOverlay: React.FC<CollabOverlayProps> = ({ collaborators, view, boundsMap }) => {
	if (collaborators.length === 0) {
		return null;
	}

	const getSelectionBounds = (selectionIds: string[]): Bounds | null => {
		if (!boundsMap || selectionIds.length === 0) return null;

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const id of selectionIds) {
			const bounds = boundsMap[id];
			if (!bounds) continue;
			minX = Math.min(minX, bounds.x);
			minY = Math.min(minY, bounds.y);
			maxX = Math.max(maxX, bounds.x + bounds.width);
			maxY = Math.max(maxY, bounds.y + bounds.height);
		}

		if (!isFinite(minX)) return null;
		return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
	};

	return (
		<>
			{collaborators.map((collaborator) => {
				const cursor = collaborator.cursor;
				const hasCursor = Boolean(cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y));
				const color = collaborator.color || '#4a9eff';
				const selectionBounds = getSelectionBounds(collaborator.selectionIds);
				const hasSelection = Boolean(selectionBounds);

				return (
					<React.Fragment key={collaborator.actorId}>
						{selectionBounds && (
							<div
								style={{
									position: 'absolute',
									left: selectionBounds.x * view.zoom + view.pan.x,
									top: selectionBounds.y * view.zoom + view.pan.y,
									width: selectionBounds.width * view.zoom,
									height: selectionBounds.height * view.zoom,
									border: `2px dashed ${color}`,
									borderRadius: 3,
									boxSizing: 'border-box',
									pointerEvents: 'none',
									zIndex: 1380,
									opacity: 0.85,
								}}
							/>
						)}
						{hasCursor && cursor ? (
							<div
								style={{
									position: 'absolute',
									left: cursor.x * view.zoom + view.pan.x,
									top: cursor.y * view.zoom + view.pan.y,
									pointerEvents: 'none',
									transform: 'translate(-1px, -1px)',
									zIndex: 1400,
								}}
							>
								<svg
									width="20"
									height="20"
									viewBox="0 0 20 20"
									fill="none"
									style={{ overflow: 'visible' }}
								>
									<path
										d="M5.5 2L2 18L6.5 13.5L11 18L5.5 2Z"
										fill={color}
										stroke="rgba(0,0,0,0.35)"
										strokeWidth="1"
									/>
								</svg>
								<div
									style={{
										marginTop: 2,
										padding: '2px 6px',
										borderRadius: 6,
										backgroundColor: color,
										color: '#0c0d0f',
										fontSize: 11,
										fontWeight: 700,
										whiteSpace: 'nowrap',
										maxWidth: 120,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
									}}
								>
									{collaborator.displayName}
								</div>
							</div>
						) : null}
						{hasSelection && !hasCursor && (
							<div
								style={{
									position: 'absolute',
									left: 8,
									bottom: 8,
									pointerEvents: 'none',
									display: 'inline-flex',
									gap: 6,
									padding: '4px 8px',
									borderRadius: 8,
									backgroundColor: 'rgba(0, 0, 0, 0.5)',
									color: '#fff',
									fontSize: 11,
									zIndex: 1390,
								}}
							>
								<span style={{ color }}>{collaborator.displayName}</span>
								<span>{collaborator.selectionIds.length} selected</span>
							</div>
						)}
					</React.Fragment>
				);
			})}
		</>
	);
};

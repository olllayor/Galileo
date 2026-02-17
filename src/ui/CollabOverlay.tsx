import React from 'react';
import type { CollaboratorPresence } from '../collab/types';
import type { CanvasView } from '../hooks/useCanvas';

type CollabOverlayProps = {
	collaborators: CollaboratorPresence[];
	view: CanvasView;
};

export const CollabOverlay: React.FC<CollabOverlayProps> = ({ collaborators, view }) => {
	if (collaborators.length === 0) {
		return null;
	}

	return (
		<>
			{collaborators.map((collaborator) => {
				const cursor = collaborator.cursor;
				const hasCursor = Boolean(cursor && Number.isFinite(cursor.x) && Number.isFinite(cursor.y));
				const color = collaborator.color || '#4a9eff';
				const selection = collaborator.selectionIds.slice(0, 5);
				return (
					<React.Fragment key={collaborator.actorId}>
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
								<div
									style={{
										width: 10,
										height: 10,
										borderRadius: '50%',
										backgroundColor: color,
										boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
									}}
								/>
								<div
									style={{
										marginTop: 4,
										padding: '2px 6px',
										borderRadius: 6,
										backgroundColor: color,
										color: '#0c0d0f',
										fontSize: 11,
										fontWeight: 700,
										whiteSpace: 'nowrap',
									}}
								>
									{collaborator.displayName}
								</div>
							</div>
						) : null}
						{selection.length > 0 && (
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
								<span>{selection.length} selected</span>
							</div>
						)}
					</React.Fragment>
				);
			})}
		</>
	);
};

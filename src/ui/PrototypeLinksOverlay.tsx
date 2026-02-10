import React from 'react';
import type { PrototypePageGraph } from '../core/doc/types';
import type { WorldBoundsMap } from '../core/doc';

interface FrameOption {
	id: string;
	name: string;
}

interface PrototypeLinksOverlayProps {
	width: number;
	height: number;
	view: { pan: { x: number; y: number }; zoom: number };
	pagePrototype?: PrototypePageGraph;
	boundsMap: WorldBoundsMap;
	frames: FrameOption[];
}

export const PrototypeLinksOverlay: React.FC<PrototypeLinksOverlayProps> = ({
	width,
	height,
	view,
	pagePrototype,
	boundsMap,
	frames,
}) => {
	if (!pagePrototype) return null;
	const frameById = new Map(frames.map((frame) => [frame.id, frame]));
	const links: Array<{ key: string; trigger: 'click' | 'hover'; x1: number; y1: number; x2: number; y2: number }> = [];

	for (const [sourceId, sourceInteractions] of Object.entries(pagePrototype.interactionsBySource ?? {})) {
		const sourceBounds = boundsMap[sourceId];
		if (!sourceBounds) continue;
		const sourceX = (sourceBounds.x + sourceBounds.width) * view.zoom + view.pan.x;
		const sourceY = (sourceBounds.y + sourceBounds.height * 0.5) * view.zoom + view.pan.y;
		for (const trigger of ['click', 'hover'] as const) {
			const interaction = sourceInteractions[trigger];
			if (!interaction) continue;
			const targetBounds = boundsMap[interaction.targetFrameId];
			if (!targetBounds) continue;
			const targetX = targetBounds.x * view.zoom + view.pan.x;
			const targetY = (targetBounds.y + targetBounds.height * 0.5) * view.zoom + view.pan.y;
			links.push({
				key: `${sourceId}:${trigger}:${interaction.targetFrameId}`,
				trigger,
				x1: sourceX,
				y1: sourceY,
				x2: targetX,
				y2: targetY,
			});
		}
	}

	const startFrameId = pagePrototype.startFrameId;
	const startBounds = startFrameId ? boundsMap[startFrameId] : undefined;
	const startLabel = startFrameId ? frameById.get(startFrameId)?.name ?? 'Start' : null;

	return (
		<div
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width,
				height,
				pointerEvents: 'none',
				zIndex: 1150,
			}}
		>
			<svg width={width} height={height} style={{ overflow: 'visible' }}>
				<defs>
					<marker id="proto-arrow-click" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
						<path d="M0,0 L8,4 L0,8 Z" fill="#4a9eff" />
					</marker>
					<marker id="proto-arrow-hover" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
						<path d="M0,0 L8,4 L0,8 Z" fill="#f6ad55" />
					</marker>
				</defs>
				{links.map((link) => {
					const color = link.trigger === 'click' ? '#4a9eff' : '#f6ad55';
					const markerId = link.trigger === 'click' ? 'url(#proto-arrow-click)' : 'url(#proto-arrow-hover)';
					const dx = Math.max(40, Math.abs(link.x2 - link.x1) * 0.35);
					const path = `M ${link.x1} ${link.y1} C ${link.x1 + dx} ${link.y1}, ${link.x2 - dx} ${link.y2}, ${link.x2} ${link.y2}`;
					return (
						<path
							key={link.key}
							d={path}
							fill="none"
							stroke={color}
							strokeWidth={2}
							strokeDasharray={link.trigger === 'hover' ? '6 4' : undefined}
							markerEnd={markerId}
							opacity={0.95}
						/>
					);
				})}
			</svg>
			{startBounds && startLabel && (
				<div
					style={{
						position: 'absolute',
						left: startBounds.x * view.zoom + view.pan.x + 6,
						top: startBounds.y * view.zoom + view.pan.y + 6,
						padding: '2px 8px',
						borderRadius: '999px',
						backgroundColor: 'rgba(74, 158, 255, 0.9)',
						color: '#ffffff',
						fontSize: '11px',
						fontWeight: 600,
						whiteSpace: 'nowrap',
					}}
				>
					Start: {startLabel}
				</div>
			)}
		</div>
	);
};

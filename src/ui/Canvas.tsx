import React, { useMemo } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import type { CanvasPointerInfo, CanvasView, CanvasWheelInfo } from '../hooks/useCanvas';
import type { Bounds, WorldBoundsMap } from '../core/doc';
import type { ResizeHandle, VectorAnchorHandle, VectorBezierHandle, VectorSegmentPreview } from '../interaction/handles';
import { getHandleScreenRects } from '../interaction/handles';
import type { SnapGuide } from '../interaction/snapping';
import { buildDrawList } from '../render/draw-list';
import type { Document } from '../core/doc/types';

interface CanvasProps {
	width: number;
	height: number;
	document: Document;
	boundsMap?: WorldBoundsMap;
	view: CanvasView;
	selectionBounds?: Bounds | null;
	hoverBounds?: Bounds | null;
	showHandles?: boolean;
	hoverHandle?: ResizeHandle | null;
	snapGuides?: SnapGuide[];
	layoutGuides?: SnapGuide[];
	layoutGuideBounds?: Bounds | null;
	marqueeRect?: { x: number; y: number; width: number; height: number } | null;
	textCreationDraftRect?: { x: number; y: number; width: number; height: number } | null;
	textOverflowIndicatorNodeIds?: string[];
	hiddenNodeIds?: string[];
	vectorAnchors?: VectorAnchorHandle[];
	vectorBezierHandles?: VectorBezierHandle[];
	vectorSegmentPreview?: VectorSegmentPreview | null;
	cursor?: string;
	onMouseLeave?: () => void;
	onMouseDown?: (info: CanvasPointerInfo) => void;
	onMouseMove?: (info: CanvasPointerInfo) => void;
	onMouseUp?: (info: CanvasPointerInfo) => void;
	onWheel?: (info: CanvasWheelInfo) => void;
	onContextMenu?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
	width,
	height,
	document,
	boundsMap,
	view,
	selectionBounds,
	hoverBounds,
	showHandles = true,
	hoverHandle,
	snapGuides = [],
	layoutGuides = [],
	layoutGuideBounds = null,
	marqueeRect,
	textCreationDraftRect,
	textOverflowIndicatorNodeIds = [],
	hiddenNodeIds = [],
	vectorAnchors = [],
	vectorBezierHandles = [],
	vectorSegmentPreview = null,
	cursor,
	onMouseLeave,
	onMouseDown,
	onMouseMove,
	onMouseUp,
	onWheel,
	onContextMenu,
}) => {
	const checkerSize = 10;
	const checkerColor = '#e1e1e1';
	const baseColor = '#f7f7f7';
	const drawCommands = useMemo(() => {
		return buildDrawList(document, boundsMap, { textOverflowIndicatorNodeIds, hiddenNodeIds });
	}, [document, boundsMap, textOverflowIndicatorNodeIds, hiddenNodeIds]);

	const { canvasRef, handleMouseDown, handleMouseMove, handleMouseUp, handleWheel } = useCanvas({
		width,
		height,
		drawCommands,
		view,
		onMouseDown,
		onMouseMove,
		onMouseUp,
		onWheel,
	});

	const handleRects = selectionBounds && showHandles ? getHandleScreenRects(selectionBounds, view, 8) : null;

	const selectionRect = selectionBounds
		? {
				x: selectionBounds.x * view.zoom + view.pan.x,
				y: selectionBounds.y * view.zoom + view.pan.y,
				width: selectionBounds.width * view.zoom,
				height: selectionBounds.height * view.zoom,
			}
		: null;

	const hoverRect = hoverBounds
		? {
				x: hoverBounds.x * view.zoom + view.pan.x,
				y: hoverBounds.y * view.zoom + view.pan.y,
				width: hoverBounds.width * view.zoom,
				height: hoverBounds.height * view.zoom,
			}
		: null;

	const handleLeave = (event: React.MouseEvent<HTMLCanvasElement>) => {
		handleMouseUp(event);
		onMouseLeave?.();
	};

	const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
		event.preventDefault();
		event.stopPropagation();
		onContextMenu?.(event);
	};

	const bgPosX = (view.pan.x % checkerSize) + checkerSize / 2;
	const bgPosY = (view.pan.y % checkerSize) + checkerSize / 2;

	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				height: '100%',
				backgroundColor: baseColor,
				backgroundImage: `linear-gradient(90deg, ${checkerColor} 50%, transparent 50%), linear-gradient(${checkerColor} 50%, transparent 50%)`,
				backgroundSize: `${checkerSize}px ${checkerSize}px`,
				backgroundPosition: `${bgPosX}px ${bgPosY}px, ${bgPosX - checkerSize / 2}px ${bgPosY - checkerSize / 2}px`,
			}}
		>
			<div style={{ position: 'relative', width, height, overflow: 'hidden' }}>
				<canvas
					ref={canvasRef}
					width={width}
					height={height}
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleLeave}
					onWheel={handleWheel}
					onContextMenu={handleContextMenu}
					style={{
						cursor: cursor || 'inherit',
						boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
					}}
				/>

				{hoverRect && (
					<div
						style={{
							position: 'absolute',
							left: hoverRect.x,
							top: hoverRect.y,
							width: hoverRect.width,
							height: hoverRect.height,
							border: '1px solid rgba(74, 158, 255, 0.6)',
							boxSizing: 'border-box',
							pointerEvents: 'none',
						}}
					/>
				)}

				{selectionRect && (
					<div
						style={{
							position: 'absolute',
							left: selectionRect.x,
							top: selectionRect.y,
							width: selectionRect.width,
							height: selectionRect.height,
							border: '1px solid #4a9eff',
							boxSizing: 'border-box',
							pointerEvents: 'none',
						}}
					/>
				)}

				{handleRects &&
					Object.entries(handleRects).map(([handle, rect]) => {
						const isHover = hoverHandle === handle;
						return (
							<div
								key={handle}
								style={{
									position: 'absolute',
									left: rect.x,
									top: rect.y,
									width: rect.size,
									height: rect.size,
									backgroundColor: isHover ? '#4a9eff' : '#ffffff',
									border: '1px solid #4a9eff',
									borderRadius: '2px',
									boxSizing: 'border-box',
									pointerEvents: 'none',
								}}
							/>
						);
					})}

				{snapGuides.map((guide, index) => (
					<div
						key={`${guide.orientation}-${guide.value}-${index}`}
						style={{
							position: 'absolute',
							left: guide.orientation === 'vertical' ? guide.value * view.zoom + view.pan.x : 0,
							top: guide.orientation === 'horizontal' ? guide.value * view.zoom + view.pan.y : 0,
							width: guide.orientation === 'vertical' ? '1px' : width,
							height: guide.orientation === 'horizontal' ? '1px' : height,
							backgroundColor: '#ff5a5a',
							opacity: 0.8,
							pointerEvents: 'none',
						}}
					/>
				))}

				{layoutGuides.map((guide, index) => (
					<div
						key={`layout-${guide.orientation}-${guide.value}-${index}`}
						style={{
							position: 'absolute',
							left:
								guide.orientation === 'vertical'
									? guide.value * view.zoom + view.pan.x
									: (layoutGuideBounds?.x ?? 0) * view.zoom + view.pan.x,
							top:
								guide.orientation === 'horizontal'
									? guide.value * view.zoom + view.pan.y
									: (layoutGuideBounds?.y ?? 0) * view.zoom + view.pan.y,
							width:
								guide.orientation === 'vertical'
									? '1px'
									: (layoutGuideBounds?.width ?? width) * view.zoom,
							height:
								guide.orientation === 'horizontal'
									? '1px'
									: (layoutGuideBounds?.height ?? height) * view.zoom,
							backgroundColor: 'rgba(0, 153, 255, 0.35)',
							pointerEvents: 'none',
						}}
					/>
				))}

				{marqueeRect && (
					<div
						style={{
							position: 'absolute',
							left: marqueeRect.x,
							top: marqueeRect.y,
							width: marqueeRect.width,
							height: marqueeRect.height,
							border: '1px dashed #4a9eff',
							backgroundColor: 'rgba(74, 158, 255, 0.12)',
							boxSizing: 'border-box',
							pointerEvents: 'none',
						}}
					/>
				)}

				{textCreationDraftRect && (
					<div
						style={{
							position: 'absolute',
							left: textCreationDraftRect.x,
							top: textCreationDraftRect.y,
							width: Math.max(1, textCreationDraftRect.width),
							height: Math.max(1, textCreationDraftRect.height),
							border: '1px dashed rgba(10, 132, 255, 0.9)',
							backgroundColor: 'rgba(10, 132, 255, 0.08)',
							boxSizing: 'border-box',
							pointerEvents: 'none',
						}}
					/>
				)}

				{vectorBezierHandles.map((handle) => {
					const anchorX = handle.anchorX * view.zoom + view.pan.x;
					const anchorY = handle.anchorY * view.zoom + view.pan.y;
					const x = handle.x * view.zoom + view.pan.x;
					const y = handle.y * view.zoom + view.pan.y;
					const angle = Math.atan2(y - anchorY, x - anchorX);
					const length = Math.hypot(x - anchorX, y - anchorY);
					return (
						<React.Fragment key={handle.id}>
							<div
								style={{
									position: 'absolute',
									left: anchorX,
									top: anchorY,
									width: Math.max(1, length),
									height: 1,
									backgroundColor: 'rgba(74, 158, 255, 0.45)',
									transformOrigin: 'top left',
									transform: `rotate(${angle}rad)`,
									pointerEvents: 'none',
								}}
							/>
							<div
								style={{
									position: 'absolute',
									left: x - 4,
									top: y - 4,
									width: 8,
									height: 8,
									borderRadius: '50%',
									border: `1px solid ${handle.isHovered ? '#ffffff' : '#4a9eff'}`,
									backgroundColor: handle.isHovered ? '#4a9eff' : '#ffffff',
									boxSizing: 'border-box',
									pointerEvents: 'none',
								}}
							/>
						</React.Fragment>
					);
				})}

				{vectorAnchors.map((anchor) => {
					const x = anchor.x * view.zoom + view.pan.x;
					const y = anchor.y * view.zoom + view.pan.y;
					return (
						<div
							key={anchor.id}
							style={{
								position: 'absolute',
								left: x - 5,
								top: y - 5,
								width: 10,
								height: 10,
								borderRadius: anchor.isFirst ? '3px' : '50%',
								border: `1px solid ${anchor.isSelected || anchor.isHovered ? '#ffffff' : '#4a9eff'}`,
								backgroundColor: anchor.isSelected || anchor.isHovered ? '#4a9eff' : '#ffffff',
								boxSizing: 'border-box',
								pointerEvents: 'none',
							}}
						/>
					);
				})}

				{vectorSegmentPreview && (
					<div
						style={{
							position: 'absolute',
							left: vectorSegmentPreview.x * view.zoom + view.pan.x - 4,
							top: vectorSegmentPreview.y * view.zoom + view.pan.y - 4,
							width: 8,
							height: 8,
							borderRadius: '50%',
							border: '1px solid #4a9eff',
							backgroundColor: '#9fd0ff',
							boxSizing: 'border-box',
							pointerEvents: 'none',
						}}
					/>
				)}
			</div>
		</div>
	);
};

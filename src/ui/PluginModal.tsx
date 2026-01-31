import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { PluginRegistration } from '../plugins/types';

interface PluginModalProps {
	plugin: PluginRegistration;
	iframeRef: React.RefObject<HTMLIFrameElement>;
	onClose: () => void;
}

const POSITION_STORAGE_KEY = 'galileo.plugin.modal.position';

interface ModalPosition {
	x: number;
	y: number;
}

const loadSavedPosition = (pluginId: string): ModalPosition | null => {
	try {
		const stored = localStorage.getItem(POSITION_STORAGE_KEY);
		if (!stored) return null;
		const positions = JSON.parse(stored);
		return positions[pluginId] || null;
	} catch {
		return null;
	}
};

const savePosition = (pluginId: string, position: ModalPosition) => {
	try {
		const stored = localStorage.getItem(POSITION_STORAGE_KEY);
		const positions = stored ? JSON.parse(stored) : {};
		positions[pluginId] = position;
		localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(positions));
	} catch {
		// Ignore storage errors
	}
};

export const PluginModal: React.FC<PluginModalProps> = ({ plugin, iframeRef, onClose }) => {
	const width = plugin.manifest.ui?.width ?? 360;
	const height = plugin.manifest.ui?.height ?? 520;
	const pluginId = plugin.manifest.id;

	// Initialize position from storage or default (right side)
	const getDefaultPosition = useCallback((): ModalPosition => {
		const viewportWidth = window.innerWidth;
		return {
			x: viewportWidth - width - 24,
			y: 24,
		};
	}, [width]);

	const [position, setPosition] = useState<ModalPosition>(() => {
		const saved = loadSavedPosition(pluginId);
		return saved || getDefaultPosition();
	});

	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
	const modalRef = useRef<HTMLDivElement>(null);

	// Clamp position to viewport bounds
	const clampPosition = useCallback(
		(pos: ModalPosition): ModalPosition => {
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const margin = 50; // Keep at least 50px visible

			return {
				x: Math.max(-width + margin, Math.min(viewportWidth - margin, pos.x)),
				y: Math.max(0, Math.min(viewportHeight - margin, pos.y)),
			};
		},
		[width],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			// Only drag from header
			if ((e.target as HTMLElement).closest('button')) return;

			setIsDragging(true);
			dragStartRef.current = {
				x: e.clientX,
				y: e.clientY,
				posX: position.x,
				posY: position.y,
			};

			// Prevent text selection while dragging
			e.preventDefault();
		},
		[position],
	);

	const handleMouseMove = useCallback(
		(e: MouseEvent) => {
			if (!isDragging || !dragStartRef.current) return;

			const dx = e.clientX - dragStartRef.current.x;
			const dy = e.clientY - dragStartRef.current.y;

			const newPosition = clampPosition({
				x: dragStartRef.current.posX + dx,
				y: dragStartRef.current.posY + dy,
			});

			setPosition(newPosition);
		},
		[isDragging, clampPosition],
	);

	const handleMouseUp = useCallback(() => {
		if (isDragging) {
			setIsDragging(false);
			dragStartRef.current = null;
			// Save position when drag ends
			savePosition(pluginId, position);
		}
	}, [isDragging, pluginId, position]);

	// Add global mouse event listeners for dragging
	useEffect(() => {
		if (isDragging) {
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
			};
		}
	}, [isDragging, handleMouseMove, handleMouseUp]);

	// Handle window resize - clamp position if needed
	useEffect(() => {
		const handleResize = () => {
			setPosition((prev) => clampPosition(prev));
		};
		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, [clampPosition]);

	const handleResetPosition = useCallback(() => {
		const defaultPos = getDefaultPosition();
		setPosition(defaultPos);
		savePosition(pluginId, defaultPos);
	}, [getDefaultPosition, pluginId]);

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				backgroundColor: 'rgba(0, 0, 0, 0.35)',
				zIndex: 1200,
			}}
			onClick={onClose}
		>
			<div
				ref={modalRef}
				onClick={(event) => event.stopPropagation()}
				style={{
					position: 'absolute',
					left: position.x,
					top: position.y,
					width,
					height,
					backgroundColor: '#ffffff',
					borderRadius: 12,
					boxShadow: isDragging ? '0 24px 48px rgba(0, 0, 0, 0.5)' : '0 16px 40px rgba(0, 0, 0, 0.4)',
					overflow: 'hidden',
					display: 'flex',
					flexDirection: 'column',
					transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
				}}
			>
				{/* Draggable header */}
				<div
					onMouseDown={handleMouseDown}
					style={{
						height: 36,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '0 12px',
						backgroundColor: '#111111',
						color: '#ffffff',
						fontSize: 12,
						letterSpacing: 0.3,
						textTransform: 'uppercase',
						cursor: isDragging ? 'grabbing' : 'grab',
						userSelect: 'none',
					}}
				>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						{/* Drag handle indicator */}
						<svg width="12" height="12" viewBox="0 0 12 12" fill="rgba(255,255,255,0.4)">
							<circle cx="3" cy="3" r="1.5" />
							<circle cx="9" cy="3" r="1.5" />
							<circle cx="3" cy="9" r="1.5" />
							<circle cx="9" cy="9" r="1.5" />
						</svg>
						<span>{plugin.manifest.name}</span>
						{plugin.source === 'dev' && (
							<span
								style={{
									padding: '2px 6px',
									borderRadius: 4,
									backgroundColor: '#f5a623',
									color: '#111111',
									fontSize: 10,
									fontWeight: 700,
								}}
							>
								DEV MODE
							</span>
						)}
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
						{/* Reset position button */}
						<button
							onClick={handleResetPosition}
							style={{
								border: 'none',
								background: 'transparent',
								color: 'rgba(255, 255, 255, 0.6)',
								fontSize: 14,
								cursor: 'pointer',
								padding: '4px',
								borderRadius: 4,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
							title="Reset position"
							aria-label="Reset position"
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<rect x="3" y="3" width="18" height="18" rx="2" />
								<path d="M9 3v18M3 9h18" />
							</svg>
						</button>
						{/* Close button */}
						<button
							onClick={onClose}
							style={{
								border: 'none',
								background: 'transparent',
								color: '#ffffff',
								fontSize: 16,
								cursor: 'pointer',
								padding: '4px',
								borderRadius: 4,
							}}
							aria-label="Close plugin"
						>
							×
						</button>
					</div>
				</div>
				<iframe
					ref={iframeRef}
					title={plugin.manifest.name}
					src={plugin.entryUrl}
					sandbox="allow-scripts allow-forms"
					style={{
						border: 'none',
						width: '100%',
						height: '100%',
						pointerEvents: isDragging ? 'none' : 'auto',
					}}
				/>
			</div>
		</div>
	);
};

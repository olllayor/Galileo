import React from 'react';
import { CanvasRenderer } from '../render/canvas-renderer';
import { buildDrawListForNode } from '../render/draw-list';
import type { Document, PrototypePageGraph, PrototypeTransition } from '../core/doc/types';

type PlayerAnimation = {
	fromFrameId: string;
	toFrameId: string;
	transition: PrototypeTransition;
	durationMs: number;
	startAt: number;
};

interface PrototypePlayerProps {
	document: Document;
	pagePrototype?: PrototypePageGraph;
	initialFrameId: string;
	onClose: () => void;
}

const resolveDurationMs = (transition: PrototypeTransition): number => {
	if (transition === 'dissolve') return 220;
	if (transition === 'instant') return 0;
	return 260;
};

const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3);

const resolveFrameBackgroundColor = (frame: Document['nodes'][string] | undefined): string => {
	if (!frame) return '#ffffff';
	const fill = frame.fill;
	if (fill && fill.type === 'solid' && typeof fill.value === 'string' && fill.value.trim().length > 0) {
		return fill.value;
	}
	return '#ffffff';
};

const FrameCanvas: React.FC<{
	document: Document;
	frameId: string;
	scale: number;
	style?: React.CSSProperties;
}> = ({ document, frameId, scale, style }) => {
	const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
	const rendererRef = React.useRef<CanvasRenderer | null>(null);
	const frame = document.nodes[frameId];
	const frameWidth = Math.max(1, frame?.size.width ?? 1);
	const frameHeight = Math.max(1, frame?.size.height ?? 1);
	const frameBackgroundColor = resolveFrameBackgroundColor(frame);
	const canvasWidth = Math.max(1, Math.round(frameWidth * scale));
	const canvasHeight = Math.max(1, Math.round(frameHeight * scale));
	const [invalidateTick, setInvalidateTick] = React.useState(0);

	const commands = React.useMemo(
		() =>
			buildDrawListForNode(
				document,
				frameId,
				{
					includeFrameFill: true,
					clipToBounds: true,
				},
			),
		[document, frameId],
	);

	React.useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		rendererRef.current = new CanvasRenderer(canvas, () => setInvalidateTick((tick) => tick + 1));
	}, [canvasWidth, canvasHeight]);

	React.useEffect(() => {
		if (!rendererRef.current) return;
		rendererRef.current.render(commands, {
			pan: { x: 0, y: 0 },
			zoom: scale,
		});
	}, [commands, scale, invalidateTick]);

	return (
		<canvas
			ref={canvasRef}
			width={canvasWidth}
			height={canvasHeight}
			style={{
				position: 'absolute',
				left: '50%',
				top: '50%',
				transform: 'translate(-50%, -50%)',
				borderRadius: '10px',
				boxShadow: '0 10px 28px rgba(18, 28, 45, 0.2)',
				backgroundColor: frameBackgroundColor,
				...style,
			}}
		/>
	);
};

export const PrototypePlayer: React.FC<PrototypePlayerProps> = ({ document, pagePrototype, initialFrameId, onClose }) => {
	const [currentFrameId, setCurrentFrameId] = React.useState(initialFrameId);
	const [history, setHistory] = React.useState<string[]>([]);
	const [hoverReturnFrameId, setHoverReturnFrameId] = React.useState<string | null>(null);
	const [isPointerInsideStage, setIsPointerInsideStage] = React.useState(false);
	const [hoverArmed, setHoverArmed] = React.useState(false);
	const [animation, setAnimation] = React.useState<PlayerAnimation | null>(null);
	const [animationProgress, setAnimationProgress] = React.useState(0);
	const [viewportSize, setViewportSize] = React.useState(() => ({
		width: window.innerWidth,
		height: window.innerHeight,
	}));
	const rafRef = React.useRef<number | null>(null);

	const currentFrame = document.nodes[currentFrameId];
	const currentInteractions = pagePrototype?.interactionsBySource?.[currentFrameId];
	const maxStageWidth = Math.max(320, viewportSize.width - 180);
	const maxStageHeight = Math.max(220, viewportSize.height - 220);

	const computeScale = React.useCallback(
		(frameId: string): number => {
			const frame = document.nodes[frameId];
			if (!frame) return 1;
			const widthScale = maxStageWidth / Math.max(1, frame.size.width);
			const heightScale = maxStageHeight / Math.max(1, frame.size.height);
			return Math.min(1, widthScale, heightScale);
		},
		[document.nodes, maxStageWidth, maxStageHeight],
	);

	const navigateTo = React.useCallback(
		(
			targetFrameId: string,
			transition: PrototypeTransition,
			options: { pushHistory?: boolean; clearHover?: boolean } = {},
		): boolean => {
			if (animation) return false;
			const targetNode = document.nodes[targetFrameId];
			if (!targetNode || targetNode.type !== 'frame') return false;
			if (targetFrameId === currentFrameId) return false;

			if (options.pushHistory) {
				setHistory((prev) => [...prev, currentFrameId]);
			}
			if (options.clearHover !== false) {
				setHoverReturnFrameId(null);
			}

			if (transition === 'instant') {
				setCurrentFrameId(targetFrameId);
				return true;
			}

			setAnimation({
				fromFrameId: currentFrameId,
				toFrameId: targetFrameId,
				transition,
				durationMs: resolveDurationMs(transition),
				startAt: performance.now(),
			});
			setAnimationProgress(0);
			return true;
		},
		[animation, currentFrameId, document.nodes],
	);

	React.useEffect(() => {
		if (!animation) return;
		let cancelled = false;
		const tick = () => {
			if (cancelled) return;
			const elapsed = performance.now() - animation.startAt;
			const raw = animation.durationMs <= 0 ? 1 : Math.min(1, elapsed / animation.durationMs);
			setAnimationProgress(easeOutCubic(raw));
			if (raw >= 1) {
				setCurrentFrameId(animation.toFrameId);
				setAnimation(null);
				setAnimationProgress(0);
				return;
			}
			rafRef.current = window.requestAnimationFrame(tick);
		};
		rafRef.current = window.requestAnimationFrame(tick);
		return () => {
			cancelled = true;
			if (rafRef.current !== null) {
				window.cancelAnimationFrame(rafRef.current);
				rafRef.current = null;
			}
		};
	}, [animation]);

	React.useEffect(() => {
		const onResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();
				return;
			}
			if (animation) return;
			if ((event.key === 'Backspace' || (event.altKey && event.key === 'ArrowLeft')) && history.length > 0) {
				event.preventDefault();
				const target = history[history.length - 1];
				setHistory((prev) => prev.slice(0, -1));
				void navigateTo(target, 'instant', { clearHover: true });
			}
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [animation, history, navigateTo, onClose]);

	const handlePreviewClick = React.useCallback(() => {
		if (animation) return;
		const click = currentInteractions?.click;
		if (!click) return;
		void navigateTo(click.targetFrameId, click.transition, { pushHistory: true, clearHover: true });
	}, [animation, currentInteractions?.click, navigateTo]);

	const handlePreviewMouseEnter = React.useCallback(() => {
		setIsPointerInsideStage(true);
		if (animation) return;
		if (hoverReturnFrameId) return;
		if (!hoverArmed) return;
		const hover = currentInteractions?.hover;
		if (!hover) return;
		const sourceId = currentFrameId;
		const didNavigate = navigateTo(hover.targetFrameId, hover.transition, { clearHover: false });
		if (didNavigate) {
			setHoverReturnFrameId(sourceId);
		}
	}, [animation, currentInteractions?.hover, currentFrameId, hoverArmed, hoverReturnFrameId, navigateTo]);

	const handlePreviewMouseLeave = React.useCallback(() => {
		setIsPointerInsideStage(false);
		if (animation) return;
		if (!hoverReturnFrameId) return;
		const returnTarget = hoverReturnFrameId;
		setHoverReturnFrameId(null);
		void navigateTo(returnTarget, 'instant', { clearHover: true });
	}, [animation, hoverReturnFrameId, navigateTo]);

	const handlePreviewMouseMove = React.useCallback(() => {
		if (!hoverArmed) {
			setHoverArmed(true);
		}
	}, [hoverArmed]);

	React.useEffect(() => {
		if (animation || isPointerInsideStage || !hoverReturnFrameId) {
			return;
		}
		const returnTarget = hoverReturnFrameId;
		setHoverReturnFrameId(null);
		void navigateTo(returnTarget, 'instant', { clearHover: true });
	}, [animation, hoverReturnFrameId, isPointerInsideStage, navigateTo]);

	const handleBack = React.useCallback(() => {
		if (animation || history.length === 0) return;
		const target = history[history.length - 1];
		setHistory((prev) => prev.slice(0, -1));
		void navigateTo(target, 'instant', { clearHover: true });
	}, [animation, history, navigateTo]);

	const handleRestart = React.useCallback(() => {
		if (animation) return;
		setHistory([]);
		setHoverReturnFrameId(null);
		setHoverArmed(false);
		void navigateTo(initialFrameId, 'instant', { clearHover: true });
	}, [animation, initialFrameId, navigateTo]);

	const stageWidth = maxStageWidth;
	const stageHeight = maxStageHeight;
	const fromScale = animation ? computeScale(animation.fromFrameId) : computeScale(currentFrameId);
	const toScale = animation ? computeScale(animation.toFrameId) : fromScale;
	const slideDistanceX = stageWidth * 0.6;
	const slideDistanceY = stageHeight * 0.5;

	const fromStyle: React.CSSProperties = (() => {
		if (!animation) return {};
		if (animation.transition === 'dissolve') {
			return { opacity: 1 - animationProgress };
		}
		if (animation.transition === 'slide-left') {
			return { transform: `translate(-50%, -50%) translateX(${-slideDistanceX * animationProgress}px)` };
		}
		if (animation.transition === 'slide-right') {
			return { transform: `translate(-50%, -50%) translateX(${slideDistanceX * animationProgress}px)` };
		}
		if (animation.transition === 'slide-up') {
			return { transform: `translate(-50%, -50%) translateY(${-slideDistanceY * animationProgress}px)` };
		}
		if (animation.transition === 'slide-down') {
			return { transform: `translate(-50%, -50%) translateY(${slideDistanceY * animationProgress}px)` };
		}
		return {};
	})();

	const toStyle: React.CSSProperties = (() => {
		if (!animation) return {};
		if (animation.transition === 'dissolve') {
			return { opacity: animationProgress };
		}
		if (animation.transition === 'slide-left') {
			return { transform: `translate(-50%, -50%) translateX(${slideDistanceX * (1 - animationProgress)}px)` };
		}
		if (animation.transition === 'slide-right') {
			return { transform: `translate(-50%, -50%) translateX(${-slideDistanceX * (1 - animationProgress)}px)` };
		}
		if (animation.transition === 'slide-up') {
			return { transform: `translate(-50%, -50%) translateY(${slideDistanceY * (1 - animationProgress)}px)` };
		}
		if (animation.transition === 'slide-down') {
			return { transform: `translate(-50%, -50%) translateY(${-slideDistanceY * (1 - animationProgress)}px)` };
		}
		return {};
	})();

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 1500,
				background:
					'radial-gradient(1200px 700px at 50% 80%, rgba(98, 121, 166, 0.18), rgba(98, 121, 166, 0) 70%), rgba(16, 22, 33, 0.62)',
				backdropFilter: 'blur(5px)',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '14px 18px',
					borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
				}}
			>
				<div style={{ color: '#ffffff', fontSize: 14, fontWeight: 600 }}>
					Preview {currentFrame?.name ? `• ${currentFrame.name}` : ''}
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<button type="button" onClick={handleBack} disabled={history.length === 0 || Boolean(animation)}>
						Back
					</button>
					<button type="button" onClick={handleRestart} disabled={Boolean(animation)}>
						Restart
					</button>
					<button type="button" onClick={onClose}>
						Close
					</button>
				</div>
			</div>

			<div
				style={{
					flex: 1,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: '20px',
				}}
			>
				<div
					onClick={handlePreviewClick}
					onMouseEnter={handlePreviewMouseEnter}
					onMouseMove={handlePreviewMouseMove}
					onMouseLeave={handlePreviewMouseLeave}
					style={{
						position: 'relative',
						width: stageWidth,
						height: stageHeight,
						overflow: 'hidden',
						borderRadius: '14px',
						backgroundColor: '#e8edf5',
						border: '1px solid rgba(255, 255, 255, 0.42)',
						pointerEvents: animation ? 'none' : 'auto',
					}}
				>
					{animation ? (
						<>
							<FrameCanvas document={document} frameId={animation.fromFrameId} scale={fromScale} style={fromStyle} />
							<FrameCanvas document={document} frameId={animation.toFrameId} scale={toScale} style={toStyle} />
						</>
					) : (
						<FrameCanvas document={document} frameId={currentFrameId} scale={fromScale} />
					)}
				</div>
			</div>
		</div>
	);
};

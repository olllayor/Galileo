import { useEffect, useRef, useCallback, useState } from 'react';
import type { DrawCommand } from '../render/draw-list';
import { CanvasRenderer } from '../render/canvas-renderer';

export interface CanvasView {
  pan: { x: number; y: number };
  zoom: number;
}

export interface CanvasPointerInfo {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface CanvasWheelInfo {
  deltaX: number;
  deltaY: number;
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface UseCanvasProps {
  width: number;
  height: number;
  drawCommands: DrawCommand[];
  view: CanvasView;
  onMouseDown?: (info: CanvasPointerInfo) => void;
  onMouseMove?: (info: CanvasPointerInfo) => void;
  onMouseUp?: (info: CanvasPointerInfo) => void;
  onWheel?: (info: CanvasWheelInfo) => void;
}

export const useCanvas = ({
  width,
  height,
  drawCommands,
  view,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
}: UseCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [invalidateTick, setInvalidateTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    rendererRef.current = new CanvasRenderer(canvas, () => {
      setInvalidateTick(prev => prev + 1);
    });
    rendererRef.current.resize(width, height);
  }, [width, height]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.render(drawCommands, view);
  }, [drawCommands, view, invalidateTick]);

  const toWorld = useCallback(
    (screenX: number, screenY: number) => {
      const zoom = view.zoom === 0 ? 1 : view.zoom;
      return {
        x: (screenX - view.pan.x) / zoom,
        y: (screenY - view.pan.y) / zoom,
      };
    },
    [view]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const { x, y } = toWorld(screenX, screenY);

      onMouseDown?.({
        clientX: event.clientX,
        clientY: event.clientY,
        screenX,
        screenY,
        worldX: x,
        worldY: y,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
    },
    [onMouseDown, toWorld]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const { x, y } = toWorld(screenX, screenY);

      onMouseMove?.({
        clientX: event.clientX,
        clientY: event.clientY,
        screenX,
        screenY,
        worldX: x,
        worldY: y,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
    },
    [onMouseMove, toWorld]
  );

  const handleMouseUp = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const { x, y } = toWorld(screenX, screenY);

      onMouseUp?.({
        clientX: event.clientX,
        clientY: event.clientY,
        screenX,
        screenY,
        worldX: x,
        worldY: y,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
    },
    [onMouseUp, toWorld]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const { x, y } = toWorld(screenX, screenY);

      onWheel?.({
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        screenX,
        screenY,
        worldX: x,
        worldY: y,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
    },
    [onWheel, toWorld]
  );

  return {
    canvasRef,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
  };
};

# Cursor Hit-Testing + Edge/Fill Detection Design

## Summary
Implement Figma-like cursor feedback for edge vs fill hover, plus `not-allowed` on locked nodes. The solution adds a shape-aware hit test that returns `{ node, kind: 'edge' | 'fill', locked }`, and updates cursor/interaction logic to use that result. Edge detection is **stroke-aware and screen-pixel stable**.

## Goals
- Distinguish **edge** vs **fill** hover for frames/rectangles/ellipses/paths/images.
- Treat text as **fill-only** (no edge in v1).
- Show `not-allowed` for locked nodes and block interaction (but still hit-test).
- Keep edge thickness stable across zoom and aligned to visible stroke width.

## Non-Goals (v1)
- Rotation-aware hit testing (defer until rotation rendering exists).
- Corner-radius specific edge logic (rect edges are sharp for now).
- Global cursor system outside the canvas.

## Proposed API
Add a new hit-test entry point in `src/interaction/tools`:

```ts
type HitKind = 'edge' | 'fill';
type HitResult = { node: Node; kind: HitKind; locked: boolean };

hitTestNodeAtPosition(
  doc: Document,
  worldX: number,
  worldY: number,
  zoom: number,
  options?: { hitSlopPx?: number; edgeMinPx?: number }
): HitResult | null
```

This returns the **topmost** hit (reverse child order), including locked nodes.

## Transform Handling
All hit-testing is done in **node-local space** using a single helper:

```ts
toLocalPoint(world, worldTransform)
```

- v1: inverse translate (current render behavior).
- v2: inverse translate + scale.
- v3: inverse full matrix.

No call sites should inline `world - nodeWorld`; only the helper does transforms.
Rotation is intentionally **not** applied until render uses it.

## Edge Thickness (Screen-Px Stable)
Let `zoomSafe = max(zoom, 0.0001)`. Define:

```
edgeWorld = max(strokeWidth / 2, EDGE_MIN_PX / zoomSafe) + HIT_SLOP_PX / zoomSafe
```

This includes a forgiving **outer band** and reflects visible stroke width.

## Shape Hit Rules
### Rect / Frame / Image
Local rect: `(0, 0, width, height)`.
If point is inside the **expanded** rect (inflated by `edgeWorld`):
- Compute distance to original rect edges:
  `d = min(x, y, width - x, height - y)` where `(x, y)` is clamped to the original rect.
- If point is outside original rect but inside expanded => **edge**.
- Else if `d <= edgeWorld` => **edge**.
- Else => **fill** (only if fill exists).
Otherwise => miss.

### Ellipse
Use `Path2D` in local space.  
Edge: `ctx.isPointInStroke` with `lineWidth = edgeWorld * 2`.  
Fill: `ctx.isPointInPath` only if fill exists.

### Path
Use `Path2D` with optional `fillRule`.  
Edge: `isPointInStroke` with `lineWidth = edgeWorld * 2` (supports stroke-only paths).  
Fill: `isPointInPath` if fill exists.

### Text
Fill-only: bounds hit (with hit slop). No edge classification in v1.

## Locked Nodes
Locked nodes still return a hit, but:
- Cursor forced to `not-allowed`.
- Pointer-down does **nothing** (no selection, no drag, no marquee).
- Right-click behavior stays unchanged.

## Cursor Resolution (Priority)
1) drag/resize/pan states  
2) hoverHandle  
3) locked hit => `not-allowed`  
4) edge hit => `move`  
5) fill hit => `pointer`  
6) tool cursors (e.g., rectangle/text crosshair)  
7) default

## Error Handling / Fallbacks
- If `Path2D` or 2D context is unavailable, fall back to rect bounds.
- Treat NaN coords as miss.
- Zero-size nodes: miss.

## Testing Checklist
- Thin vs thick stroke edges at multiple zoom levels.
- Stroke-only paths selectable near outline.
- Ellipse edge vs fill.
- Image edge vs fill.
- Nested nodes (parent accumulation).
- Very small shapes (1–2 px).
- Locked node on top (cursor + blocked interaction).


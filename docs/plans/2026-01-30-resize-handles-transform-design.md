# Resize Handles + Transform Session Design

## 1) Goals / Non-Goals
### Goals
- Figma-like resize handles with **8 directions** (n/s/e/w + corners).
- **Shift** preserves aspect ratio for **all handles** (including edges).
- **Alt** resizes from center; **Shift+Alt** combines center + aspect lock.
- **Overlay transform session** for live preview; **single atomic commit** on mouseup.
- **Multi-select** scaling using normalized edge math.
- **Transform-aware geometry accessor** used by renderer + hit-testing + selection UI.

### Non-Goals (v1)
- Rotation rendering (axis-aligned math only).
- Auto-layout constraints.
- Smart distribution or advanced snapping (guides only later).

## 2) Terminology
- **Bounds**: axis-aligned rect `{ x, y, width, height }`.
- **Handle**: one of `n|s|e|w|nw|ne|sw|se`.
- **Anchor**: fixed side/corner or center used to derive new bounds.
- **activeIds**: selected node IDs that are **unlocked** (participate in transform).
- **Preview overrides**: ephemeral rects derived from the session used for render + hit-test.

## 3) Hit-Testing + Cursor Prerequisites (recap)
- Shape-aware hit testing returns `edge` vs `fill`, and locked status.
- Cursor priority already accounts for edge vs fill and locked nodes.
- Handles are hit-tested against **selection bounds** with hit slop.
- While dragging, **hover updates are ignored** to avoid jitter.

## 4) Transform Session Model
**Purpose:** hold immutable inputs and ephemeral state for a drag-resize preview, then commit once.

### Session Inputs (captured on pointer-down)
- `selectionIds`
- `activeIds = selectionIds.filter(unlocked)`
- `initialBounds` (computed from activeIds only)
- `normalizedEdgesById` (see §7)
- `handle`
- `startPointerWorld`
- `aspectRatio = initialBounds.width / initialBounds.height`

### Derived (ephemeral) per frame
- `modifiers` (Shift/Alt from input state)
- `currentPointerWorld`
- `newBounds`
- `previewRectsById` (derived only; not persisted)

### Lifecycle
1. **Pointer down** on handle → create session.
2. **Pointer move** → recompute preview rects via session math.
3. **Pointer up** → commit a **single** transform command with before/after rects.
4. **Esc** → cancel and discard session.

## 5) Resize Math by Handle (axis-aligned)
Compute candidate sides from `initialBounds + handle + currentPointer`:

- Define `left/right/top/bottom` for **anchored** and **moving** sides.
- **No Alt:** anchor is opposite **side** (edge handles) or **corner** (corner handles).
- **Alt:** anchor is **center** (both axes).

Examples (no Alt, no Shift):
- `se`: `left = anchor.x`, `top = anchor.y`, `right = current.x`, `bottom = current.y`
- `e`: `left = initial.left`, `right = current.x`, `top = initial.top`, `bottom = initial.bottom`
- `n`: `top = current.y`, `bottom = initial.bottom`, `left = initial.left`, `right = initial.right`

After candidates:
- Apply **aspect lock** if Shift (see §6).
- Apply **snap** (dragged axis only), then **re-apply aspect** if snap changed that axis.
- Apply **min-size clamp** by moving only dragged side(s), keeping anchor fixed.

## 6) Modifier Semantics
### Alt (center resize)
- Anchor = center of `initialBounds` on both axes.
- Moving sides are symmetric around center.

### Shift (preserve aspect ratio)
- **Corner handles:** use dominant delta (abs dx vs dy) to compute size.
- **Edge handles:** still enforce uniform scale:
  - Dragged axis changes from pointer.
  - Other dimension is derived by aspect ratio.
  - Orthogonal expansion is symmetric around the **anchor axis**:
    - No Alt: keep **orthogonal center line** fixed (E/W keeps centerY, N/S keeps centerX).
    - Alt: expand symmetrically around center.

### Shift + Alt
- Center resize + aspect lock combined.

## 7) Multi-Select Normalization
Store normalized **edges** per node relative to `initialBounds`:

- `nl = (x - bounds.x) / bounds.w`
- `nt = (y - bounds.y) / bounds.h`
- `nr = (x+w - bounds.x) / bounds.w`
- `nb = (y+h - bounds.y) / bounds.h`

Recompute from `newBounds`:
- `x = new.x + nl * new.w`
- `y = new.y + nt * new.h`
- `w = (nr - nl) * new.w`
- `h = (nb - nt) * new.h`

This preserves spacing and avoids drift when min-size clamps occur.

## 8) Integration Points
**Transform-aware accessor:**
`getNodeRect(id, doc, session)` returns preview rect if session active and id in `activeIds`.

All geometry reads **must** go through the accessor:
- Draw list builder
- Hit-test + handle hit-test
- Selection bounds
- Snapping/guides (moving selection at minimum)

Selection UI highlights **all** `selectionIds`, but bounds/handles are computed from **activeIds** only.

## 9) Command + Undo Model
Use a single atomic command:

```ts
TransformNodesCommand {
  reason: 'resize' | 'move' | 'nudge' | ...,
  handle?: Handle,
  beforeRectsById: Record<string, Rect>,
  afterRectsById: Record<string, Rect>
}
```

- Apply `afterRectsById` in one reducer pass.
- Undo applies `beforeRectsById` (O(1), stable even after later edits).
- Locked nodes are **excluded** from both before/after maps.

## 10) Edge Cases & Invariants
- **Locked selection:**
  - If **all selected** are locked → `not-allowed`, no handles, no session.
  - If **any unlocked** → allow transform, but skip locked in preview + commit.
- **Min size:** clamp after aspect + snapping, keeping anchor fixed.
- **Snap order:**
  1) candidate sides from pointer + anchor
  2) apply aspect
  3) snap dragged axis
  4) re-apply aspect if snap changed that axis
  5) min-size clamp
- **Hover during drag:** ignore hover updates; cursor locked to drag mode.
- **Stroke-only / hit-test:** edge vs fill handled by hit-test layer; resize handles use bounds.

## 11) Future Extensions
- Rotation (store in transform command, add matrix transforms to preview accessor).
- Constraints + auto-layout interactions.
- Snap guides (alignment to other nodes).
- Coalesced keyboard nudge commands.


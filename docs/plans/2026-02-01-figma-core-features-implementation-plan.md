# Figma Core Features Implementation Plan (Galileo)

## Purpose
Capture what Galileo already supports and what core Figma-like features we should add next before the AI flow deep dive.

## What We Have (Built So Far)
### Document + Commands
- Node-based document model (NodeMap AST) with frames, groups, rectangles, text, images, ellipses, paths, componentInstance.
- Command system with history (undo/redo), plus autosave and .galileo serialization.
- Asset store for images (base64 + metadata).

### Tools + Interaction
- Tools: select, hand/pan, frame, rectangle, text.
- Marquee select, multi-select, deep select (Cmd/Ctrl), select-behind cycling (Alt), container focus (Enter).
- Move + resize (single and multi), aspect ratio lock, edge/fill hit testing.
- Snapping: grid + sibling edges with visual guides; temporary disable with Alt/Meta.
- Zoom + pan with wheel; spacebar temporary pan mode.

### Panels + UI
- Layers panel: tree, expand/collapse, rename, reorder via drag, lock/visibility toggles.
- Properties panel: position, size, rotation, fill, opacity, corner radius, text content + font controls,
  basic auto-layout controls (direction, gap, alignment, padding), clip content.
- Action bar: tools, device frame presets, save/load, import image.
- Context menu: duplicate, delete, rename, group/ungroup, lock/visibility, z-order.

### Rendering + Export
- Canvas 2D renderer with draw list.
- Frame clipping support, images, text rendering, paths.
- Snapshot export API (used by plugins).

### File I/O + Plugins
- Save/load dialogs, image import (file, paste, drag/drop).
- Plugin system + plugin manager; builtin MockRocket plugin.

## What We Should Build Next (Core Figma Parity)
### P0: Editing Parity (Must-Have)
- Constraints: per-child horizontal/vertical constraints for items inside frames (not groups).
- Layout guides on frames: uniform grid + rows + columns with gutter/margins; use as snap targets.
- Auto-layout parity: hug/fill/fixed sizing modes, cross-axis alignment options, wrap/grid flows.
- Vector tools: pen tool, vector edit mode, point/handle editing, add/delete points.
- Boolean ops: union/subtract/intersect/exclude as non-destructive boolean nodes.
- Strokes + effects: full stroke controls (position/joins/caps), shadows/blur/effects panel.
- Text parity: line height, letter spacing, alignment, text resize modes (auto/fixed), text on path (later).

#### P0 Acceptance Criteria (Concise)
- Constraints: resizing a frame keeps pinned edges pinned, centered elements centered, and stretch elements resizing correctly.
- Layout guides: grids/columns/rows render only when frame selected; guides act as snap targets.
- Auto-layout: hug/fill/fixed sizing works for both axes; spacing and alignment match expected layout when adding/removing children.
- Vector tools: users can create closed paths, edit points/handles, and see accurate bounds + hit testing.
- Boolean ops: non-destructive node stores operands; result updates when operands change.
- Strokes/effects: stroke width/position/caps/joins render correctly; at least drop shadow + blur available.
- Text parity: line height and letter spacing affect rendering + bounds; text align left/center/right works.

### P1: Design System + File Structure
- Multi-page files and left sidebar tabs for Pages/Layers/Assets.
- Components + instances + variants (assets panel, overrides).
- Shared styles: paints, text styles, effect styles, layout guide styles.

#### P1 Acceptance Criteria (Concise)
- Pages: users can add, rename, reorder, and delete pages; switching pages preserves per-page selection/zoom.
- Assets: components appear in Assets tab and can be inserted into canvas; instances can be detached.
- Variants: users can define variant properties/values and switch instance variants from properties panel.
- Styles: styles can be created, applied, swapped, and edited; instances update on style changes.

### P2: Collaboration + Prototyping (Later Core)
- Realtime multi-user collaboration (presence, cursors, selection).
- Prototyping flows, interactions, previewer.

#### P2 Acceptance Criteria (Concise)
- Collaboration: multiple users can edit same file with cursors/selection presence and conflict-free ops.
- Prototyping: frames can be linked with interactions and previewed in a player.

## Suggested Order (Fastest User Value)
1) Constraints + layout guides
2) Auto-layout parity (hug/fill/fixed)
3) Vector toolset + boolean ops
4) Strokes/effects + text parity
5) Pages + assets + components/variants
6) Collaboration + prototyping

## Implementation Anchors (Where To Work)
- Geometry + constraints + guides: `src/core/doc/geometry.ts`, `src/core/doc/geometry-cache.ts`
- Tools + selection: `src/interaction/tools/index.ts`, `src/interaction/handles.ts`
- Transform logic: `src/interaction/transform-session.ts`
- Properties UI: `src/ui/PropertiesPanel.tsx`
- Layers + panels: `src/ui/LayersPanel.tsx`, `src/ui/ActionBar.tsx`
- Render + export: `src/render/draw-list/builder.ts`, `src/render/canvas-renderer/index.ts`
- Commands + history: `src/core/commands/*`

## P0 Task Breakdown (By Feature)
### Constraints
- Data model: add constraint fields to `src/core/doc/types.ts` (per-node horizontal/vertical constraint enums).
- Geometry: apply constraints when parent frame resizes in `src/core/doc/geometry.ts`; cache in `src/core/doc/geometry-cache.ts`.
- Interaction: capture constraint snapshots at transform start in `src/interaction/transform-session.ts`.
- UI: add constraint controls in `src/ui/PropertiesPanel.tsx` for children of frames.
- Commands: add `setConstraints` or reuse `setProps` in `src/core/commands/types.ts` + executor.

### Layout Guides
- Data model: add frame guide config in `src/core/doc/types.ts` (grid/columns/rows).
- Geometry: compute guide lines + snap targets in `src/core/doc/geometry.ts`.
- Interaction: feed guide snap targets into `src/interaction/snapping.ts`.
- UI: guide editor in `src/ui/PropertiesPanel.tsx`; show guides in `src/ui/Canvas.tsx`.
- Render: draw guide overlays (selection-only) via draw list + overlay layer.

### Auto-Layout Parity
- Data model: expand layout schema in `src/core/doc/types.ts` to support hug/fill/fixed and alignment modes.
- Geometry: update `computeAutoLayoutPositions` in `src/core/doc/geometry.ts`.
- UI: expose sizing/align modes in `src/ui/PropertiesPanel.tsx`.
- Interaction: ensure child resize/move respects auto-layout rules in `src/App.tsx`.

### Vector Tools
- Data model: introduce vector point/segment structure in `src/core/doc/types.ts` (or normalize `path`).
- Tools: add pen + vector edit tool in `src/interaction/tools/index.ts`.
- Interaction: point hit testing + handles in `src/interaction/handles.ts`.
- Render: path rendering in `src/render/draw-list/builder.ts` + `src/render/canvas-renderer/index.ts`.
- Commands: add vector-edit commands (add/move/delete point) in `src/core/commands/types.ts`.

### Boolean Ops
- Data model: add boolean node type with operands in `src/core/doc/types.ts`.
- Geometry: compute boolean result bounds in `src/core/doc/geometry.ts`.
- Render: evaluate operands + output derived path in `src/render/draw-list/builder.ts`.
- UI: boolean ops controls (union/subtract/intersect/exclude) in `src/ui/PropertiesPanel.tsx` or toolbar.
- Commands: create boolean op command in `src/core/commands/types.ts`.

### Strokes + Effects
- Data model: expand stroke schema in `src/core/doc/types.ts` (position, joins, caps, dash).
- Render: implement stroke attributes in `src/render/canvas-renderer/index.ts`.
- UI: stroke/effects sections in `src/ui/PropertiesPanel.tsx`.
- Effects: add shadow/blur properties + render in `src/render/draw-list/builder.ts`.

### Text Parity
- Data model: add lineHeight, letterSpacing, textAlign in `src/core/doc/types.ts`.
- Render: apply to text rendering in `src/render/canvas-renderer/index.ts`.
- UI: add controls in `src/ui/PropertiesPanel.tsx`.
- Geometry: update text measurement logic in `src/App.tsx` and bounds in `src/core/doc/geometry.ts`.

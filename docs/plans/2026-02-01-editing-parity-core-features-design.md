# Editing Parity Core Features Design

## Summary
Prioritize editing parity (frames/groups/selection, constraints + layout guides, vector tools, boolean ops) to reach "feels like Figma" for daily workflows. This document captures feature scope, acceptance criteria, and architecture rules to avoid future rewrites.

## Goals
- Frames/groups behave like Figma: explicit frame size, group auto-bounds, predictable selection.
- Constraints and layout guides for responsive resizing.
- Pen tool + vector edit mode with node/segment edits.
- Boolean ops for practical shape building with non-destructive behavior.
- Stable architecture: container rules, constraint anchors, derived geometry cache.

## Non-Goals (v1)
- Full component system, variants, shared styles.
- Advanced auto-layout (wrap, grid, hug/fill behavior) beyond basic needs.
- Full text-to-outline pipeline (see boolean ops text policy).
- Rotation-aware resizing and advanced snapping.

## Current State Snapshot (as of 2026-02-01)
- Tools: select, hand, rectangle, text; device presets.
- Selection: marquee, multi-select, deep-select via Cmd/Ctrl; resize handles (single selection).
- Nodes: frame, group, rectangle, text, image, ellipse, path, componentInstance.
- Panels: layers (reorder, rename), properties (position/size/rotation, fill, opacity, corner radius, text styles), basic auto-layout controls.
- Rendering: canvas 2D, hit-testing with edge vs fill.
- File: save/load, undo/redo, autosave, image import.

## Scope A: Containers + Selection Parity
### Ship
- Frame tool (separate from rectangle).
- Frame behavior: explicit size, optional clip content toggle, distinct outline.
- Group behavior: auto-bounds to visible children; no explicit size.
- Selection rules: enter/exit container, select-behind cycle, select layer menu, auto-select parent rules.
- Multi-selection resize handles.

### Acceptance
Designers can build basic UI layouts with frames + groups without fighting selection or clipping.

## Scope B: Constraints + Layout Guides
### Ship
- Per-node constraints (horizontal + vertical): min/center/max/stretch/scale.
- Constraint editing UI in properties panel for nodes inside frames.
- Layout guides on frames: uniform grid, columns, rows with count, gutter, margins, alignment.
- Guides visible on frame selection and available as snap targets.

### Acceptance
Resizing a frame keeps pinned elements pinned, centered elements centered, and stretch elements resizing.

## Scope C: Vector Toolset
### Ship
- Pen tool (P): place points, drag for handles, close path, enter to finish.
- Vector edit mode (Enter to enter, Esc to exit).
- Node selection + handles; add/delete points; convert corner/smooth.
- Basic stroke rendering model (caps/joins). Accurate bounds + hit-testing.

### Acceptance
Users can draw icons and adjust points like in a real design tool.

## Scope D: Boolean Operations
### Ship
- Union/Subtract/Intersect/Exclude.
- Boolean node stores operands (non-destructive); derived path for render/hit-test.
- Operands limited to shapes/vectors/text; disallow frames/sections.
- Text policy (choose one):
  - Option A (v1 recommended): convert text to outlines on boolean creation.
  - Option B: disallow text in boolean ops with clear feedback.

### Acceptance
Shape building workflows work for UI icons and masks without destructive edits.

## Architecture Rules (Must-Haves)
1) Container model: frames explicit size, groups auto-bounds. Frames only container that enforces constraints and hosts layout guides.
2) Constraint anchor snapshot: capture child offsets at resize start; apply during preview/commit. Keep snapshot in transform session.
3) Derived geometry cache: cache bounds, layout positions, vector Path2D, boolean result paths, text metrics. Invalidate by node id on edits.
4) Boolean ops: non-destructive node with operand refs; text handled explicitly by policy above.

## Data Flow
- Interaction -> preview transform (includes constraints for frame children) -> render from derived geometry -> commit command.
- Block unsupported ops (constraints on groups, boolean ops on frames).

## Testing Checklist
- Frame vs group bounds; clip content behavior.
- Selection: enter/exit container, select-behind cycling, select layer menu.
- Constraints: left/right/center/stretch/scale in both axes.
- Layout guides: fixed vs stretch, snapping behavior.
- Vector edits: add/delete points, convert corner/smooth, closed paths.
- Boolean ops: each operation, text policy, non-destructive edits.

## Milestones (fast ROI)
1) Frames/groups parity + selection polish
2) Constraints (basic)
3) Pen tool + vector edit mode
4) Boolean ops
5) Layout guides (grid/columns/rows)
6) Auto-layout upgrades (wrap/grid, resize behaviors)

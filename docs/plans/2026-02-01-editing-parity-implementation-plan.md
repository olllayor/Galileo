# Editing Parity v1 (Milestone 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship frames/groups parity + selection polish (foundation for constraints/vectors/boolean ops).

**Architecture:** Add explicit frame vs group semantics in geometry + rendering, introduce clip behavior on frames, and implement container-aware selection + select-behind cycling. Build pure helpers for selection/geometry to keep logic deterministic.

**Tech Stack:** React 18 + TypeScript, Canvas 2D renderer, Zod schemas, Bun.

---

## Scope Status (2026-02-01)

- File + structure basics (multi-page files, pages/assets tabs): Not started
- Containers & selection parity (frame tool + frame behaviors distinct from groups): Partial
- Vector toolset (pen, vector edit mode, vector networks, node editing): Not started
- Shape combining (boolean ops): Not started
- Layout & responsiveness (constraints + layout guides + deeper auto-layout): Partial (basic auto-layout only)
- Design system core (components/instances/variants + overrides): Not started
- Styles system (shared color/text/effect/layout-guide styles): Not started

---

### Task 1: Enforce group auto-bounds + frame explicit size in geometry

**Files:**
- Modify: `src/core/doc/geometry.ts`
- Modify: `src/core/doc/geometry-cache.ts`

**Step 1: Add group local-bounds helper**

```ts
export const computeGroupLocalBounds = (children: Node[]): Bounds => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const child of children) {
    if (child.visible === false) continue;
    const left = child.position.x;
    const top = child.position.y;
    const right = child.position.x + child.size.width;
    const bottom = child.position.y + child.size.height;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};
```

**Step 2: Use group bounds when computing world bounds**

```ts
const getNodeLocalBounds = (node: Node, children: Node[]): Bounds => {
  if (node.type === 'group') {
    return computeGroupLocalBounds(children);
  }
  return { x: 0, y: 0, width: node.size.width, height: node.size.height };
};

// inside buildWorldBoundsMap before assigning boundsMap
const localBounds = getNodeLocalBounds(node, childNodes);
const width = override?.width ?? localBounds.width;
const height = override?.height ?? localBounds.height;
```

**Step 3: Mirror change in geometry-cache**

- Update any cached bounds logic to use the same helper.

**Step 4: Commit**

```bash
git add src/core/doc/geometry.ts src/core/doc/geometry-cache.ts
git commit -m "feat: compute group bounds from children"
```

---

### Task 2: Add frame tool + clipContent property

**Files:**
- Modify: `src/core/doc/types.ts`
- Modify: `src/interaction/tools/index.ts`
- Modify: `src/ui/ActionBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/PropertiesPanel.tsx`
- Modify: `src/render/draw-list/builder.ts`
- Modify: `src/render/canvas-renderer/index.ts`

**Step 1: Add `clipContent` to node schema**

```ts
clipContent: z.boolean().optional(),
```

**Step 2: Add Frame tool**

```ts
export const createFrameTool = (): Tool => ({
  type: 'frame',
  handleMouseDown: (doc, x, y) => {
    const newNode: Partial<Node> & { type: Node['type'] } = {
      type: 'frame',
      name: 'Frame',
      position: { x, y },
      size: { width: 300, height: 200 },
      fill: { type: 'solid', value: '#ffffff' },
      clipContent: false,
      visible: true,
    };

    return createNode(doc, doc.rootId, newNode);
  },
});
```

**Step 3: Wire tool in UI + shortcuts**
- Add Frame button to action bar.
- Add keybinding (e.g., `F`).
- Handle frame tool creation path in `src/App.tsx`.

**Step 4: Add clip toggle to properties**

```tsx
<label>
  <input
    type="checkbox"
    checked={Boolean(selectedNode.clipContent)}
    onChange={(e) => handleInputChange('clipContent', e.target.checked)}
  />
  Clip content
</label>
```

**Step 5: Clip content in renderer**
- Emit a `frame` draw command with `clipContent`.
- In renderer, wrap child drawing in `ctx.save()/clip()/restore()` when enabled.

**Step 6: Commit**

```bash
git add src/core/doc/types.ts src/interaction/tools/index.ts src/ui/ActionBar.tsx src/App.tsx src/ui/PropertiesPanel.tsx src/render/draw-list/builder.ts src/render/canvas-renderer/index.ts
git commit -m "feat: add frame tool and clip content"
```

---

### Task 3: Selection parity (container focus + select-behind cycle)

**Files:**
- Modify: `src/interaction/tools/index.ts`
- Modify: `src/App.tsx`

**Step 1: Add hit stack helpers**

```ts
export const pickHitCycle = (ids: string[], cycleIndex: number): string | null => {
  if (!ids.length) return null;
  const index = ((cycleIndex % ids.length) + ids.length) % ids.length;
  return ids[index] ?? null;
};

export const getHitStackInContainer = (doc: Document, hitIds: string[], containerId: string | null): string[] => {
  if (!containerId) return hitIds;
  return hitIds.filter((id) => isDescendantOf(doc, id, containerId));
};
```

**Step 2: Wire container focus + hit cycling in editor**
- Track active container focus (enter/exit) in state.
- On click with select-behind modifier (Alt/Option), cycle through hit stack.
- Respect container focus by filtering hit stack to descendants.

**Step 3: Commit**

```bash
git add src/interaction/tools/index.ts src/App.tsx
git commit -m "feat: add container focus and select-behind cycling"
```

---

### Task 4: Multi-selection resize handles

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/interaction/handles.ts`
- Create: `src/interaction/transform-session.ts`

**Step 1: Add normalized edge helpers**

```ts
export type NormalizedEdges = { nl: number; nt: number; nr: number; nb: number };

export const computeNormalizedEdges = (
  bounds: { x: number; y: number; width: number; height: number },
  node: { x: number; y: number; width: number; height: number },
): NormalizedEdges => ({
  nl: (node.x - bounds.x) / bounds.width,
  nt: (node.y - bounds.y) / bounds.height,
  nr: (node.x + node.width - bounds.x) / bounds.width,
  nb: (node.y + node.height - bounds.y) / bounds.height,
});

export const applyNormalizedEdges = (
  bounds: { x: number; y: number; width: number; height: number },
  edges: NormalizedEdges,
) => ({
  x: bounds.x + edges.nl * bounds.width,
  y: bounds.y + edges.nt * bounds.height,
  width: (edges.nr - edges.nl) * bounds.width,
  height: (edges.nb - edges.nt) * bounds.height,
});
```

**Step 2: Use transform session for multi-resize**
- Build normalized edges for all selected nodes.
- While resizing, compute new bounds and update all selected nodes proportionally.
- Commit single transform command with before/after bounds for all nodes.

**Step 3: Commit**

```bash
git add src/interaction/transform-session.ts src/App.tsx src/interaction/handles.ts
git commit -m "feat: multi-selection resize handles"
```

---

### Task 5: Manual validation checklist

**Files:**
- None (manual check)

**Step 1: Run dev server**

Run: `bun run dev`

**Step 2: Validate behaviors**
- Create a frame via Frame tool and toggle clip content.
- Group two rectangles; confirm group bounds update with child moves.
- Enter/exit container selection with Enter/Esc.
- Cycle through overlapping layers via Alt/Option+Click.
- Multi-select resize handles respond and scale positions.

**Step 3: Commit verification note**

```bash
git commit -m "chore: verify milestone 1 manual checks" --allow-empty
```

---

## Open Questions
- Clip content default for new frames: off or on?
- Boolean text policy (outline vs disallow) for milestone 4?

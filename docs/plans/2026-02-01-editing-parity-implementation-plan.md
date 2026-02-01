# Editing Parity v1 (Milestone 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship frames/groups parity + selection polish (foundation for constraints/vectors/boolean ops).

**Architecture:** Add explicit frame vs group semantics in geometry + rendering, introduce clip behavior on frames, and implement container-aware selection + select-behind cycling. Build pure helpers for selection/geometry to enable unit tests.

**Tech Stack:** React 18 + TypeScript, Canvas 2D renderer, Zod schemas, Bun, Vitest.

---

### Task 1: Add unit test harness (Vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/core/doc/__tests__/geometry.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { computeGroupLocalBounds } from '../geometry';
import type { Node } from '../types';

describe('computeGroupLocalBounds', () => {
  it('returns bounds that include visible children only', () => {
    const children: Node[] = [
      {
        id: 'a',
        type: 'rectangle',
        position: { x: 10, y: 20 },
        size: { width: 50, height: 40 },
        visible: true,
      },
      {
        id: 'b',
        type: 'rectangle',
        position: { x: -5, y: 5 },
        size: { width: 10, height: 10 },
        visible: false,
      },
    ];

    const bounds = computeGroupLocalBounds(children);
    expect(bounds).toEqual({ x: 10, y: 20, width: 50, height: 40 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test`  
Expected: FAIL with "computeGroupLocalBounds is not defined".

**Step 3: Write minimal implementation**

```ts
// src/core/doc/geometry.ts
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

**Step 4: Run test to verify it passes**

Run: `bun run test`  
Expected: PASS.

**Step 5: Commit**

```bash
git add package.json vitest.config.ts src/core/doc/__tests__/geometry.test.ts src/core/doc/geometry.ts
git commit -m "test: add vitest harness and group bounds tests"
```

---

### Task 2: Enforce group auto-bounds + frame explicit size in geometry

**Files:**
- Modify: `src/core/doc/geometry.ts`
- Modify: `src/core/doc/geometry-cache.ts`
- Modify: `src/core/doc/types.ts`

**Step 1: Write the failing test**

```ts
// src/core/doc/__tests__/geometry.test.ts
import { buildWorldBoundsMap } from '../geometry';
import type { Document } from '../types';

it('treats groups as auto-bounds from children', () => {
  const doc: Document = {
    version: 2,
    rootId: 'root',
    assets: {},
    nodes: {
      root: { id: 'root', type: 'frame', position: { x: 0, y: 0 }, size: { width: 100, height: 100 }, children: ['g'] },
      g: { id: 'g', type: 'group', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, children: ['c'] },
      c: { id: 'c', type: 'rectangle', position: { x: 10, y: 20 }, size: { width: 30, height: 40 } },
    },
  };

  const bounds = buildWorldBoundsMap(doc);
  expect(bounds.g).toEqual({ x: 0, y: 0, width: 30, height: 40 });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test`  
Expected: FAIL because group bounds still use stored size.

**Step 3: Write minimal implementation**

```ts
// src/core/doc/geometry.ts
const getNodeLocalBounds = (node: Node, children: Node[]): Bounds => {
  if (node.type === 'group') {
    return computeGroupLocalBounds(children);
  }
  return { x: 0, y: 0, width: node.size.width, height: node.size.height };
};

// inside buildWorldBoundsMap, before boundsMap assignment
const localBounds = getNodeLocalBounds(node, childNodes);
const width = override?.width ?? localBounds.width;
const height = override?.height ?? localBounds.height;
```

**Step 4: Run test to verify it passes**

Run: `bun run test`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/doc/geometry.ts src/core/doc/geometry-cache.ts src/core/doc/types.ts src/core/doc/__tests__/geometry.test.ts
git commit -m "feat: compute group bounds from children"
```

---

### Task 3: Add frame tool + clipContent property

**Files:**
- Modify: `src/core/doc/types.ts`
- Modify: `src/interaction/tools/index.ts`
- Modify: `src/ui/ActionBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/ui/PropertiesPanel.tsx`
- Modify: `src/render/canvas-renderer/index.ts`

**Step 1: Write the failing test**

```ts
// src/core/doc/__tests__/geometry.test.ts
import { validateNode } from '../types';

it('accepts clipContent on frames', () => {
  const ok = validateNode({
    id: 'f',
    type: 'frame',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 100 },
    clipContent: true,
  });
  expect(ok).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test`  
Expected: FAIL because clipContent not in schema.

**Step 3: Write minimal implementation**

```ts
// src/core/doc/types.ts
clipContent: z.boolean().optional(),

// src/interaction/tools/index.ts
export const createFrameTool = (): Tool => ({
  type: 'frame',
  handleMouseDown: (doc, x, y) => {
    const id = generateId();
    return {
      ...doc,
      nodes: {
        ...doc.nodes,
        [id]: {
          id,
          type: 'frame',
          name: 'Frame',
          position: { x, y },
          size: { width: 300, height: 200 },
          fill: { type: 'solid', value: '#ffffff' },
          clipContent: false,
        },
      },
    };
  },
});

// src/ui/PropertiesPanel.tsx (frame section)
<label>
  <input
    type="checkbox"
    checked={Boolean(selectedNode.clipContent)}
    onChange={(e) => handleInputChange('clipContent', e.target.checked)}
  />
  Clip content
</label>

// src/render/canvas-renderer/index.ts (frame draw)
if (command.type === 'frame' && command.clipContent) {
  this.ctx.save();
  this.ctx.beginPath();
  this.ctx.rect(command.x, command.y, command.width, command.height);
  this.ctx.clip();
  // draw children
  this.ctx.restore();
}
```

**Step 4: Run test to verify it passes**

Run: `bun run test`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/doc/types.ts src/interaction/tools/index.ts src/ui/ActionBar.tsx src/App.tsx src/ui/PropertiesPanel.tsx src/render/canvas-renderer/index.ts src/core/doc/__tests__/geometry.test.ts
git commit -m "feat: add frame tool and clip content"
```

---

### Task 4: Selection parity (container focus + select-behind cycle)

**Files:**
- Modify: `src/interaction/tools/index.ts`
- Modify: `src/App.tsx`
- Create: `src/interaction/__tests__/selection.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { pickHitCycle } from '../tools';

it('cycles through overlapping hits deterministically', () => {
  const hits = ['top', 'middle', 'bottom'];
  expect(pickHitCycle(hits, 0)).toBe('top');
  expect(pickHitCycle(hits, 1)).toBe('middle');
  expect(pickHitCycle(hits, 2)).toBe('bottom');
  expect(pickHitCycle(hits, 3)).toBe('top');
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test`  
Expected: FAIL because pickHitCycle not implemented.

**Step 3: Write minimal implementation**

```ts
// src/interaction/tools/index.ts
export const pickHitCycle = (ids: string[], cycleIndex: number): string | null => {
  if (!ids.length) return null;
  const index = ((cycleIndex % ids.length) + ids.length) % ids.length;
  return ids[index] ?? null;
};
```

**Step 4: Run test to verify it passes**

Run: `bun run test`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/interaction/tools/index.ts src/interaction/__tests__/selection.test.ts
git commit -m "test: add selection hit cycling helper"
```

---

### Task 5: Wire container focus + hit cycling in editor

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/interaction/tools/index.ts`

**Step 1: Write the failing test**

```ts
// src/interaction/__tests__/selection.test.ts
import { getHitStackInContainer } from '../tools';
import type { Document } from '../../core/doc/types';

it('filters hits to active container path', () => {
  const doc: Document = {
    version: 2,
    rootId: 'root',
    assets: {},
    nodes: {
      root: { id: 'root', type: 'frame', position: { x: 0, y: 0 }, size: { width: 200, height: 200 }, children: ['a', 'b'] },
      a: { id: 'a', type: 'group', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, children: ['c'] },
      b: { id: 'b', type: 'rectangle', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
      c: { id: 'c', type: 'rectangle', position: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
    },
  };

  const hits = ['b', 'c'];
  const filtered = getHitStackInContainer(doc, hits, 'a');
  expect(filtered).toEqual(['c']);
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test`  
Expected: FAIL because getHitStackInContainer not implemented.

**Step 3: Write minimal implementation**

```ts
// src/interaction/tools/index.ts
export const getHitStackInContainer = (doc: Document, hitIds: string[], containerId: string | null): string[] => {
  if (!containerId) return hitIds;
  return hitIds.filter((id) => isDescendantOf(doc, id, containerId));
};

const isDescendantOf = (doc: Document, nodeId: string, ancestorId: string): boolean => {
  let current = nodeId;
  while (true) {
    const parent = findParentNode(doc, current);
    if (!parent) return false;
    if (parent.id === ancestorId) return true;
    current = parent.id;
  }
};
```

**Step 4: Run test to verify it passes**

Run: `bun run test`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/interaction/tools/index.ts src/interaction/__tests__/selection.test.ts src/App.tsx
git commit -m "feat: add container-aware hit filtering"
```

---

### Task 6: Multi-selection resize handles (transform session)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/interaction/handles.ts`
- Create: `src/interaction/transform-session.ts`
- Create: `src/interaction/__tests__/transform-session.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { computeNormalizedEdges, applyNormalizedEdges } from '../transform-session';

it('preserves relative edges under resize', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  const node = { x: 10, y: 20, width: 20, height: 10 };
  const edges = computeNormalizedEdges(bounds, node);
  const next = applyNormalizedEdges({ x: 0, y: 0, width: 200, height: 200 }, edges);
  expect(next).toEqual({ x: 20, y: 40, width: 40, height: 20 });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test`  
Expected: FAIL because helper not implemented.

**Step 3: Write minimal implementation**

```ts
// src/interaction/transform-session.ts
export type NormalizedEdges = { nl: number; nt: number; nr: number; nb: number };

export const computeNormalizedEdges = (
  bounds: { x: number; y: number; width: number; height: number },
  node: { x: number; y: number; width: number; height: number },
): NormalizedEdges => {
  return {
    nl: (node.x - bounds.x) / bounds.width,
    nt: (node.y - bounds.y) / bounds.height,
    nr: (node.x + node.width - bounds.x) / bounds.width,
    nb: (node.y + node.height - bounds.y) / bounds.height,
  };
};

export const applyNormalizedEdges = (
  bounds: { x: number; y: number; width: number; height: number },
  edges: NormalizedEdges,
) => {
  const x = bounds.x + edges.nl * bounds.width;
  const y = bounds.y + edges.nt * bounds.height;
  const width = (edges.nr - edges.nl) * bounds.width;
  const height = (edges.nb - edges.nt) * bounds.height;
  return { x, y, width, height };
};
```

**Step 4: Run test to verify it passes**

Run: `bun run test`  
Expected: PASS.

**Step 5: Commit**

```bash
git add src/interaction/transform-session.ts src/interaction/__tests__/transform-session.test.ts
git commit -m "test: add normalized edge helpers for multi-resize"
```

---

### Task 7: Manual validation checklist

**Files:**
- None (manual check)

**Step 1: Run dev server**

Run: `bun run dev`

**Step 2: Validate behaviors**
- Create a frame via Frame tool and toggle clip content.
- Group two rectangles; confirm group bounds update with child moves.
- Enter/exit container selection with Enter/Esc.
- Cycle through overlapping layers via repeated click.
- Multi-select resize handles respond and scale positions.

**Step 3: Commit verification note**

```bash
git commit -m "chore: verify milestone 1 manual checks" --allow-empty
```

---

## Open Questions
- Should select-behind use a modifier key or time-windowed repeated click?
- Clip content default for new frames: off or on?
- Boolean text policy (outline vs disallow) for milestone 4?

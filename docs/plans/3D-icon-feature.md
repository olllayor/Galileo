Good. Then let’s **beat Figma**, not copy it.

Below is a **clear, structured, execution-ready plan** that upgrades Figma’s model in 3 key ways:

* smarter assets (editable, versioned)
* tighter performance + cost control
* better UX for designers

I’ll be direct.

---

## Goal

Ship **3D Icons as a first-class experience** without polluting the core editor, while staying faster, cheaper, and more flexible than how **Figma** does it.

---

# Galileo “Better-Than-Figma” 3D Icons Plan

## Principle 1: Core stays dumb, plugins stay powerful

Same as Figma — but we go further.

* ❌ No native 3D engine in canvas
* ❌ No WebGL / hit-testing / lighting in core
* ✅ Core only understands **images + metadata**
* ✅ Plugins own intelligence

This keeps Galileo fast forever.

---

## Principle 2: Smart Image Nodes (this is where we beat Figma)

Figma inserts **dead images**.

We insert **smart images**.

### Image Node Extension (non-breaking)

```ts
ImageNode {
  id
  width
  height
  imageBytes
  meta?: {
    kind: "3d-icon"
    provider: "3dicons"
    iconId: "camera"
    style: "clay"
    color: "#FF6A00"
    angle: "isometric"
    version: "v1"
  }
}
```

**Why this matters**

* Image behaves like normal image
* BUT:

  * can be re-edited
  * can be re-rendered
  * can be upgraded later

Figma cannot do this cleanly today.

---

## Phase 1 — Provider integration (3dicons first)

### Provider abstraction (important)

Do **not** hardcode 3dicons.

```ts
interface IconProvider {
  search(query): Icon[]
  getVariants(iconId): Variant[]
  render(params): RenderResult
}
```

First implementation:

* **3dicons**

Later:

* internal Galileo icons
* paid packs
* AI-generated icons

This avoids lock-in.

---

## Phase 2 — Rendering pipeline (where you outperform)

### Rendering is NOT client-side

Figma plugins often fetch raw assets directly.

We do better.

**Pipeline**

```
Plugin UI
  → Host RPC: renderIcon(params)
      → Provider API OR internal renderer
      → Cache lookup (hash-based)
      → Return bytes (PNG/WebP)
  ← Insert image node
```

### Cache key (critical)

```
provider + iconId + style + color + angle + size + version
```

Result:

* near-zero duplicate cost
* instant re-inserts
* scalable to AI later

---

## Phase 3 — UX that beats Figma

### UX Flow

1. Open **3D Icons panel** (plugin or built-in plugin shell)
2. Search / browse
3. Live preview (throttled)
4. Insert
5. Select image → **“Edit 3D Icon”** appears in properties panel
6. Reopens plugin with state restored
7. Update → image replaced

Figma **does not have step 5 natively**. This is a win.

---

## Phase 4 — Versioning & future-proofing (Figma doesn’t do this well)

Every inserted icon stores:

```json
{
  "providerVersion": "3dicons@2026-01",
  "renderVersion": "v1"
}
```

Benefits:

* Icons don’t silently change
* You can later:

  * upgrade icons in bulk
  * warn about deprecated styles
  * migrate to better renders

This is **enterprise-grade**.

---

## Phase 5 — Monetization-ready from day 1

Even if you don’t charge yet, design for it.

### Paths

* Free pack (3dicons CC0)
* Premium packs (rev share)
* AI-generated 3D icons (credits-based)
* Team-shared icon styles

Because everything is **image + metadata**, pricing logic stays outside the editor.

---

## What we are explicitly NOT doing (important)

* ❌ Native 3D nodes
* ❌ Scene graphs
* ❌ Camera gizmos in canvas
* ❌ Real-time lighting controls

Those kill velocity and don’t help designers 90% of the time.

---

## Why this is objectively better than Figma

| Area                 | Figma                    | Galileo               |
| -------------------- | ------------------------ | --------------------- |
| 3D handling          | Plugin-only, dead images | Plugin + smart images |
| Re-edit icon         | Limited                  | First-class           |
| Cost control         | Plugin-dependent         | Centralized cache     |
| Provider flexibility | Weak                     | Strong abstraction    |
| AI-ready             | Hard                     | Native                |

---

## Final call

This plan:

* matches Figma’s **correct constraints**
* removes their **biggest limitations**
* keeps Galileo clean, fast, and future-proof

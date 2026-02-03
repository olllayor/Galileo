Here’s a **native (built-in) background remover plan** that beats “Figma + plugin” on **quality, speed, cost, and UX**.

## What Figma does today (and the gap)

Most “remove background” in Figma is a **plugin calling a 3rd-party API** (often requires an API key and sends the image out). Example: the remove.bg Figma plugin requires you to sign up + paste an API key, then it runs via the plugin menu. ([remove.bg][1])

Your advantage: **make it native + non-destructive + refineable + cacheable**.

---

## North Star: “120–130% result”

To consistently outperform, you need **two things**:

1. **A strong base model** for initial cutout (accuracy on hair/fur/transparent edges).
2. **A great refinement workflow** (because real images are messy).

For the base model, current strong evidence points to **Cloudflare testing showing BiRefNet variants outperforming common alternatives, with high IoU/Dice on their eval sets. ([The Cloudflare Blog][2])
(You can still swap the model later; the architecture should be model-agnostic.)

---

## Core product decision: Local-first, Cloud-enhanced (hybrid)

### Why hybrid wins

* **Instant UX**: local preview in <1–2s on decent machines.
* **Cost control**: only pay server GPU when user commits.
* **Privacy**: “preview locally” is a killer marketing bullet.
* **Quality**: server model can be heavier + better.

### Local inference option (recommended)

Use **ONNX Runtime Web + WebGPU** for in-browser/desktop GPU inference, with WASM CPU fallback. This is a proven pattern and widely implemented. ([Webkul Software][3])
You can also leverage a ready OSS library like **IMG.LY’s background-removal-js**, which explicitly runs in browser via WebAssembly/WebGPU. ([img.ly][4])

### Cloud enhancement option (recommended)

Use cloud only for:

* “**HQ Cutout**” (better edges, fine details)
* “**Hair/Fur boost**”
* batch jobs

If you’re already on Cloudflare infra, note that **Cloudflare Images API added automatic background removal** and they discuss model evaluation + picking BiRefNet. ([The Cloudflare Blog][2])
(You can also run your own model behind your gateway—same architecture.)

---

## Galileo-native UX that beats plugins

### 1) One-click action, non-destructive

* Context menu + top toolbar: **Remove Background**
* Result is **NOT a new flattened image**.
* It becomes an **image + mask** (editable later).

### 2) “Good first result” + refinement panel

After auto cutout, open a small panel:

* **Refine**: brush *Keep* / *Remove*
* **Edge controls**: Feather, Shift Edge, Decontaminate, Smooth
* **Detect subject** toggle (if multiple objects)
* Background options: Transparent / Solid / Blur / Replace

### 3) Smart refine mode (v2)

Add a “click-to-fix” mode using a promptable segmenter:

* Click add/remove points to correct mask.
  A candidate foundation is **Meta AI’s Segment Anything Model 2 (SAM 2), built for fast, precise segmentation. ([AI Meta][5])
  (Probably server-side at first; it’s heavier than typical matting models.)

---

## Data model + rendering (how to make it feel “native”)

### Document schema

Extend your image node to store:

* `maskAssetId` (grayscale alpha mask PNG/WebP)
* `bgRemoveMeta`: `{ provider, model, modelVersion, params, createdAt, hash }`
* `editHistory`: optional (for brush strokes / refinement ops)

This enables:

* “Edit background removal” button in Properties
* deterministic re-renders
* cache keying by `(imageHash, modelVersion, params)`

### Renderer (Canvas2D)

Non-destructive compositing:

1. draw image to offscreen canvas
2. apply alpha mask into alpha channel (or composite using `destination-in`)
3. draw final to main canvas

### Export

Exports automatically preserve transparency because the alpha is real, not a visual trick.

---

## Cost + cache strategy (this is where you win long-term)

### Cache tiers

1. **Session cache (memory)**: avoid repeated runs while user iterates.
2. **Local persistent cache** (disk): `(imageHash + modelVersion + params) -> mask bytes`.
3. **Server cache** (KV/R2): same key, store mask output.

### When to call cloud

* Only after user clicks **Apply (HQ)** or exports/shares.
* If local model confidence is low (tiny subject, complex edges), suggest: “Upgrade to HQ”.

### Hashing

Use perceptual-ish stable hashing:

* raw bytes hash for exact match
* optional resized thumbnail hash for near-duplicates

---

## Engineering plan (MVP → v2)

### MVP (ships fast, already “better than plugin”)

1. **UI entry points**

   * Toolbar + context menu: Remove BG
   * Properties panel: Edit BG removal (if mask exists)
2. **Local inference pipeline**

   * onnxruntime-web + WebGPU, fallback WASM
   * model: start with a well-supported ONNX matting/segmentation model (MODNet/U2Net-class) then swap later
3. **Non-destructive mask storage**

   * mask as asset + metadata on node
4. **Refinement v1**

   * simple brush keep/remove
   * feather/smooth/shift edge sliders
5. **Caching**

   * session + disk cache keyed by image hash + model + params

**Acceptance criteria**

* One click removes background
* Can re-edit later
* Works offline (local path)
* <2s preview on typical machines, <10s worst-case CPU fallback

### v2 (quality jump to “120–130%”)

1. **HQ cloud cutout**

   * BiRefNet-class on server (your infra or Cloudflare-supported route) ([The Cloudflare Blog][2])
2. **Smart refine**

   * click-to-add/remove using SAM2-like prompt segmentation ([AI Meta][5])
3. **Batch remove**

   * multi-select images → queue jobs → progress UI
4. **Edge decontamination**

   * reduce color spill on hair/product edges (huge perceived quality win)

### v3 (wow features)

* Subject shadow generation
* Background blur with depth estimation
* Video/GIF background removal (SAM2 workflows exist, but keep it later) ([GitHub][6])

---

## Key risks (handle early)

* **Model licensing**: pick models with permissive/commercial-friendly terms; keep the system model-agnostic so you can swap.
* **WebGPU availability**: always include WASM CPU fallback.
* **Memory usage**: tile-based processing for large images; cap max resolution for preview, HQ for final.
* **Mask editing performance**: store brush strokes as vector ops, rasterize on commit.

---

## My recommendation (most practical winning route)

* **Ship MVP local-first** using ONNX Runtime Web + WebGPU (fast, private, cheap). ([Webkul Software][3])
* Add **HQ server mode** using a BiRefNet-tier model + strong caching. ([The Cloudflare Blog][2])
* Differentiate with **non-destructive editing + refinement UX** (that’s what turns “good” into “pro”).

If you want, I can turn this into an **implementation checklist mapped to your Galileo code structure** (schema changes, command pattern hooks, renderer changes, assets/cache layout, and the exact UI components to add).

[1]: https://www.remove.bg/a/figma-remove-background-plugin?utm_source=chatgpt.com "Figma Remove Background Plugin – remove.bg"
[2]: https://blog.cloudflare.com/background-removal/?utm_source=chatgpt.com "Evaluating image segmentation models for background ..."
[3]: https://webkul.com/blog/browser-based-background-remover-using-onnx/?utm_source=chatgpt.com "Browser Based Background Remover using ONNX ..."
[4]: https://img.ly/docs/cesdk/svelte/edit-image/remove-bg-9dfcf7/?utm_source=chatgpt.com "Remove Background from Images - Svelte | IMG.LY Docs"
[5]: https://ai.meta.com/research/sam2/?utm_source=chatgpt.com "Introducing Meta Segment Anything Model 2 (SAM 2)"


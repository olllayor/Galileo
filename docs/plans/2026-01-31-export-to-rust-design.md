# Export Encoding to Rust (A2) + Benchmarks Design

Date: 2026-01-31

## Summary
Move image export encoding (PNG) from JS to Rust while keeping Canvas2D rendering in the frontend. Add an optional `encoding` mode to `export.snapshot` for backward compatibility. Document a manual benchmark procedure in Markdown.

## Goals
- 5–10x faster export by moving PNG encoding to Rust.
- Keep Canvas2D renderer unchanged.
- Preserve plugin compatibility (`export.snapshot` default returns PNG base64).
- Enable future formats (WebP/AVIF) with minimal surface changes.
- Establish a lightweight, repeatable benchmark baseline.

## Non-goals
- Rebuilding rendering in Rust (no Skia/wgpu changes).
- Introducing new benchmark tooling or CI performance gates.
- Changing plugin permissions or breaking RPC contracts.

## Architecture Overview
- **Frontend** continues to render draw lists onto an offscreen canvas.
- **Raw RGBA** is extracted via `getImageData` and sent to Rust via binary IPC (`Uint8Array`).
- **Rust** encodes PNG bytes using the `png` crate and returns `Vec<u8>` to JS.
- **JS** optionally base64-encodes returned bytes for compatibility with existing plugin APIs.

## Data Flow
1. `exportNodeSnapshot` renders selection to canvas (unchanged).
2. If `encoding === 'raw'`:
   - Return `{ encoding: 'raw', data: Uint8Array, width, height }`.
3. If `encoding === 'png'` (default):
   - In Tauri: send `Uint8Array` RGBA to Rust `encode_png`.
   - Receive PNG bytes; convert to base64; return legacy `{ mime, dataBase64, width, height }`.
   - In web/dev (non-Tauri): fallback to `canvas.toDataURL`.
4. `fs.saveFile` adds optional binary path, using Rust `save_bytes` to avoid base64.

## API Changes
### JS
`export.snapshot` params:
- add `encoding?: 'png' | 'raw'` (default `png`).

`export.snapshot` results:
- `encoding === 'png'` → `{ mime: 'image/png', dataBase64, width, height }` (unchanged)
- `encoding === 'raw'` → `{ encoding: 'raw', data: Uint8Array, width, height }`

`fs.saveFile` params:
- optional `encoding?: 'base64' | 'binary'`
- for `binary`, use `dataBytes: Uint8Array`

### Rust
- `encode_png({ rgba: Vec<u8>, width: u32, height: u32 }) -> Vec<u8>`
- `save_bytes({ path: String, data: Vec<u8> }) -> ()`

## Error Handling
- JS validates node existence and canvas context as today.
- Rust validates `rgba.len() == width * height * 4`.
- If Rust encoding fails, JS falls back to `canvas.toDataURL` (desktop export should not hard-fail).
- `save_bytes` mirrors `save_binary` error mapping.

## Benchmarks
Create `docs/benchmarks/export-encoding.md` with:
- Environment metadata (OS, CPU/GPU, version, canvas size).
- Steps to export same selection at 1x and 2x.
- A table capturing:
  - Export mode (JS PNG vs Rust PNG)
  - Total time (ms)
  - Encoding time (ms, if instrumented)
  - Output size (KB)

## Open Questions
- Whether to expose Rust-encoded bytes for plugins in addition to the base64 response.
- Whether to add WebP/AVIF encoders in this iteration or later.

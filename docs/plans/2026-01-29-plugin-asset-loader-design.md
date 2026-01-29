# Plugin Asset Loader (RPC) Design

## Goal
Enable plugins running in a sandboxed iframe (origin = null) to load bundled and shared assets without HTTP fetch, while preserving strict security guarantees and a predictable, versioned asset surface.

## Scope
- New host RPC method: `asset.load`.
- Read-only access to plugin bundle assets and shared assets.
- Strict permission gating, allowlists, path normalization, and size limits.
- Base64 transport now; binary transfer later.

## Non-Goals (MVP)
- No network fetches from plugin.
- No `.gltf` dependency resolution (only `.glb` for models).
- No writable shared assets.

## Manifest Additions
```json
{
  "permissions": ["asset:read", "asset:read:shared"],
  "assets": {
    "bundle": ["models/iphone_16_free.glb", "env/studio.hdr"],
    "shared": ["v1/devices/iphone_16.glb"]
  }
}
```

Notes:
- `asset:read` gates bundle access.
- `asset:read:shared` gates shared access.
- Shared paths must be versioned (e.g. `v1/...`).

## RPC Contract
**Request**
```ts
{
  rpc: 1,
  id: string,
  method: "asset.load",
  params: {
    scope: "bundle" | "shared",
    path: string,
    encoding?: "base64" | "binary"
  }
}
```

**Response (MVP)**
```ts
{
  rpc: 1,
  id: string,
  ok: true,
  result: {
    mime: string,
    encoding: "base64",
    dataBase64: string,
    bytes: number,
    sha256?: string
  }
}
```

**Errors**
```ts
{ ok: false, error: { code: "invalid_path" | "forbidden_permission" | "forbidden_allowlist" | "not_found" | "too_large" | "unsupported_extension" | "unsupported_encoding", message: string } }
```

## Security and Path Rules
### Shared assets
- `sharedRootAbs = <resources>/plugins/shared/`
- Plugin supplies a **relative** path like `v1/devices/iphone_16.glb`.
- Host enforces `path` starts with `v1/` after normalization.
- Host resolves `join(sharedRootAbs, path)` and verifies the resolved path starts with `sharedRootAbs`.

### Bundle assets
- Bundle root is plugin folder (dev) or packaged bundle path (prod).
- Normalize, resolve, and enforce `startsWith(root)`.

### Allowlists and Extensions
- Allowlist is checked **after normalization**.
- Scope-specific extension allowlists:
  - Bundle: `.glb`, `.png`, `.jpg`, `.hdr`.
  - Shared: `.glb`, `.hdr`, `.png`.
- Models: MVP supports **`.glb` only**.

### Size Limits
- Enforce `maxBytes` (e.g. 50MB).
- Return `too_large` if exceeded.

## Host Resolution Strategy
- **Dev bundle**: read from local folder selected by “Load Dev Plugin…”.
- **Built-in bundle (prod)**: use a Tauri command to read packaged resources (no HTTP).
- **Shared (prod)**: read from bundled read-only `plugins/shared/<version>/...` via the same resource reader.

## Plugin Usage Pattern (MVP)
- Call `asset.load` to get base64 bytes.
- Convert base64 to `ArrayBuffer`.
- Use `GLTFLoader.parse` instead of `GLTFLoader.load`.
- Avoid `fetch()` completely to prevent CORS failures under `origin=null`.

## Future Extensions
- Support `encoding: "binary"` using `postMessage` transferable `ArrayBuffer`.
- Add `.gltf` with dependency resolution via additional `asset.load` calls.
- Cache using `sha256` and `bytes` to avoid redundant loads.

## Testing
- Unit tests: normalization, traversal protection, allowlist enforcement, size limit.
- Integration tests: load built-in bundle asset (prod path), load dev bundle asset, shared asset.
- Negative tests: missing permission, missing allowlist entry, unsupported extension, oversized file.
- Plugin smoke test: `asset.load` + GLB render path.

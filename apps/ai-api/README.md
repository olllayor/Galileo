# Galileo AI API

Standalone Vercel API service for Galileo Native AI Assistant V1.

## Endpoint

- `POST /api/edit`
- `POST /api/image/generate`

## Request Contract

```json
{
  "contractVersion": 1,
  "requestId": "req_123",
  "prompt": "Make this title bolder and move it up",
  "context": {
    "activePageId": "page_1",
    "selectionSummary": "Selected: 1 text",
    "selectedNodes": [],
    "canvas": { "width": 1280, "height": 800 }
  }
}
```

## Required Environment Variables

- `AI_GATEWAY_API_KEY`
- `ALLOWED_ORIGINS`
- `ALLOWED_TEXT_MODELS`
- `ALLOWED_IMAGE_MODELS`
- `DEFAULT_TEXT_MODEL`
- `DEFAULT_IMAGE_MODEL`

## Optional Environment Variables

- `GALILEO_CLIENT_KEY`
- `AI_MODEL` (deprecated text-model fallback only)

## Local Development

```bash
cd apps/ai-api
npm install
npm run dev
```

## Deploy

Deploy `apps/ai-api` as a separate Vercel project root.

## Notes

- Uses Vercel AI SDK `generateText` + structured `Output.object` for edit planning.
- Uses Vercel AI SDK `experimental_generateImage` for image generation.
- Enforces command guardrails and payload limits.
- CORS behavior is controlled by `ALLOWED_ORIGINS` (origins are normalized to `scheme://host[:port]`).
- Model choice is hard-allowlisted server-side by modality.
- In production:
  - `ALLOWED_ORIGINS` must be non-empty and must not include `*`.
  - `GALILEO_CLIENT_KEY` is required.
  - `ALLOWED_TEXT_MODELS` / `ALLOWED_IMAGE_MODELS` must stay within curated model IDs.

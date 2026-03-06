# Galileo AI API

Standalone Vercel API service for Galileo Native AI Assistant V1.

## Endpoint

- `POST /api/edit`
- `POST /api/image/generate`
- `POST /api/image/edit`

## API Contracts

Contracts are defined in `apps/ai-api/src/contracts.ts` and mirrored in `src/ai/contracts.ts`.

- `AIEditRequest` / `AIEditResponse`
- `AIImageGenerateRequest` / `AIImageGenerateResponse`
- `AIImageEditRequest` / `AIImageEditResponse`

Image edit requests accept a single selected source image payload and optional thread context for follow-up edits.

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
- `AI_GATEWAY_RESPONSES_URL` (override Responses endpoint used by image edit route)

## Local Development

```bash
cd apps/ai-api
npm install
npm run dev
```

## Deploy

Deploy `apps/ai-api` as a separate Vercel project root.

## Notes

- OpenAI-first intelligence policy:
  - planner/default text model: `openai/gpt-5`
  - image edit execution: best available configured image-edit model (`resolveImageEditModel`)
- Uses Vercel AI SDK `generateText` for edit planning and prompt normalization.
- Uses AI Gateway Responses for image edit output parsing.
- Enforces command guardrails and payload limits.
- CORS behavior is controlled by `ALLOWED_ORIGINS` (origins are normalized to `scheme://host[:port]`).
- Model choice is hard-allowlisted server-side by modality.
- In production:
  - `ALLOWED_ORIGINS` must be non-empty and must not include `*`.
  - `GALILEO_CLIENT_KEY` is required.
  - `ALLOWED_TEXT_MODELS` / `ALLOWED_IMAGE_MODELS` must stay within curated model IDs.

# Galileo Figma Bridge Plugin

This plugin exports the current Figma selection into a clipboard payload that Galileo can paste.

## Workflow
1. Select layers in Figma.
2. Click **Generate Galileo Payload**.
3. Copy the payload (auto-copy attempted).
4. Paste directly in Galileo.

Payload prefix:
- `GALILEO_FIGMA_REST_V2:` (primary)
- `GALILEO_FIGMA_REST_V1:` (legacy compatibility in Galileo parser)

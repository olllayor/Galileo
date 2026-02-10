figma.showUI(__html__, { width: 420, height: 320 });

const decodeJsonBytes = (bytes) => {
  const text = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(text);
};

const toBridgePayload = async () => {
  const selection = figma.currentPage.selection;
  if (!selection.length) {
    throw new Error('Select at least one layer in Figma.');
  }

  const exports = [];
  let exportVersion = 'JSON_REST_V1';
  for (const node of selection) {
    try {
      const bytes = await node.exportAsync({
        format: 'JSON_REST_V1',
      });
      exports.push({
        id: node.id,
        name: node.name,
        type: node.type,
        payload: decodeJsonBytes(bytes),
      });
    } catch (error) {
      // Fallback for environments where JSON_REST_V1 is unavailable.
      try {
        const fallbackBytes = await node.exportAsync({ format: 'JSON_REST_VERSIONS' });
        exportVersion = 'JSON_REST_VERSIONS';
        exports.push({
          id: node.id,
          name: node.name,
          type: node.type,
          payload: decodeJsonBytes(fallbackBytes),
        });
      } catch {
        // Skip and let UI show warning.
      }
    }
  }

  if (!exports.length) {
    throw new Error('Could not export selected layers.');
  }

  return {
    version: 2,
    source: 'figma-plugin',
    exportVersion,
    selection: exports.map((entry) => entry.payload?.document ?? entry.payload).filter(Boolean),
    metadata: {
      pageId: figma.currentPage.id,
      pageName: figma.currentPage.name,
      exportedAt: Date.now(),
    },
    raw: exports,
  };
};

figma.ui.onmessage = async (msg) => {
  if (msg?.type !== 'generate') return;
  try {
    const payload = await toBridgePayload();
    const text = `GALILEO_FIGMA_REST_V2:${JSON.stringify(payload)}`;
    figma.ui.postMessage({ type: 'payload', text, copied: false });
  } catch (error) {
    figma.ui.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to export selection.',
    });
  }
};

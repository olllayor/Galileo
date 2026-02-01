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
): { x: number; y: number; width: number; height: number } => ({
	x: bounds.x + edges.nl * bounds.width,
	y: bounds.y + edges.nt * bounds.height,
	width: (edges.nr - edges.nl) * bounds.width,
	height: (edges.nb - edges.nt) * bounds.height,
});

import { invoke } from '@tauri-apps/api/core';

export type FigmaFetchFileArgs = {
	fileKey: string;
	token: string;
	nodeIds?: string[];
	depth?: number;
	geometry?: 'paths';
};

export type FigmaFetchNodesArgs = {
	fileKey: string;
	token: string;
	nodeIds: string[];
	depth?: number;
	geometry?: 'paths';
};

export type FigmaFetchImagesArgs = {
	fileKey: string;
	token: string;
	imageRefs: string[];
	format?: 'png' | 'jpg' | 'svg' | 'pdf';
	scale?: number;
};

export type FigmaFetchVariablesArgs = {
	fileKey: string;
	token: string;
};

export const figmaClient = {
	fetchFile: (args: FigmaFetchFileArgs) => invoke<unknown>('figma_fetch_file', { args }),
	fetchNodes: (args: FigmaFetchNodesArgs) => invoke<unknown>('figma_fetch_nodes', { args }),
	fetchImages: (args: FigmaFetchImagesArgs) => invoke<Record<string, string>>('figma_fetch_images', { args }),
	fetchLocalVariables: (args: FigmaFetchVariablesArgs) => invoke<unknown>('figma_fetch_local_variables', { args }),
};

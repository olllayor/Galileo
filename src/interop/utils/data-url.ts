export const parseDataUrl = (dataUrl: string): { mime: string; dataBase64: string } | null => {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	return { mime: match[1], dataBase64: match[2] };
};

export const buildDataUrl = (mime: string, dataBase64: string): string => {
	return `data:${mime};base64,${dataBase64}`;
};

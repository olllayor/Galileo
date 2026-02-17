const SNAPSHOT_CHUNK_SIZE = 220_000;

export const splitSnapshotBase64 = (snapshotBase64: string): string[] => {
	if (snapshotBase64.length <= SNAPSHOT_CHUNK_SIZE) {
		return [snapshotBase64];
	}
	const chunks: string[] = [];
	for (let offset = 0; offset < snapshotBase64.length; offset += SNAPSHOT_CHUNK_SIZE) {
		chunks.push(snapshotBase64.slice(offset, offset + SNAPSHOT_CHUNK_SIZE));
	}
	return chunks;
};


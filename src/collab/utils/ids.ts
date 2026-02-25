const randomChunk = (): string => Math.random().toString(36).slice(2, 10);

export const createActorId = (): string => `actor_${Date.now().toString(36)}_${randomChunk()}`;

export const createDeviceId = (): string => {
	const key = 'galileo.collab.deviceId.v1';
	const existing = globalThis.localStorage?.getItem(key);
	if (existing && existing.trim().length > 0) {
		return existing;
	}
	const next = `device_${Date.now().toString(36)}_${randomChunk()}`;
	globalThis.localStorage?.setItem(key, next);
	return next;
};

export const createDisplayName = (): string => {
	const key = 'galileo.collab.displayName.v1';
	const existing = globalThis.localStorage?.getItem(key);
	if (existing && existing.trim().length > 0) {
		return existing;
	}
	const next = `Guest ${randomChunk().slice(0, 4).toUpperCase()}`;
	globalThis.localStorage?.setItem(key, next);
	return next;
};

export const createClientUpdateId = (actorId: string, sequence: number): string =>
	`${actorId}:${Date.now().toString(36)}:${sequence.toString(36)}:${randomChunk()}`;

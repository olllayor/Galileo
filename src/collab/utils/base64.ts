export const bytesToBase64 = (bytes: Uint8Array): string => {
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return globalThis.btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array => {
	const binary = globalThis.atob(value);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
};

export const encodeJsonBase64 = (value: unknown): string => {
	const text = JSON.stringify(value);
	const utf8 = new TextEncoder().encode(text);
	return bytesToBase64(utf8);
};

export const decodeJsonBase64 = <T>(value: string): T => {
	const bytes = base64ToBytes(value);
	const text = new TextDecoder().decode(bytes);
	return JSON.parse(text) as T;
};

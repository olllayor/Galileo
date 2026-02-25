declare module 'bun:test' {
	export function describe(name: string, fn: () => void | Promise<void>): void;
	export function test(name: string, fn: () => void | Promise<void>): void;
	export function afterAll(fn: () => void | Promise<void>): void;

	export type ExpectMatcher = {
		toBe(expected: unknown): void;
		toBeTruthy(): void;
		toBeNull(): void;
		toBeGreaterThan(expected: number): void;
	};

	export function expect(received: unknown): ExpectMatcher;

	export const mock: {
		module(path: string, factory: () => Record<string, unknown>): void;
		restore(): void;
	};
}

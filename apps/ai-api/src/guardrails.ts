import type { NextRequest } from 'next/server';
import type { CommandDraft } from './contracts';
import { MAX_COMMAND_DRAFTS, countDraftCommands } from './contracts';

export const MAX_REQUEST_BYTES = 250_000;

const FORBIDDEN_SET_PROPS_KEYS = new Set([
	'id',
	'type',
	'children',
	'componentId',
	'componentOverrides',
	'componentSourceNodeId',
	'booleanData',
	'vector',
	'path',
	'pathData',
	'd',
	'prototype',
]);

const ORIGIN_PROTOCOL_ALLOWLIST = new Set(['http:', 'https:']);

const normalizeOrigin = (value: string): string | null => {
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	try {
		const url = new URL(trimmed);
		if (!ORIGIN_PROTOCOL_ALLOWLIST.has(url.protocol)) return null;
		return `${url.protocol}//${url.host}`;
	} catch {
		return null;
	}
};

export const parseAllowedOrigins = (value: string | undefined): Set<string> => {
	if (!value) return new Set();
	return new Set(
		value
			.split(',')
			.map((item) => item.trim())
			.map((item) => (item === '*' ? '*' : normalizeOrigin(item)))
			.filter((item): item is string => Boolean(item)),
	);
};

export const pickCorsOrigin = (origin: string | null, allowlist: Set<string>): string | null => {
	if (allowlist.has('*')) return '*';
	if (!origin) return null;
	const normalizedOrigin = normalizeOrigin(origin);
	if (!normalizedOrigin) return null;
	return allowlist.has(normalizedOrigin) ? normalizedOrigin : null;
};

export type ProductionSecurityIssue =
	| 'allowed_origins_required_in_production'
	| 'wildcard_origin_not_allowed_in_production'
	| 'client_key_required_in_production';

const isProductionRuntime = (nodeEnv: string | undefined, vercelEnv: string | undefined): boolean => {
	return nodeEnv === 'production' || vercelEnv === 'production';
};

export const getProductionSecurityIssue = (
	allowlist: Set<string>,
	clientKey: string | undefined,
	nodeEnv: string | undefined = process.env.NODE_ENV,
	vercelEnv: string | undefined = process.env.VERCEL_ENV,
): ProductionSecurityIssue | null => {
	if (!isProductionRuntime(nodeEnv, vercelEnv)) return null;
	if (allowlist.size === 0) return 'allowed_origins_required_in_production';
	if (allowlist.has('*')) return 'wildcard_origin_not_allowed_in_production';
	if (!clientKey || clientKey.trim().length === 0) return 'client_key_required_in_production';
	return null;
};

export const ensureClientKey = (request: NextRequest, expectedKey: string | undefined): string | null => {
	if (!expectedKey) return null;
	const provided = request.headers.get('x-galileo-client-key');
	if (!provided || provided !== expectedKey) {
		return 'invalid_client_key';
	}
	return null;
};

export const readJsonBodyWithLimit = async (request: NextRequest, maxBytes: number): Promise<unknown> => {
	const bodyText = await request.text();
	const byteLength = new TextEncoder().encode(bodyText).byteLength;
	if (byteLength > maxBytes) {
		throw new Error('payload_too_large');
	}
	if (bodyText.trim().length === 0) {
		throw new Error('empty_body');
	}
	return JSON.parse(bodyText) as unknown;
};

const validateDraftRecursive = (
	draft: CommandDraft,
	allowedTargetIds: Set<string>,
	issues: string[],
	path: string,
	depth: number,
): void => {
	if (depth > 2) {
		issues.push(`${path}: nested batch depth exceeds limit`);
		return;
	}

	switch (draft.type) {
		case 'setProps': {
			if (!allowedTargetIds.has(draft.id)) {
				issues.push(`${path}: setProps target must be selected`);
			}
			const keys = Object.keys(draft.props);
			for (const key of keys) {
				if (FORBIDDEN_SET_PROPS_KEYS.has(key)) {
					issues.push(`${path}: setProps key "${key}" is forbidden`);
				}
			}
			break;
		}
		case 'moveNode':
		case 'resizeNode':
		case 'deleteNode': {
			if (!allowedTargetIds.has(draft.id)) {
				issues.push(`${path}: ${draft.type} target must be selected`);
			}
			break;
		}
		case 'createNode':
			break;
		case 'batch': {
			for (let i = 0; i < draft.commands.length; i += 1) {
				validateDraftRecursive(draft.commands[i], allowedTargetIds, issues, `${path}.commands[${i}]`, depth + 1);
			}
			break;
		}
		default:
			issues.push(`${path}: unsupported command type`);
	}
};

export const validateDraftGuardrails = (drafts: CommandDraft[], selectedNodeIds: string[]): string[] => {
	const issues: string[] = [];
	if (countDraftCommands(drafts) > MAX_COMMAND_DRAFTS) {
		issues.push(`command count exceeds ${MAX_COMMAND_DRAFTS}`);
	}
	const allowedTargetIds = new Set(selectedNodeIds);
	for (let i = 0; i < drafts.length; i += 1) {
		validateDraftRecursive(drafts[i], allowedTargetIds, issues, `commandDrafts[${i}]`, 0);
	}
	return issues;
};

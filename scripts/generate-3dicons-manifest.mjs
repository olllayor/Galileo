#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_URL = 'https://3dicons.co/explore';
const DEFAULT_OUTPUT = path.join(process.cwd(), 'public', 'plugins', '3dicons', 'manifest.json');

const titleCase = (value) => {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const deriveName = (iconId) => {
  const parts = iconId.split('-');
  if (parts.length <= 1) return titleCase(iconId);
  const [maybeHash, ...rest] = parts;
  const isHash = /^[0-9a-f]{6}$/i.test(maybeHash);
  const slugParts = isHash ? rest : parts;
  return titleCase(slugParts.join('-'));
};

const extractIds = (html) => {
  const regex = /\/sizes\/([^/]+)\//g;
  const ids = new Set();
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) {
      ids.add(match[1]);
    }
  }
  return Array.from(ids);
};

const main = async () => {
  const url = process.argv[2] || DEFAULT_URL;
  const outputPath = process.argv[3] || DEFAULT_OUTPUT;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const ids = extractIds(html);
  if (ids.length === 0) {
    throw new Error('No icon IDs found in HTML. The page structure may have changed.');
  }

  const entries = ids
    .map((id) => ({ id, name: deriveName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(entries, null, 2));
  console.log(`Wrote ${entries.length} icons to ${outputPath}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

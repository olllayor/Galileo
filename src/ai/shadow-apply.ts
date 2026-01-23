import type { Document } from '../core/doc/types';
import type { Command } from '../core/commands/types';
import { applyCommand } from '../core/commands/executor';

export interface ShadowDocument {
  original: Document;
  modified: Document;
  command: Command;
  isApplied: boolean;
}

export const createShadowDocument = (
  originalDoc: Document,
  command: Command
): ShadowDocument => {
  const modified = applyCommand(originalDoc, command);

  return {
    original: originalDoc,
    modified,
    command,
    isApplied: false,
  };
};

export const applyShadowChanges = (
  shadow: ShadowDocument
): Document => {
  return shadow.modified;
};

export const rejectShadowChanges = (
  shadow: ShadowDocument
): Document => {
  return shadow.original;
};

export const updateShadowCommand = (
  shadow: ShadowDocument,
  newCommand: Command
): ShadowDocument => {
  const modified = applyCommand(shadow.original, newCommand);

  return {
    ...shadow,
    modified,
    command: newCommand,
  };
};

export const hasShadowChanges = (shadow: ShadowDocument): boolean => {
  return JSON.stringify(shadow.original) !== JSON.stringify(shadow.modified);
};

export const getShadowDiff = (
  shadow: ShadowDocument
): string => {
  const original = JSON.stringify(shadow.original, null, 2);
  const modified = JSON.stringify(shadow.modified, null, 2);

  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const diff: string[] = [];
  const maxLines = Math.max(originalLines.length, modifiedLines.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i] ?? '';
    const modifiedLine = modifiedLines[i] ?? '';

    if (originalLine === modifiedLine) {
      diff.push(`  ${originalLine}`);
    } else {
      if (originalLine) {
        diff.push(`- ${originalLine}`);
      }
      if (modifiedLine) {
        diff.push(`+ ${modifiedLine}`);
      }
    }
  }

  return diff.join('\n');
};

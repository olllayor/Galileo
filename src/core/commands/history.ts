import type { Document } from '../doc/types';
import type { Command } from './types';

export interface HistoryEntry {
  doc: Document;
  cmd: Command;
}

export interface CommandHistory {
  past: HistoryEntry[];
  present: Document;
  future: HistoryEntry[];
}

export const createHistory = (initialDoc: Document): CommandHistory => ({
  past: [],
  present: initialDoc,
  future: [],
});

export const pushCommand = (
  history: CommandHistory,
  command: Command,
  newDoc: Document
): CommandHistory => {
  return {
    past: [...history.past, { doc: history.present, cmd: command }],
    present: newDoc,
    future: [],
  };
};

export const undo = (history: CommandHistory): CommandHistory => {
  if (history.past.length === 0) {
    return history;
  }

  const previous = history.past[history.past.length - 1];

  return {
    past: history.past.slice(0, -1),
    present: previous.doc,
    future: [{ doc: history.present, cmd: previous.cmd }, ...history.future],
  };
};

export const redo = (history: CommandHistory): CommandHistory => {
  if (history.future.length === 0) {
    return history;
  }

  const next = history.future[0];

  return {
    past: [...history.past, { doc: history.present, cmd: next.cmd }],
    present: next.doc,
    future: history.future.slice(1),
  };
};

export const canUndo = (history: CommandHistory): boolean => {
  return history.past.length > 0;
};

export const canRedo = (history: CommandHistory): boolean => {
  return history.future.length > 0;
};

export const getHistoryState = (history: CommandHistory) => {
  return {
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    pastCount: history.past.length,
    futureCount: history.future.length,
  };
};

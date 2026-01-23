import { useState, useCallback } from 'react';
import type { Document } from '../core/doc/types';
import { createDocument } from '../core/doc/types';
import type { Command } from '../core/commands/types';
import { applyCommand } from '../core/commands/executor';
import { createHistory, pushCommand, undo, redo, canUndo, canRedo } from '../core/commands/history';

export const useDocument = (initialDoc: Document = createDocument()) => {
  const [history, setHistory] = useState(() => createHistory(initialDoc));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const document = history.present;

  const executeCommand = useCallback(
    (command: Command) => {
      setHistory(prev => {
        const newDoc = applyCommand(prev.present, command);
        return pushCommand(prev, command, newDoc);
      });
      setIsDirty(true);
    },
    []
  );

  const undoCommand = useCallback(() => {
    setHistory(prev => undo(prev));
  }, []);

  const redoCommand = useCallback(() => {
    setHistory(prev => redo(prev));
  }, []);

  const selectNode = useCallback(
    (nodeId: string) => {
      setSelectedIds([nodeId]);
    },
    []
  );

  const toggleSelection = useCallback(
    (nodeId: string) => {
      setSelectedIds(prev => {
        if (prev.includes(nodeId)) {
          return prev.filter(id => id !== nodeId);
        }
        return [...prev, nodeId];
      });
    },
    []
  );

  const setSelection = useCallback((ids: string[]) => {
    setSelectedIds(ids);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const replaceDocument = useCallback((doc: Document) => {
    setHistory(createHistory(doc));
    setSelectedIds([]);
    setIsDirty(false);
  }, []);

  const markSaved = useCallback(() => {
    setIsDirty(false);
  }, []);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  return {
    document,
    selectedIds,
    executeCommand,
    undoCommand,
    redoCommand,
    selectNode,
    toggleSelection,
    setSelection,
    clearSelection,
    replaceDocument,
    markSaved,
    markDirty,
    isDirty,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
  };
};

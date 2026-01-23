import type { Node } from '../doc/types';

export interface BaseCommand {
  id: string;
  timestamp: number;
  source: 'user' | 'ai';
  description?: string;
  selectionSnapshot?: string[];
}

export interface CreateNodeCommand extends BaseCommand {
  type: 'createNode';
  payload: {
    id: string;
    parentId: string;
    node: Omit<Node, 'id' | 'children'>;
    index?: number;
  };
}

export interface DeleteNodeCommand extends BaseCommand {
  type: 'deleteNode';
  payload: {
    id: string;
  };
}

export interface MoveNodeCommand extends BaseCommand {
  type: 'moveNode';
  payload: {
    id: string;
    position: { x: number; y: number };
  };
}

export interface ResizeNodeCommand extends BaseCommand {
  type: 'resizeNode';
  payload: {
    id: string;
    size: { width: number; height: number };
  };
}

export interface SetPropsCommand extends BaseCommand {
  type: 'setProps';
  payload: {
    id: string;
    props: Partial<Node>;
  };
}

export interface BatchCommand extends BaseCommand {
  type: 'batch';
  payload: {
    commands: Command[];
  };
}

export type Command =
  | CreateNodeCommand
  | DeleteNodeCommand
  | MoveNodeCommand
  | ResizeNodeCommand
  | SetPropsCommand
  | BatchCommand;

export const isCommand = (value: unknown): value is Command => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const cmd = value as Command;
  return (
    typeof cmd.id === 'string' &&
    typeof cmd.timestamp === 'number' &&
    typeof cmd.source === 'string' &&
    typeof cmd.type === 'string'
  );
};

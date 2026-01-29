import { buildWorldPositionMap } from '../../core/doc';
import type { Document, Node } from '../../core/doc/types';
import type { DrawCommand } from './types';

export const buildDrawList = (doc: Document): DrawCommand[] => {
  const rootNode = doc.nodes[doc.rootId];
  if (!rootNode) {
    return [];
  }

  const commands: DrawCommand[] = [];
  buildNodeCommands(doc, rootNode, commands, 0, 0, 1, 1);

  return commands;
};

export const buildDrawListForNode = (doc: Document, nodeId: string): DrawCommand[] => {
  const node = doc.nodes[nodeId];
  if (!node) {
    return [];
  }

  const worldMap = buildWorldPositionMap(doc);
  const base = worldMap[nodeId];
  if (!base) {
    return [];
  }

  const commands: DrawCommand[] = [];
  buildNodeCommandsFromWorld(doc, node, commands, base, worldMap);
  return commands;
};

const buildNodeCommandsFromWorld = (
  doc: Document,
  node: Node,
  commands: DrawCommand[],
  base: { x: number; y: number },
  worldMap: Record<string, { x: number; y: number }>
): void => {
  const worldPos = worldMap[node.id];
  if (!worldPos) {
    return;
  }

  const x = worldPos.x - base.x;
  const y = worldPos.y - base.y;
  const width = node.size.width;
  const height = node.size.height;

  if (node.visible === false) {
    return;
  }

  if (node.type === 'frame') {
    if (node.fill) {
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: colorToString(node.fill),
        cornerRadius: node.cornerRadius,
        opacity: node.opacity,
      });
    }

    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) {
          buildNodeCommandsFromWorld(doc, child, commands, base, worldMap);
        }
      }
    }
  } else if (node.type === 'rectangle') {
    if (node.fill || node.stroke) {
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: node.fill ? colorToString(node.fill) : undefined,
        stroke: node.stroke ? colorToString(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        cornerRadius: node.cornerRadius,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'ellipse') {
    if (node.fill || node.stroke) {
      commands.push({
        type: 'ellipse',
        x: x + width / 2,
        y: y + height / 2,
        radiusX: width / 2,
        radiusY: height / 2,
        fill: node.fill ? colorToString(node.fill) : undefined,
        stroke: node.stroke ? colorToString(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'text') {
    commands.push({
      type: 'text',
      x,
      y,
      text: node.text || '',
      font: `${node.fontWeight || 'normal'} ${node.fontSize || 14}px ${node.fontFamily || 'sans-serif'}`,
      fontSize: node.fontSize || 14,
      fill: node.fill ? colorToString(node.fill) : '#000000',
      opacity: node.opacity,
    });
  } else if (node.type === 'image') {
    const src = resolveImageSource(doc, node);
    if (src) {
      commands.push({
        type: 'image',
        x,
        y,
        width,
        height,
        src,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'path' && node.fill) {
    const color = colorToString(node.fill);
    commands.push({
      type: 'rect',
      x,
      y,
      width,
      height,
      fill: color,
      opacity: node.opacity,
    });
  } else if (node.type === 'componentInstance') {
    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) {
          buildNodeCommandsFromWorld(doc, child, commands, base, worldMap);
        }
      }
    }
  }
};

const buildNodeCommands = (
  doc: Document,
  node: Node,
  commands: DrawCommand[],
  offsetX: number,
  offsetY: number,
  scaleX: number,
  scaleY: number
): void => {
  const x = offsetX + node.position.x * scaleX;
  const y = offsetY + node.position.y * scaleY;
  const width = node.size.width * scaleX;
  const height = node.size.height * scaleY;

  if (node.visible === false) {
    return;
  }

  if (node.type === 'frame') {
    if (node.fill) {
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: colorToString(node.fill),
        cornerRadius: node.cornerRadius,
        opacity: node.opacity,
      });
    }

    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) {
          buildNodeCommands(doc, child, commands, x, y, scaleX, scaleY);
        }
      }
    }
  } else if (node.type === 'rectangle') {
    if (node.fill || node.stroke) {
      commands.push({
        type: 'rect',
        x,
        y,
        width,
        height,
        fill: node.fill ? colorToString(node.fill) : undefined,
        stroke: node.stroke ? colorToString(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        cornerRadius: node.cornerRadius,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'ellipse') {
    if (node.fill || node.stroke) {
      commands.push({
        type: 'ellipse',
        x: x + width / 2,
        y: y + height / 2,
        radiusX: width / 2,
        radiusY: height / 2,
        fill: node.fill ? colorToString(node.fill) : undefined,
        stroke: node.stroke ? colorToString(node.stroke.color) : undefined,
        strokeWidth: node.stroke?.width,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'text') {
    commands.push({
      type: 'text',
      x,
      y,
      text: node.text || '',
      font: `${node.fontWeight || 'normal'} ${node.fontSize || 14}px ${node.fontFamily || 'sans-serif'}`,
      fontSize: node.fontSize || 14,
      fill: node.fill ? colorToString(node.fill) : '#000000',
      opacity: node.opacity,
    });
  } else if (node.type === 'image') {
    const src = resolveImageSource(doc, node);
    if (src) {
      commands.push({
        type: 'image',
        x,
        y,
        width,
        height,
        src,
        opacity: node.opacity,
      });
    }
  } else if (node.type === 'path' && node.fill) {
    const color = colorToString(node.fill);
    commands.push({
      type: 'rect',
      x,
      y,
      width,
      height,
      fill: color,
      opacity: node.opacity,
    });
  } else if (node.type === 'componentInstance') {
    if (node.children && node.children.length > 0) {
      for (const childId of node.children) {
        const child = doc.nodes[childId];
        if (child) {
          buildNodeCommands(doc, child, commands, x, y, scaleX, scaleY);
        }
      }
    }
  }
};

const colorToString = (color: string | { type: string; value?: string }): string => {
  if (typeof color === 'string') {
    return color;
  }
  if (color?.type === 'solid' && color?.value) {
    return color.value;
  }
  if (color?.type === 'gradient') {
    return '#888888';
  }
  return '#000000';
};

const resolveImageSource = (doc: Document, node: Node): string | null => {
  const assetId = node.image?.assetId;
  if (assetId) {
    const asset = doc.assets?.[assetId];
    if (asset && asset.type === 'image' && asset.dataBase64 && asset.mime) {
      return `data:${asset.mime};base64,${asset.dataBase64}`;
    }
  }
  return node.image?.src || null;
};

export const colorToRGBA = (color: string): { r: number; g: number; b: number; a: number } => {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
};

import React from 'react';
import { Cursor, Square, TextAlignLeft, ArrowCounterClockwise, ArrowClockwise, Save, Folder, Image } from 'akar-icons';

interface ToolbarProps {
  activeTool: 'select' | 'rectangle' | 'text';
  onToolChange: (tool: 'select' | 'rectangle' | 'text') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onLoad: () => void;
  onImport: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onLoad,
  onImport,
}) => {
  const tools = [
    { id: 'select' as const, label: 'Select (V)', icon: <Cursor strokeWidth={2} size={20} /> },
    { id: 'rectangle' as const, label: 'Rectangle (R)', icon: <Square strokeWidth={2} size={20} /> },
    { id: 'text' as const, label: 'Text (T)', icon: <TextAlignLeft strokeWidth={2} size={20} /> },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px',
      backgroundColor: '#2d2d2d',
      borderRight: '1px solid #444',
      minWidth: '50px',
    }}>
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            padding: '4px',
            backgroundColor: activeTool === tool.id ? '#4a9eff' : '#3d3d3d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      <div style={{ height: '1px', backgroundColor: '#444', margin: '8px 0' }} />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          padding: '4px',
          backgroundColor: canUndo ? '#3d3d3d' : '#2d2d2d',
          color: canUndo ? 'white' : '#666',
          border: 'none',
          borderRadius: '6px',
          cursor: canUndo ? 'pointer' : 'not-allowed',
          fontSize: '16px',
          fontWeight: 'bold',
        }}
        title="Undo (Ctrl+Z)"
      >
        <ArrowCounterClockwise strokeWidth={2} size={20} />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          padding: '4px',
          backgroundColor: canRedo ? '#3d3d3d' : '#2d2d2d',
          color: canRedo ? 'white' : '#666',
          border: 'none',
          borderRadius: '6px',
          cursor: canRedo ? 'pointer' : 'not-allowed',
          fontSize: '16px',
          fontWeight: 'bold',
        }}
        title="Redo (Ctrl+Shift+Z)"
      >
        <ArrowClockwise strokeWidth={2} size={20} />
      </button>

      <div style={{ height: '1px', backgroundColor: '#444', margin: '8px 0' }} />

      <button
        onClick={onSave}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          padding: '4px',
          backgroundColor: '#3d3d3d',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
        }}
        title="Save (Ctrl+S)"
      >
        <Save strokeWidth={2} size={20} />
      </button>

      <button
        onClick={onLoad}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          padding: '4px',
          backgroundColor: '#3d3d3d',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
        }}
        title="Load (Ctrl+O)"
      >
        <Folder strokeWidth={2} size={20} />
      </button>

      <button
        onClick={onImport}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          padding: '4px',
          backgroundColor: '#3d3d3d',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
        }}
        title="Import (Ctrl+I)"
      >
        <Image strokeWidth={2} size={20} />
      </button>
    </div>
  );
};

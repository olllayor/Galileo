import React from 'react';
import type { PluginRegistration } from '../plugins/types';

interface PluginManagerModalProps {
  plugins: PluginRegistration[];
  onClose: () => void;
  onLoadDev: () => void;
  onRemove: (plugin: PluginRegistration) => void;
  showDev?: boolean;
}

export const PluginManagerModal: React.FC<PluginManagerModalProps> = ({
  plugins,
  onClose,
  onLoadDev,
  onRemove,
  showDev = false,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1300,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 520,
          maxHeight: '70vh',
          backgroundColor: '#111111',
          color: '#ffffff',
          borderRadius: 12,
          padding: 20,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Manage Plugins</div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              fontSize: 18,
              cursor: 'pointer',
            }}
            aria-label="Close plugin manager"
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
          Installed and dev plugins available in this workspace.
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plugins.map(plugin => (
            <div
              key={plugin.manifest.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                borderRadius: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{plugin.manifest.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                  {plugin.manifest.id} · v{plugin.manifest.version} · {plugin.source}
                </div>
              </div>
              {plugin.source !== 'builtin' && (
                <button
                  onClick={() => onRemove(plugin)}
                  style={{
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    background: 'transparent',
                    color: '#ffffff',
                    padding: '6px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {showDev && (
            <button
              onClick={onLoadDev}
              style={{
                border: '1px solid rgba(255, 255, 255, 0.25)',
                background: 'transparent',
                color: '#ffffff',
                padding: '8px 12px',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Load Dev Plugin
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#ffffff',
              color: '#111111',
              padding: '8px 12px',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

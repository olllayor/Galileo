import React from 'react';
import type { PluginRegistration } from '../plugins/types';

interface PluginModalProps {
  plugin: PluginRegistration;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onClose: () => void;
}

export const PluginModal: React.FC<PluginModalProps> = ({ plugin, iframeRef, onClose }) => {
  const width = plugin.manifest.ui?.width ?? 360;
  const height = plugin.manifest.ui?.height ?? 520;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width,
          height,
          margin: '24px',
          backgroundColor: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            backgroundColor: '#111111',
            color: '#ffffff',
            fontSize: 12,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{plugin.manifest.name}</span>
            {plugin.source === 'dev' && (
              <span
                style={{
                  padding: '2px 6px',
                  borderRadius: 4,
                  backgroundColor: '#f5a623',
                  color: '#111111',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                DEV MODE
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#ffffff',
              fontSize: 16,
              cursor: 'pointer',
            }}
            aria-label="Close plugin"
          >
            ×
          </button>
        </div>
        <iframe
          ref={iframeRef}
          title={plugin.manifest.name}
          src={plugin.entryUrl}
          sandbox="allow-scripts allow-forms"
          style={{
            border: 'none',
            width: '100%',
            height: '100%',
          }}
        />
      </div>
    </div>
  );
};

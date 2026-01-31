import React, { useEffect, useRef, useState } from 'react';

export type ContextMenuItem = {
  id?: string;
  icon?: string;
  label?: string;
  shortcut?: string;
  enabled?: boolean;
  onSelect?: () => void;
  submenu?: ContextMenuItem[];
  separator?: boolean;
};

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const MENU_WIDTH = 232;
const ITEM_HEIGHT = 30;

const MenuList: React.FC<{
  items: ContextMenuItem[];
  onClose: () => void;
  style?: React.CSSProperties;
}> = ({ items, onClose, style }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div
      style={{
        minWidth: MENU_WIDTH,
        backgroundColor: '#1f1f1f',
        color: '#f4f4f4',
        borderRadius: 8,
        padding: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
        fontSize: 13,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        ...style,
      }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${index}`}
              style={{
                height: 1,
                margin: '6px 6px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              }}
            />
          );
        }

        const enabled = item.enabled !== false;
        const hasSubmenu = Boolean(item.submenu && item.submenu.length > 0);

        return (
          <div
            key={item.id || item.label || index}
            onMouseEnter={() => setOpenIndex(hasSubmenu ? index : null)}
            onMouseMove={() => {
              if (hasSubmenu) {
                setOpenIndex(index);
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseDown={() => setActiveIndex(index)}
            onMouseUp={() => setActiveIndex(null)}
            onClick={() => {
              if (!enabled) return;
              if (hasSubmenu) {
                setOpenIndex(index);
                return;
              }
              item.onSelect?.();
              onClose();
            }}
            onContextMenu={(event) => {
              if (!hasSubmenu) return;
              event.preventDefault();
              setOpenIndex(index);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: ITEM_HEIGHT,
              padding: '0 10px',
              borderRadius: 4,
              cursor: enabled ? 'pointer' : 'default',
              opacity: enabled ? 1 : 0.4,
              backgroundColor:
                activeIndex === index
                  ? 'rgba(255, 255, 255, 0.12)'
                  : openIndex === index
                    ? 'rgba(255, 255, 255, 0.08)'
                    : 'transparent',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 16,
                textAlign: 'center',
                opacity: 0.7,
                fontSize: 11,
              }}>
                {item.icon || ''}
              </span>
              <span>{item.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.shortcut && (
                <span style={{ opacity: 0.55, fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
                  {item.shortcut}
                </span>
              )}
              {hasSubmenu && <span style={{ opacity: 0.6 }}>{'>'}</span>}
            </div>
            {hasSubmenu && openIndex === index && (
              <MenuList
                items={item.submenu || []}
                onClose={onClose}
                style={{
                  position: 'absolute',
                  left: MENU_WIDTH - 4,
                  top: index * ITEM_HEIGHT,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    setPosition({ x, y });
  }, [x, y]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && event.target instanceof Node && containerRef.current.contains(event.target)) {
        return;
      }
      onClose();
    };
    const handleContextMenu = (event: MouseEvent) => {
      if (containerRef.current && event.target instanceof Node && containerRef.current.contains(event.target)) {
        return;
      }
      onClose();
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('scroll', handleClick, true);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('scroll', handleClick, true);
    };
  }, [onClose]);

  useEffect(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 8;
    const maxX = window.innerWidth - rect.width - padding;
    const maxY = window.innerHeight - rect.height - padding;
    const nextX = Math.min(Math.max(padding, position.x), Math.max(padding, maxX));
    const nextY = Math.min(Math.max(padding, position.y), Math.max(padding, maxY));
    if (nextX !== position.x || nextY !== position.y) {
      setPosition({ x: nextX, y: nextY });
    }
  }, [items, position.x, position.y]);

  return (
    <div
      ref={containerRef}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
    >
      <MenuList items={items} onClose={onClose} />
    </div>
  );
};

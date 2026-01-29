import React, { useEffect, useRef, useState } from 'react';

export type ContextMenuItem = {
  id?: string;
  label?: string;
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

const MENU_WIDTH = 220;
const ITEM_HEIGHT = 28;

const MenuList: React.FC<{
  items: ContextMenuItem[];
  onClose: () => void;
  style?: React.CSSProperties;
}> = ({ items, onClose, style }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div
      style={{
        minWidth: MENU_WIDTH,
        backgroundColor: '#1c1c1c',
        color: '#f4f4f4',
        borderRadius: 6,
        padding: 6,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
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
            onClick={() => {
              if (!enabled || hasSubmenu) return;
              item.onSelect?.();
              onClose();
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
              backgroundColor: openIndex === index ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              userSelect: 'none',
            }}
          >
            <span>{item.label}</span>
            {hasSubmenu && <span style={{ opacity: 0.6 }}>›</span>}
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

  return (
    <div
      ref={containerRef}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
      }}
    >
      <MenuList items={items} onClose={onClose} />
    </div>
  );
};

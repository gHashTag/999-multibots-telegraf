import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Play, Trash2, Image, ListStart, X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './QuickActionsMenu.css';

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger' | 'primary';
}

interface QuickActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  actions: QuickAction[];
  title?: string;
}

export function QuickActionsMenu({
  isOpen,
  onClose,
  position,
  actions,
  title,
}: QuickActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Small delay to prevent immediate close from the long-press event
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Calculate adjusted position to keep menu in viewport
  const menuWidth = 200;
  const menuHeight = actions.length * 44 + (title ? 40 : 0) + 16;
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 16);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 16);

  return createPortal(
    <div className="quick-actions-overlay" onClick={onClose}>
      <div
        ref={menuRef}
        className="quick-actions-menu"
        style={{
          left: Math.max(16, adjustedX),
          top: Math.max(16, adjustedY),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="quick-actions-header">
            <span className="quick-actions-title">{title}</span>
            <button className="quick-actions-close" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="quick-actions-list">
          {actions.map((action) => (
            <button
              key={action.id}
              className={`quick-action-item ${action.variant || 'default'}`}
              onClick={() => {
                action.onClick();
                onClose();
              }}
            >
              <span className="quick-action-icon">{action.icon}</span>
              <span className="quick-action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

// Helper to create common asset actions
export function useAssetQuickActions(
  asset: { id: string; type: string; name: string },
  handlers: {
    onAddToTimeline: () => void;
    onAddToStart: () => void;
    onPreview?: () => void;
    onSetAsBackground?: () => void;
    onDelete: () => void;
  }
): QuickAction[] {
  const { t } = useLanguage();
  const actions: QuickAction[] = [];

  // Add to timeline (at playhead)
  actions.push({
    id: 'add-timeline',
    label: t('quickActions.addToTimeline'),
    icon: <Plus size={16} />,
    onClick: handlers.onAddToTimeline,
    variant: 'primary',
  });

  // Add to start
  actions.push({
    id: 'add-start',
    label: t('quickActions.addToStart'),
    icon: <ListStart size={16} />,
    onClick: handlers.onAddToStart,
  });

  // Preview (video/audio)
  if (handlers.onPreview && (asset.type === 'video' || asset.type === 'audio')) {
    actions.push({
      id: 'preview',
      label: t('quickActions.preview'),
      icon: <Play size={16} />,
      onClick: handlers.onPreview,
    });
  }

  // Set as background (video/image)
  if (handlers.onSetAsBackground && (asset.type === 'video' || asset.type === 'image')) {
    actions.push({
      id: 'set-background',
      label: t('quickActions.setAsBackground'),
      icon: <Image size={16} />,
      onClick: handlers.onSetAsBackground,
    });
  }

  // Delete
  actions.push({
    id: 'delete',
    label: t('quickActions.delete'),
    icon: <Trash2 size={16} />,
    onClick: handlers.onDelete,
    variant: 'danger',
  });

  return actions;
}

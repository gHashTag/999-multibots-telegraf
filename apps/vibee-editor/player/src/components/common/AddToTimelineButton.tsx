// ===============================
// AddToTimelineButton Component
// Animated button with long-press menu
// ===============================

import { useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Loader2, Check } from 'lucide-react';
import { useLongPress } from '@/hooks/useLongPress';
import { useLanguage } from '@/hooks/useLanguage';
import './AddToTimelineButton.css';

type ButtonState = 'idle' | 'adding' | 'done';
type AddOption = 'start' | 'end' | 'playhead' | 'replace';

interface AddToTimelineButtonProps {
  /** Called when quick add (tap) */
  onAdd: (option: AddOption) => void | Promise<void>;
  /** Called on hover start (for ghost preview) */
  onHoverStart?: () => void;
  /** Called on hover end */
  onHoverEnd?: () => void;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS class */
  className?: string;
  /** Whether to show long-press menu */
  showMenu?: boolean;
  /** Is there a selected item to replace */
  hasSelection?: boolean;
}

export const AddToTimelineButton = memo(function AddToTimelineButton({
  onAdd,
  onHoverStart,
  onHoverEnd,
  size = 'md',
  className = '',
  showMenu = true,
  hasSelection = false,
}: AddToTimelineButtonProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<ButtonState>('idle');
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const handleQuickAdd = useCallback(async () => {
    if (state !== 'idle') return;

    setState('adding');
    try {
      await onAdd('playhead');
      setState('done');
      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      setTimeout(() => setState('idle'), 500);
    } catch {
      setState('idle');
    }
  }, [onAdd, state]);

  const handleMenuSelect = useCallback(async (option: AddOption) => {
    setMenuPosition(null);
    if (state !== 'idle') return;

    setState('adding');
    try {
      await onAdd(option);
      setState('done');
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      setTimeout(() => setState('idle'), 500);
    } catch {
      setState('idle');
    }
  }, [onAdd, state]);

  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Position menu below the button
    setMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    });
  }, []);

  const longPressHandlers = useLongPress({
    threshold: 500,
    onLongPress: showMenu ? handleLongPress : () => {},
    onClick: handleQuickAdd,
  });

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
  }, []);

  // Size classes
  const sizeClasses = {
    sm: 'add-btn--sm',
    md: 'add-btn--md',
    lg: 'add-btn--lg',
  };

  // Icon sizes
  const iconSizes = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  const Icon = state === 'adding' ? Loader2 : state === 'done' ? Check : Plus;

  return (
    <>
      <button
        className={`add-timeline-btn ${sizeClasses[size]} add-btn--${state} ${className}`}
        {...longPressHandlers}
        onMouseEnter={onHoverStart}
        onMouseLeave={(e) => {
          onHoverEnd?.();
          longPressHandlers.onMouseLeave(e);
        }}
        disabled={state !== 'idle'}
        title={t('generate.addToTimeline')}
        aria-label={t('generate.addToTimeline')}
      >
        <Icon size={iconSizes[size]} className="add-btn-icon" />
      </button>

      {menuPosition && (
        <AddMenuPopup
          x={menuPosition.x}
          y={menuPosition.y}
          onSelect={handleMenuSelect}
          onClose={closeMenu}
          hasSelection={hasSelection}
        />
      )}
    </>
  );
});

// ===============================
// AddMenuPopup Component
// ===============================

interface AddMenuPopupProps {
  x: number;
  y: number;
  onSelect: (option: AddOption) => void;
  onClose: () => void;
  hasSelection?: boolean;
}

function AddMenuPopup({ x, y, onSelect, onClose, hasSelection }: AddMenuPopupProps) {
  const { t } = useLanguage();

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 160);
  const adjustedY = Math.min(y, window.innerHeight - 200);

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="add-menu-backdrop" onClick={onClose} />

      {/* Menu */}
      <div
        className="add-menu-popup"
        style={{
          left: adjustedX,
          top: adjustedY,
          transform: 'translateX(-50%)',
        }}
      >
        <button
          className="add-menu-item"
          onClick={() => onSelect('start')}
        >
          {t('timeline.addToStart') || 'Add to Start'}
        </button>

        <button
          className="add-menu-item add-menu-item--primary"
          onClick={() => onSelect('playhead')}
        >
          {t('timeline.addAtPlayhead') || 'Add at Playhead'}
        </button>

        <button
          className="add-menu-item"
          onClick={() => onSelect('end')}
        >
          {t('timeline.addToEnd') || 'Add to End'}
        </button>

        {hasSelection && (
          <>
            <div className="add-menu-divider" />
            <button
              className="add-menu-item add-menu-item--danger"
              onClick={() => onSelect('replace')}
            >
              {t('timeline.replaceSelected') || 'Replace Selected'}
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  );
}

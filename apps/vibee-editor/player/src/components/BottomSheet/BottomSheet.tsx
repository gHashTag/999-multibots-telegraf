import { useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import './BottomSheet.css';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  height?: 'peek' | 'half' | 'full';
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  height = 'half',
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  }, []);

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;

    // Only allow dragging down
    if (deltaY > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      const deltaY = currentY.current - startY.current;

      // transform снимается В ОБЕИХ ветках. Раньше при закрытии свайпом он
      // оставался уехавшим вниз, и следующее открытие рисовало лист за краем
      // экрана — визуально «панель больше не открывается».
      sheetRef.current.style.transform = '';
      if (deltaY > 100) {
        onClose();
      }
    }
    startY.current = 0;
    currentY.current = 0;
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Внутри Telegram скроллит #root, а не body (styles/telegram.css), поэтому
  // блокировка только body не работала: фон продолжал ехать под открытым
  // листом. Ставим класс на html и глушим оба.
  useEffect(() => {
    const html = document.documentElement;
    if (isOpen) {
      html.classList.add('sheet-open');
      document.body.style.overflow = 'hidden';
    } else {
      html.classList.remove('sheet-open');
      document.body.style.overflow = '';
    }
    return () => {
      html.classList.remove('sheet-open');
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`bottomsheet-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`bottomsheet ${isOpen ? 'open' : ''} ${height}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel'}
      >
        {/* Drag handle */}
        <div
          className="bottomsheet-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="bottomsheet-handle-bar" />
        </div>

        {/* Header */}
        {title && (
          <div className="bottomsheet-header">
            <span className="bottomsheet-title">{title}</span>
            <button
              className="bottomsheet-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="bottomsheet-content">
          {children}
        </div>
      </div>
    </>
  );
}

export default BottomSheet;

import { useRef, useEffect, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import './BottomSheet.css';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Стартовая высота. Дальше человек управляет ею сам — ручкой. */
  height?: 'peek' | 'half' | 'full';
}

/** Насколько нужно протянуть, чтобы состояние переключилось. */
const DRAG_THRESHOLD = 60;
/** Протяжка вниз из нижнего состояния на столько — закрыть. */
const CLOSE_THRESHOLD = 100;

const ORDER: Array<'peek' | 'half' | 'full'> = ['peek', 'half', 'full'];

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
  const moved = useRef(false);

  /**
   * Высота — состояние, а не константа.
   *
   * Раньше лист открывался на фиксированные 50vh и остаться мог только такими:
   * ручка умела лишь закрыть его протяжкой вниз. Форма свойств в половине
   * экрана не помещалась, а нижняя навигация ещё и лежала поверх — человек
   * видел обрезанные подписи и не мог добраться до полей.
   *
   * Теперь ручка работает как принято: тап переключает половину и полный
   * экран, протяжка вверх раскрывает, вниз — складывает и на нижней ступени
   * закрывает.
   */
  const [detent, setDetent] = useState<'peek' | 'half' | 'full'>(height);

  // Каждое новое открытие начинается со стартовой высоты, а не с той, на
  // которой человек закрыл лист в прошлый раз.
  useEffect(() => {
    if (isOpen) setDetent(height);
  }, [isOpen, height]);

  const expand = useCallback(() => {
    setDetent(d => ORDER[Math.min(ORDER.indexOf(d) + 1, ORDER.length - 1)]);
  }, []);

  const collapse = useCallback(() => {
    setDetent(d => {
      const i = ORDER.indexOf(d);
      if (i <= 0) {
        onClose();
        return d;
      }
      return ORDER[i - 1];
    });
  }, [onClose]);

  /** Тап по ручке: полный экран и обратно. */
  const handleHandleClick = useCallback(() => {
    if (moved.current) return; // это была протяжка, а не тап
    setDetent(d => (d === 'full' ? 'half' : 'full'));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentY.current = e.touches[0].clientY;
    isDragging.current = true;
    moved.current = false;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    currentY.current = e.touches[0].clientY;
    const deltaY = currentY.current - startY.current;
    if (Math.abs(deltaY) > 4) moved.current = true;

    // Вверх лист не уезжает физически — вверх он РАСТЁТ, это делает смена
    // ступени на отпускании. За пальцем следует только движение вниз.
    if (deltaY > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    const deltaY = currentY.current - startY.current;

    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      // transform снимается ВСЕГДА. Раньше при закрытии свайпом он оставался
      // уехавшим вниз, и следующее открытие рисовало лист за краем экрана —
      // визуально «панель больше не открывается».
      sheetRef.current.style.transform = '';
    }

    if (deltaY <= -DRAG_THRESHOLD) {
      expand();
    } else if (deltaY >= CLOSE_THRESHOLD && detent === ORDER[0]) {
      onClose();
    } else if (deltaY >= DRAG_THRESHOLD) {
      collapse();
    }

    startY.current = 0;
    currentY.current = 0;
  }, [detent, expand, collapse, onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
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
      <div
        className={`bottomsheet-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        className={`bottomsheet ${isOpen ? 'open' : ''} ${detent}`}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel'}
      >
        {/* Ручка: тап раскрывает на весь экран, протяжка меняет высоту */}
        <button
          type="button"
          className="bottomsheet-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleHandleClick}
          aria-label={detent === 'full' ? 'Свернуть панель' : 'Раскрыть панель на весь экран'}
          aria-expanded={detent === 'full'}
        >
          <span className="bottomsheet-handle-bar" />
        </button>

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

        <div className="bottomsheet-content">{children}</div>
      </div>
    </>
  );
}

export default BottomSheet;

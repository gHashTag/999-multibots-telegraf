import { useCallback, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import './ResizeHandle.css';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  direction: 'horizontal' | 'vertical';
  minSize?: number;
  maxSize?: number;
}

export function ResizeHandle({
  onResize,
  onResizeStart,
  onResizeEnd,
  direction,
}: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY;
      onResizeStart?.();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos =
          direction === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPosRef.current;
        startPosRef.current = currentPos;
        onResize(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        onResizeEnd?.();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize, onResizeStart, onResizeEnd]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      setIsDragging(true);
      startPosRef.current = direction === 'horizontal' ? touch.clientX : touch.clientY;
      onResizeStart?.();
    },
    [direction, onResizeStart]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const currentPos = direction === 'horizontal' ? touch.clientX : touch.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    },
    [isDragging, direction, onResize]
  );

  const handleTouchEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onResizeEnd?.();
    }
  }, [isDragging, onResizeEnd]);

  return (
    <div
      className={`resize-handle ${direction} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="resize-handle-grip">
        <GripVertical size={12} />
      </div>
    </div>
  );
}

// Hook to manage resizable panel state
export function useResizablePanel(
  initialWidth: number,
  minWidth: number,
  maxWidth: number
) {
  const [width, setWidth] = useState(initialWidth);

  const handleResize = useCallback(
    (delta: number) => {
      setWidth((prev) => Math.max(minWidth, Math.min(maxWidth, prev + delta)));
    },
    [minWidth, maxWidth]
  );

  const resetWidth = useCallback(() => {
    setWidth(initialWidth);
  }, [initialWidth]);

  return { width, handleResize, resetWidth, setWidth };
}

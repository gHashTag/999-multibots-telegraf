import { useCallback, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import './SwipeToDelete.css';

interface SwipeToDeleteProps {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
  threshold?: number; // Minimum swipe distance to trigger delete (default: 80px)
  deleteLabel?: string;
}

export function SwipeToDelete({
  children,
  onDelete,
  disabled = false,
  threshold = 80,
  deleteLabel = 'Delete',
}: SwipeToDeleteProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const startXRef = useRef(0);
  const currentXRef = useRef(0);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      currentXRef.current = touch.clientX;
      setIsDragging(true);
    },
    [disabled]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging || disabled) return;
      const touch = e.touches[0];
      currentXRef.current = touch.clientX;
      const delta = startXRef.current - touch.clientX;

      // Only allow left swipe (positive delta)
      if (delta > 0) {
        // Apply resistance after threshold
        const resistance = delta > threshold ? 0.3 : 1;
        const newOffset = Math.min(delta * resistance, 150);
        setOffsetX(newOffset);
      } else {
        setOffsetX(0);
      }
    },
    [isDragging, disabled, threshold]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging || disabled) return;
    setIsDragging(false);

    if (offsetX >= threshold) {
      // Trigger delete
      setIsDeleting(true);
      setOffsetX(150);

      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([50, 30, 50]);
      }

      // Delay delete for animation
      setTimeout(() => {
        onDelete();
        setOffsetX(0);
        setIsDeleting(false);
      }, 300);
    } else {
      // Snap back
      setOffsetX(0);
    }
  }, [isDragging, disabled, offsetX, threshold, onDelete]);

  const handleDeleteClick = useCallback(() => {
    if (isDeleting) return;
    setIsDeleting(true);
    setOffsetX(150);

    if ('vibrate' in navigator) {
      navigator.vibrate([50, 30, 50]);
    }

    setTimeout(() => {
      onDelete();
      setOffsetX(0);
      setIsDeleting(false);
    }, 300);
  }, [isDeleting, onDelete]);

  return (
    <div className={`swipe-to-delete ${isDeleting ? 'deleting' : ''}`}>
      <div
        className="swipe-to-delete__delete-bg"
        style={{ width: Math.max(offsetX, 0) }}
        onClick={handleDeleteClick}
      >
        <Trash2 size={18} />
        <span>{deleteLabel}</span>
      </div>
      <div
        className={`swipe-to-delete__content ${isDragging ? 'dragging' : ''}`}
        style={{
          transform: `translateX(-${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

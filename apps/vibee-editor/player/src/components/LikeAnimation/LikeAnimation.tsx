import { useState, useCallback, useRef } from 'react';
import { Heart } from 'lucide-react';
import { STATUS_COLORS } from '@vibee/atoms';
import './LikeAnimation.css';

interface LikeAnimationProps {
  onDoubleTap?: () => void;
  children: React.ReactNode;
}

export function LikeAnimation({ onDoubleTap, children }: LikeAnimationProps) {
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const lastTapRef = useRef(0); // Fixed: use useRef instead of plain object

  const handleClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    lastTapRef.current = now;

    if (timeSinceLastTap < 300) {
      // Double tap detected
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      let clientX: number, clientY: number;

      // Fixed: add null check for changedTouches
      if ('touches' in e && e.changedTouches?.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      } else {
        // Fallback to center of element
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const heartId = Date.now();
      setHearts(prev => [...prev, { id: heartId, x, y }]);

      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([15, 50, 15]);
      }

      onDoubleTap?.();

      // Remove heart after animation
      setTimeout(() => {
        setHearts(prev => prev.filter(h => h.id !== heartId));
      }, 1000);
    }
  }, [onDoubleTap]);

  return (
    <div
      className="like-animation-container"
      onClick={handleClick}
    >
      {children}
      {hearts.map(heart => (
        <div
          key={heart.id}
          className="like-heart"
          style={{
            left: heart.x,
            top: heart.y,
          }}
        >
          <Heart size={80} fill={STATUS_COLORS.error} color={STATUS_COLORS.error} />
        </div>
      ))}
    </div>
  );
}

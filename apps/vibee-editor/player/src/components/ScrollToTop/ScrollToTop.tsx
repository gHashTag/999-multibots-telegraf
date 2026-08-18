// ===============================
// Scroll-to-Top FAB
// Floating action button to scroll back up
// ===============================

import { useState, useEffect, useCallback } from 'react';
import { ChevronUp } from 'lucide-react';
import { useHaptic } from '@/hooks/useHaptic';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import './ScrollToTop.css';

interface ScrollToTopProps {
  threshold?: number; // Show after scrolling this many pixels
  smooth?: boolean;
  position?: 'left' | 'right';
  offset?: { bottom?: number; side?: number };
  className?: string;
}

export function ScrollToTop({
  threshold = 400,
  smooth = true,
  position = 'right',
  offset = { bottom: 80, side: 20 },
  className = '',
}: ScrollToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { light } = useHaptic();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial

    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  const scrollToTop = useCallback(() => {
    light();
    window.scrollTo({
      top: 0,
      behavior: smooth && !prefersReducedMotion ? 'smooth' : 'auto',
    });
  }, [smooth, light, prefersReducedMotion]);

  if (!isVisible) return null;

  return (
    <button
      className={`scroll-to-top scroll-to-top--${position} ${className}`}
      onClick={scrollToTop}
      aria-label="Scroll to top"
      style={{
        bottom: offset.bottom,
        [position]: offset.side,
      }}
    >
      <ChevronUp size={24} />
    </button>
  );
}

// Variant with progress indicator
export function ScrollToTopWithProgress({
  threshold = 400,
  smooth = true,
  position = 'right',
  offset = { bottom: 80, side: 20 },
  className = '',
}: ScrollToTopProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const { light } = useHaptic();
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;

      setIsVisible(scrollTop > threshold);
      setProgress(scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  const scrollToTop = useCallback(() => {
    light();
    window.scrollTo({
      top: 0,
      behavior: smooth && !prefersReducedMotion ? 'smooth' : 'auto',
    });
  }, [smooth, light, prefersReducedMotion]);

  if (!isVisible) return null;

  const circumference = 2 * Math.PI * 18; // radius 18
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <button
      className={`scroll-to-top scroll-to-top--with-progress scroll-to-top--${position} ${className}`}
      onClick={scrollToTop}
      aria-label="Scroll to top"
      style={{
        bottom: offset.bottom,
        [position]: offset.side,
      }}
    >
      <svg className="scroll-to-top__progress" viewBox="0 0 40 40">
        <circle
          className="scroll-to-top__progress-bg"
          cx="20"
          cy="20"
          r="18"
        />
        <circle
          className="scroll-to-top__progress-fill"
          cx="20"
          cy="20"
          r="18"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <ChevronUp size={20} className="scroll-to-top__icon" />
    </button>
  );
}

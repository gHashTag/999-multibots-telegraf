// ===============================
// Collapsing Header Hook
// Hide/show header on scroll
// ===============================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useReducedMotion } from './useReducedMotion';

interface UseCollapsingHeaderOptions {
  threshold?: number; // Scroll distance before hiding
  hideOnScrollDown?: boolean;
  showOnScrollUp?: boolean;
}

interface CollapsingHeaderState {
  isVisible: boolean;
  isAtTop: boolean;
  scrollY: number;
  scrollDirection: 'up' | 'down' | null;
}

export function useCollapsingHeader(
  options: UseCollapsingHeaderOptions = {}
): CollapsingHeaderState & {
  headerRef: React.RefObject<HTMLElement | null>;
  headerStyle: React.CSSProperties;
} {
  const {
    threshold = 10,
    hideOnScrollDown = true,
    showOnScrollUp = true,
  } = options;

  const prefersReducedMotion = useReducedMotion();
  const [state, setState] = useState<CollapsingHeaderState>({
    isVisible: true,
    isAtTop: true,
    scrollY: 0,
    scrollDirection: null,
  });

  const headerRef = useRef<HTMLElement>(null);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const updateHeader = useCallback(() => {
    const currentScrollY = window.scrollY;
    const direction = currentScrollY > lastScrollY.current ? 'down' : 'up';
    const isAtTop = currentScrollY < threshold;

    let isVisible = state.isVisible;

    if (isAtTop) {
      isVisible = true;
    } else if (direction === 'down' && hideOnScrollDown) {
      if (currentScrollY - lastScrollY.current > threshold) {
        isVisible = false;
      }
    } else if (direction === 'up' && showOnScrollUp) {
      if (lastScrollY.current - currentScrollY > threshold / 2) {
        isVisible = true;
      }
    }

    setState({
      isVisible,
      isAtTop,
      scrollY: currentScrollY,
      scrollDirection: direction,
    });

    lastScrollY.current = currentScrollY;
    ticking.current = false;
  }, [threshold, hideOnScrollDown, showOnScrollUp, state.isVisible]);

  useEffect(() => {
    const handleScroll = () => {
      if (!ticking.current) {
        window.requestAnimationFrame(updateHeader);
        ticking.current = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [updateHeader]);

  const headerStyle: React.CSSProperties = prefersReducedMotion
    ? {
        position: 'sticky',
        top: 0,
        visibility: state.isVisible ? 'visible' : 'hidden',
      }
    : {
        position: 'sticky',
        top: 0,
        transform: state.isVisible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.3s ease',
      };

  return {
    ...state,
    headerRef,
    headerStyle,
  };
}

// Variant with opacity instead of translate
export function useCollapsingHeaderOpacity(
  options: UseCollapsingHeaderOptions = {}
) {
  const result = useCollapsingHeader(options);
  const prefersReducedMotion = useReducedMotion();

  const headerStyle: React.CSSProperties = prefersReducedMotion
    ? {
        position: 'sticky',
        top: 0,
        visibility: result.isVisible ? 'visible' : 'hidden',
      }
    : {
        position: 'sticky',
        top: 0,
        opacity: result.isVisible ? 1 : 0,
        pointerEvents: result.isVisible ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
      };

  return {
    ...result,
    headerStyle,
  };
}

// Simple scroll progress (0-1)
export function useScrollProgress(elementRef?: React.RefObject<HTMLElement>) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      let scrollProgress: number;

      if (elementRef?.current) {
        const el = elementRef.current;
        const scrollTop = el.scrollTop;
        const scrollHeight = el.scrollHeight - el.clientHeight;
        scrollProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
      } else {
        const scrollTop = window.scrollY;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
        scrollProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
      }

      setProgress(Math.min(1, Math.max(0, scrollProgress)));
    };

    const target = elementRef?.current || window;
    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial

    return () => target.removeEventListener('scroll', handleScroll);
  }, [elementRef]);

  return progress;
}

import { useState, useEffect, useRef, type RefObject } from 'react';

interface UseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  freezeOnceVisible?: boolean;
}

interface UseIntersectionObserverResult {
  ref: RefObject<HTMLDivElement | null>;
  isVisible: boolean;
  entry: IntersectionObserverEntry | null;
}

/**
 * Hook for lazy loading content when it enters the viewport.
 * Uses Intersection Observer API for efficient scroll-based visibility detection.
 *
 * @param options - Configuration options
 * @param options.threshold - Percentage of element visibility to trigger (0-1)
 * @param options.root - Root element for intersection (default: viewport)
 * @param options.rootMargin - Margin around root element
 * @param options.freezeOnceVisible - If true, keeps isVisible=true after first intersection
 *
 * @example
 * const { ref, isVisible } = useIntersectionObserver({ threshold: 0.1 });
 *
 * return (
 *   <div ref={ref}>
 *     {isVisible && <Video src={videoUrl} />}
 *   </div>
 * );
 */
export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
): UseIntersectionObserverResult {
  const {
    threshold = 0.1,
    root = null,
    rootMargin = '50px',
    freezeOnceVisible = false,
  } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  const frozen = isVisible && freezeOnceVisible;

  useEffect(() => {
    const element = ref.current;
    if (!element || frozen) return;

    // Check for IntersectionObserver support
    if (!('IntersectionObserver' in window)) {
      // Fallback: assume visible for older browsers
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([observerEntry]) => {
        setEntry(observerEntry);
        setIsVisible(observerEntry.isIntersecting);
      },
      {
        threshold,
        root,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, frozen]);

  return { ref, isVisible, entry };
}

/**
 * Hook for detecting when multiple elements enter the viewport.
 * Useful for video lists where you want to load videos as they scroll into view.
 */
export function useIntersectionObserverCallback(
  callback: (entry: IntersectionObserverEntry) => void,
  options: UseIntersectionObserverOptions = {}
): RefObject<HTMLDivElement | null> {
  const {
    threshold = 0.1,
    root = null,
    rootMargin = '50px',
  } = options;

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (!('IntersectionObserver' in window)) {
      // Fallback for older browsers - just call with visible
      callback({
        isIntersecting: true,
        intersectionRatio: 1,
        target: element,
        boundingClientRect: element.getBoundingClientRect(),
        intersectionRect: element.getBoundingClientRect(),
        rootBounds: null,
        time: Date.now(),
      } as IntersectionObserverEntry);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        callback(entry);
      },
      {
        threshold,
        root,
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [callback, threshold, root, rootMargin]);

  return ref;
}

export default useIntersectionObserver;

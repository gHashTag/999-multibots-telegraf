// ===============================
// Virtual Scrolling Hook
// Efficiently render large lists
// ===============================

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';

interface UseVirtualScrollOptions<T> {
  items: T[];
  itemHeight: number | ((item: T, index: number) => number);
  containerHeight: number;
  overscan?: number; // Extra items to render above/below viewport
  getItemKey?: (item: T, index: number) => string | number;
}

interface VirtualItem<T> {
  index: number;
  item: T;
  style: React.CSSProperties;
}

export function useVirtualScroll<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
  getItemKey,
}: UseVirtualScrollOptions<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate item positions
  const itemPositions = useMemo(() => {
    const positions: { offset: number; height: number }[] = [];
    let offset = 0;

    items.forEach((item, index) => {
      const height = typeof itemHeight === 'function'
        ? itemHeight(item, index)
        : itemHeight;
      positions.push({ offset, height });
      offset += height;
    });

    return positions;
  }, [items, itemHeight]);

  // Total height
  const totalHeight = useMemo(() => {
    if (itemPositions.length === 0) return 0;
    const last = itemPositions[itemPositions.length - 1];
    return last.offset + last.height;
  }, [itemPositions]);

  // Find visible range
  const visibleRange = useMemo(() => {
    if (items.length === 0) {
      return { start: 0, end: 0 };
    }

    // Binary search for start index
    let start = 0;
    let end = items.length - 1;

    while (start < end) {
      const mid = Math.floor((start + end) / 2);
      if (itemPositions[mid].offset + itemPositions[mid].height < scrollTop) {
        start = mid + 1;
      } else {
        end = mid;
      }
    }

    const startIndex = Math.max(0, start - overscan);

    // Find end index
    const viewportEnd = scrollTop + containerHeight;
    end = start;

    while (end < items.length && itemPositions[end].offset < viewportEnd) {
      end++;
    }

    const endIndex = Math.min(items.length, end + overscan);

    return { start: startIndex, end: endIndex };
  }, [items.length, itemPositions, scrollTop, containerHeight, overscan]);

  // Virtual items to render
  const virtualItems = useMemo((): VirtualItem<T>[] => {
    const result: VirtualItem<T>[] = [];

    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const item = items[i];
      const position = itemPositions[i];

      result.push({
        index: i,
        item,
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: position.height,
          transform: `translateY(${position.offset}px)`,
        },
      });
    }

    return result;
  }, [items, itemPositions, visibleRange]);

  // Handle scroll
  const handleScroll = useCallback((e: Event) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
  }, []);

  // Attach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to index
  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const container = containerRef.current;
    if (!container || index < 0 || index >= items.length) return;

    const position = itemPositions[index];
    container.scrollTo({
      top: position.offset,
      behavior,
    });
  }, [items.length, itemPositions]);

  // Scroll to top
  const scrollToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    containerRef.current?.scrollTo({ top: 0, behavior });
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    containerRef.current?.scrollTo({ top: totalHeight, behavior });
  }, [totalHeight]);

  // Get key for item
  const getKey = useCallback((item: T, index: number) => {
    if (getItemKey) return getItemKey(item, index);
    return index;
  }, [getItemKey]);

  return {
    containerRef,
    virtualItems,
    totalHeight,
    scrollTop,
    visibleRange,
    scrollToIndex,
    scrollToTop,
    scrollToBottom,
    getKey,
    containerStyle: {
      height: containerHeight,
      overflow: 'auto' as const,
      position: 'relative' as const,
    },
    innerStyle: {
      height: totalHeight,
      position: 'relative' as const,
    },
  };
}

// Simple list virtualization for fixed height items
export function useSimpleVirtualList<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan = 5
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

  const visibleItems = items.slice(startIndex, endIndex).map((item, i) => ({
    item,
    index: startIndex + i,
    style: {
      position: 'absolute' as const,
      top: (startIndex + i) * itemHeight,
      left: 0,
      right: 0,
      height: itemHeight,
    },
  }));

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return {
    visibleItems,
    totalHeight: items.length * itemHeight,
    handleScroll,
    startIndex,
    endIndex,
  };
}

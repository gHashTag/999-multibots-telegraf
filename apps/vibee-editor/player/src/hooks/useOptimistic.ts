// ===============================
// Optimistic Updates Hook
// Instant UI feedback with rollback on error
// ===============================

import { useState, useCallback, useRef } from 'react';

type AsyncAction<T, R> = (optimisticValue: T) => Promise<R>;

interface UseOptimisticOptions<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error, rollbackValue: T) => void;
  onSettled?: () => void;
}

/**
 * Hook for optimistic updates with automatic rollback
 */
export function useOptimistic<T>(
  initialValue: T,
  options: UseOptimisticOptions<T> = {}
) {
  const [value, setValue] = useState(initialValue);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const previousValueRef = useRef<T>(initialValue);

  const update = useCallback(async (
    newValue: T,
    asyncAction: AsyncAction<T, unknown>
  ) => {
    // Store current value for rollback
    previousValueRef.current = value;

    // Optimistically update
    setValue(newValue);
    setIsUpdating(true);
    setError(null);

    try {
      await asyncAction(newValue);
      options.onSuccess?.(newValue);
    } catch (err) {
      // Rollback on error
      const error = err instanceof Error ? err : new Error(String(err));
      setValue(previousValueRef.current);
      setError(error);
      options.onError?.(error, previousValueRef.current);
    } finally {
      setIsUpdating(false);
      options.onSettled?.();
    }
  }, [value, options]);

  const reset = useCallback(() => {
    setValue(previousValueRef.current);
    setError(null);
  }, []);

  return {
    value,
    setValue,
    update,
    reset,
    isUpdating,
    error,
  };
}

/**
 * Hook for optimistic list operations (add, remove, update)
 */
export function useOptimisticList<T extends { id: string | number }>(
  initialItems: T[],
  options: UseOptimisticOptions<T[]> = {}
) {
  const [items, setItems] = useState(initialItems);
  const [pendingIds, setPendingIds] = useState<Set<string | number>>(new Set());
  const [error, setError] = useState<Error | null>(null);
  const previousItemsRef = useRef<T[]>(initialItems);

  // Optimistic add
  const addItem = useCallback(async (
    item: T,
    asyncAction: () => Promise<T>
  ) => {
    previousItemsRef.current = items;
    setItems(prev => [...prev, item]);
    setPendingIds(prev => new Set(prev).add(item.id));
    setError(null);

    try {
      const result = await asyncAction();
      // Replace temp item with server response
      setItems(prev => prev.map(i => i.id === item.id ? result : i));
      options.onSuccess?.(items);
    } catch (err) {
      // Rollback
      setItems(previousItemsRef.current);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error, previousItemsRef.current);
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      options.onSettled?.();
    }
  }, [items, options]);

  // Optimistic remove
  const removeItem = useCallback(async (
    id: string | number,
    asyncAction: () => Promise<void>
  ) => {
    previousItemsRef.current = items;
    const removedItem = items.find(i => i.id === id);
    setItems(prev => prev.filter(i => i.id !== id));
    setPendingIds(prev => new Set(prev).add(id));
    setError(null);

    try {
      await asyncAction();
      options.onSuccess?.(items.filter(i => i.id !== id));
    } catch (err) {
      // Rollback
      setItems(previousItemsRef.current);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error, previousItemsRef.current);
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      options.onSettled?.();
    }
  }, [items, options]);

  // Optimistic update
  const updateItem = useCallback(async (
    id: string | number,
    updates: Partial<T>,
    asyncAction: () => Promise<T>
  ) => {
    previousItemsRef.current = items;
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    setPendingIds(prev => new Set(prev).add(id));
    setError(null);

    try {
      const result = await asyncAction();
      setItems(prev => prev.map(i => i.id === id ? result : i));
      options.onSuccess?.(items.map(i => i.id === id ? { ...i, ...updates } : i));
    } catch (err) {
      // Rollback
      setItems(previousItemsRef.current);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error, previousItemsRef.current);
    } finally {
      setPendingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      options.onSettled?.();
    }
  }, [items, options]);

  const isPending = useCallback((id: string | number) => pendingIds.has(id), [pendingIds]);

  const reset = useCallback(() => {
    setItems(previousItemsRef.current);
    setError(null);
    setPendingIds(new Set());
  }, []);

  return {
    items,
    setItems,
    addItem,
    removeItem,
    updateItem,
    isPending,
    hasPending: pendingIds.size > 0,
    error,
    reset,
  };
}

/**
 * Hook for optimistic toggle (like, bookmark, follow)
 */
export function useOptimisticToggle(
  initialState: boolean,
  onToggle: (newState: boolean) => Promise<boolean>,
  options: {
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const [isActive, setIsActive] = useState(initialState);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const toggle = useCallback(async () => {
    const newState = !isActive;
    setIsActive(newState);
    setIsPending(true);
    setError(null);

    try {
      const confirmedState = await onToggle(newState);
      setIsActive(confirmedState);
      options.onSuccess?.();
    } catch (err) {
      // Rollback
      setIsActive(!newState);
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);
    } finally {
      setIsPending(false);
    }
  }, [isActive, onToggle, options]);

  return {
    isActive,
    toggle,
    isPending,
    error,
  };
}

/**
 * Hook for optimistic counter (likes, views, etc.)
 */
export function useOptimisticCounter(
  initialCount: number,
  onIncrement: () => Promise<number>,
  onDecrement: () => Promise<number>,
  options: {
    onSuccess?: () => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const [count, setCount] = useState(initialCount);
  const [isPending, setIsPending] = useState(false);
  const previousCountRef = useRef(initialCount);

  const increment = useCallback(async () => {
    previousCountRef.current = count;
    setCount(prev => prev + 1);
    setIsPending(true);

    try {
      const newCount = await onIncrement();
      setCount(newCount);
      options.onSuccess?.();
    } catch (err) {
      setCount(previousCountRef.current);
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
    } finally {
      setIsPending(false);
    }
  }, [count, onIncrement, options]);

  const decrement = useCallback(async () => {
    previousCountRef.current = count;
    setCount(prev => Math.max(0, prev - 1));
    setIsPending(true);

    try {
      const newCount = await onDecrement();
      setCount(newCount);
      options.onSuccess?.();
    } catch (err) {
      setCount(previousCountRef.current);
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);
    } finally {
      setIsPending(false);
    }
  }, [count, onDecrement, options]);

  return {
    count,
    increment,
    decrement,
    isPending,
  };
}

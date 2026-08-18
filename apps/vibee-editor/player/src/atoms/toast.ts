import { atom } from 'jotai';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  action?: ToastAction;
}

export const toastsAtom = atom<Toast[]>([]);

let toastId = 0;

export const addToastAtom = atom(
  null,
  (get, set, toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastId}`;
    const newToast: Toast = {
      ...toast,
      id,
      // Loading toasts are persistent by default
      duration: toast.duration ?? (toast.type === 'loading' ? 0 : 5000),
    };
    set(toastsAtom, [...get(toastsAtom), newToast]);
    return id;
  }
);

export const removeToastAtom = atom(null, (get, set, id: string) => {
  set(
    toastsAtom,
    get(toastsAtom).filter((t) => t.id !== id)
  );
});

export const updateToastAtom = atom(
  null,
  (get, set, { id, ...updates }: Partial<Toast> & { id: string }) => {
    set(toastsAtom, get(toastsAtom).map(t =>
      t.id === id ? { ...t, ...updates } : t
    ));
  }
);

export const clearToastsAtom = atom(null, (get, set) => {
  set(toastsAtom, []);
});

// Helper hook for components
export const useToastActions = () => {
  return {
    addToastAtom,
    removeToastAtom,
    updateToastAtom,
    clearToastsAtom,
  };
};

// Convenience hook for easy toast usage
export function useToast() {
  const addToast = useSetAtom(addToastAtom);
  const removeToast = useSetAtom(removeToastAtom);
  const updateToast = useSetAtom(updateToastAtom);
  const clearToasts = useSetAtom(clearToastsAtom);

  const success = useCallback((message: string, title?: string) => {
    return addToast({ type: 'success', message, title });
  }, [addToast]);

  const error = useCallback((message: string, title?: string) => {
    return addToast({ type: 'error', message, title });
  }, [addToast]);

  const warning = useCallback((message: string, title?: string) => {
    return addToast({ type: 'warning', message, title });
  }, [addToast]);

  const info = useCallback((message: string, title?: string) => {
    return addToast({ type: 'info', message, title });
  }, [addToast]);

  const loading = useCallback((message: string, title?: string) => {
    return addToast({ type: 'loading', message, title, duration: 0 });
  }, [addToast]);

  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, [removeToast]);

  const update = useCallback((id: string, updates: Partial<Omit<Toast, 'id'>>) => {
    updateToast({ id, ...updates });
  }, [updateToast]);

  // Promise-based toast (loading -> success/error)
  const promise = useCallback(async <T,>(
    promiseFn: Promise<T>,
    messages: { loading: string; success: string; error: string }
  ): Promise<T> => {
    const id = loading(messages.loading);
    try {
      const result = await promiseFn;
      update(id as string, { type: 'success', message: messages.success, duration: 3000 });
      return result;
    } catch (err) {
      update(id as string, { type: 'error', message: messages.error, duration: 5000 });
      throw err;
    }
  }, [loading, update]);

  return {
    success,
    error,
    warning,
    info,
    loading,
    dismiss,
    update,
    promise,
    clear: clearToasts,
  };
}

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, AlertCircle, Info, Trash2 } from 'lucide-react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

function Toast({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration ?? 3000;
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onClose(toast.id), 200);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(toast.id), 200);
  };

  const icons = {
    success: <Check size={18} />,
    error: <X size={18} />,
    warning: <AlertCircle size={18} />,
    info: <Info size={18} />,
  };

  return (
    <div className={`toast toast--${toast.type} ${isExiting ? 'toast--exit' : ''}`}>
      <span className="toast__icon">{icons[toast.type]}</span>
      <span className="toast__message">{toast.message}</span>
      {toast.action && (
        <button className="toast__action" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      )}
      <button className="toast__close" onClick={handleClose}>
        <X size={14} />
      </button>
    </div>
  );
}

// Toast Container - renders all toasts
interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>,
    document.body
  );
}

// Hook for managing toasts
let toastId = 0;
const listeners: Set<(toasts: ToastMessage[]) => void> = new Set();
let toastsState: ToastMessage[] = [];

function notifyListeners() {
  listeners.forEach((listener) => listener([...toastsState]));
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>(toastsState);

  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, options?: { duration?: number; action?: ToastMessage['action'] }) => {
      const id = `toast-${++toastId}`;
      const newToast: ToastMessage = {
        id,
        type,
        message,
        duration: options?.duration,
        action: options?.action,
      };
      toastsState = [...toastsState, newToast];
      notifyListeners();

      // Haptic feedback
      if ('vibrate' in navigator) {
        if (type === 'success') navigator.vibrate(50);
        else if (type === 'error') navigator.vibrate([50, 50, 50]);
      }

      return id;
    },
    []
  );

  const closeToast = useCallback((id: string) => {
    toastsState = toastsState.filter((t) => t.id !== id);
    notifyListeners();
  }, []);

  const success = useCallback(
    (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) =>
      showToast('success', message, options),
    [showToast]
  );

  const error = useCallback(
    (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) =>
      showToast('error', message, options),
    [showToast]
  );

  const info = useCallback(
    (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) =>
      showToast('info', message, options),
    [showToast]
  );

  const warning = useCallback(
    (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) =>
      showToast('warning', message, options),
    [showToast]
  );

  return {
    toasts,
    showToast,
    closeToast,
    success,
    error,
    info,
    warning,
  };
}

// Global toast functions for use outside React components
export const toast = {
  success: (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) => {
    const id = `toast-${++toastId}`;
    toastsState = [...toastsState, { id, type: 'success', message, ...options }];
    notifyListeners();
    if ('vibrate' in navigator) navigator.vibrate(50);
    return id;
  },
  error: (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) => {
    const id = `toast-${++toastId}`;
    toastsState = [...toastsState, { id, type: 'error', message, ...options }];
    notifyListeners();
    if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
    return id;
  },
  info: (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) => {
    const id = `toast-${++toastId}`;
    toastsState = [...toastsState, { id, type: 'info', message, ...options }];
    notifyListeners();
    return id;
  },
  warning: (message: string, options?: { duration?: number; action?: ToastMessage['action'] }) => {
    const id = `toast-${++toastId}`;
    toastsState = [...toastsState, { id, type: 'warning', message, ...options }];
    notifyListeners();
    return id;
  },
  dismiss: (id: string) => {
    toastsState = toastsState.filter((t) => t.id !== id);
    notifyListeners();
  },
};

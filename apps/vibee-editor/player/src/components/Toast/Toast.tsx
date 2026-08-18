import { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Loader2 } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { toastsAtom, removeToastAtom, type Toast as ToastType } from '@/atoms/toast';
import './Toast.css';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
};

function ToastItem({ toast }: { toast: ToastType }) {
  const removeToast = useSetAtom(removeToastAtom);
  const Icon = icons[toast.type];

  useEffect(() => {
    if (toast.duration) {
      const timer = setTimeout(() => {
        removeToast(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, removeToast]);

  const handleAction = () => {
    if (toast.action) {
      toast.action.onClick();
      removeToast(toast.id);
    }
  };

  return (
    <div className={`toast toast--${toast.type}`}>
      <div className={`toast__icon ${toast.type === 'loading' ? 'toast__icon--spinning' : ''}`}>
        <Icon size={20} />
      </div>
      <div className="toast__content">
        {toast.title && <div className="toast__title">{toast.title}</div>}
        <div className="toast__message">{toast.message}</div>
      </div>
      {toast.action && (
        <button className="toast__action" onClick={handleAction}>
          {toast.action.label}
        </button>
      )}
      {toast.type !== 'loading' && (
        <button className="toast__close" onClick={() => removeToast(toast.id)}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useAtomValue(toastsAtom);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

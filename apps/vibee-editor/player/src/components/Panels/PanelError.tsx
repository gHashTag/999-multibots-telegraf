import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './PanelError.css';

interface PanelErrorProps {
  onRetry?: () => void;
  title?: string;
}

export function PanelError({ onRetry, title }: PanelErrorProps) {
  const { t } = useLanguage();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="panel-error">
      <div className="panel-error__icon">
        <AlertTriangle size={32} />
      </div>
      <h3 className="panel-error__title">
        {title || t('error.panel_crashed')}
      </h3>
      <p className="panel-error__desc">
        {t('error.panel_desc')}
      </p>
      <button className="panel-error__btn" onClick={handleRetry}>
        <RefreshCw size={16} />
        <span>{t('error.retry')}</span>
      </button>
    </div>
  );
}

// RemixBadge - Shows when user is working on a remix
import { useAtomValue, useSetAtom } from 'jotai';
import { currentRemixSourceAtom } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { Sparkles, X } from 'lucide-react';
import './RemixBadge.css';

export function RemixBadge() {
  const { t } = useLanguage();
  const remixSource = useAtomValue(currentRemixSourceAtom);
  const setRemixSource = useSetAtom(currentRemixSourceAtom);

  if (!remixSource) return null;

  const handleClear = () => {
    setRemixSource(null);
  };

  return (
    <div className="remix-badge">
      <Sparkles size={14} />
      <span className="remix-badge-text">
        {t('remix.of')} <strong>{remixSource.templateName}</strong> {t('remix.by')} {remixSource.creatorName}
      </span>
      <button className="remix-badge-close" onClick={handleClear} title="Clear remix info">
        <X size={12} />
      </button>
    </div>
  );
}

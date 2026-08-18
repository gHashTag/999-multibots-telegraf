import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSetAtom } from 'jotai';
import { fetchInstagramStatusAtom } from '@/atoms/user';
import { useLanguage } from '@/hooks/useLanguage';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { API_BASE } from '../config';
import './InstagramCallback.css';

type Status = 'loading' | 'success' | 'error';

export default function InstagramCallback() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const fetchInstagramStatus = useSetAtom(fetchInstagramStatusAtom);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setStatus('error');
      setErrorMessage(t('instagram.missingCode'));
      return;
    }

    // Exchange code for token via backend
    const exchangeCode = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/instagram/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`);

        const data = await response.json();

        if (response.ok && data.success) {
          setStatus('success');

          // Refresh Instagram status in the app
          await fetchInstagramStatus();

          // Redirect to editor with share modal open after 2 seconds
          setTimeout(() => {
            navigate('/editor?openShare=true');
          }, 2000);
        } else {
          setStatus('error');
          setErrorMessage(data.error || t('instagram.failed'));
        }
      } catch (error) {
        console.error('Instagram callback error:', error);
        setStatus('error');
        setErrorMessage(t('instagram.networkError'));
      }
    };

    exchangeCode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, navigate, fetchInstagramStatus]);

  return (
    <div className="instagram-callback">
      <div className="instagram-callback__card">
        {status === 'loading' && (
          <>
            <Loader2 className="instagram-callback__icon spin" size={48} />
            <h2>{t('instagram.connecting')}</h2>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="instagram-callback__icon instagram-callback__icon--success" size={48} />
            <h2>{t('instagram.done')}</h2>
            <p>{t('instagram.successMessage')}</p>
            <p className="instagram-callback__redirect">{t('instagram.openingShare')}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="instagram-callback__icon instagram-callback__icon--error" size={48} />
            <h2>{t('instagram.failed')}</h2>
            <p>{errorMessage}</p>
            <button
              className="instagram-callback__button"
              onClick={() => navigate('/editor')}
            >
              {t('instagram.backToEditor')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

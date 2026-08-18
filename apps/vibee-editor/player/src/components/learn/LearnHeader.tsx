import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import './LearnHeader.css';

export function LearnHeader() {
  const { lang, setLang } = useLanguage();

  return (
    <header className="learn-header">
      <div className="learn-header-container">
        {/* Logo */}
        <Link to="/" className="learn-logo">
          <img src="/logo.svg" alt="VIBEE" className="logo-icon" />
        </Link>

        {/* Spacer */}
        <div className="header-spacer" />

        {/* Actions */}
        <div className="learn-header-actions">
          <button
            className="lang-toggle"
            onClick={() => setLang(lang === 'en' ? 'ru' : 'en')}
            title={lang === 'en' ? 'Переключить на русский' : 'Switch to English'}
          >
            {lang.toUpperCase()}
          </button>
        </div>
      </div>
    </header>
  );
}

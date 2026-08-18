import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './Header.css';

export function Header() {
  const { lang, setLang, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <header className="landing-header">
        <div className="header-container">
          <Link to="/" className="header-logo">
            <img src="/logo.svg" alt="VIBEE" className="logo-icon-svg" />
          </Link>

          <nav className="header-nav">
            <a href="#features" className="nav-link">{t('nav.features')}</a>
            <a href="#pricing" className="nav-link">{t('nav.pricing')}</a>
            <a href="https://github.com/gHashTag/vibee" className="nav-link" target="_blank" rel="noopener noreferrer">{t('nav.docs')}</a>
          </nav>

          <div className="header-actions">
            <button
              className="lang-toggle"
              onClick={() => setLang(lang === 'en' ? 'ru' : 'en')}
              title={lang === 'en' ? 'Переключить на русский' : 'Switch to English'}
            >
              {lang.toUpperCase()}
            </button>
            <Link to="/editor" className="btn-cta">
              {t('nav.getStarted')}
            </Link>
            <button
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div
        className={`mobile-nav-overlay ${mobileMenuOpen ? 'open' : ''}`}
        onClick={closeMobileMenu}
      />
      <nav className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}>
        <a href="#features" className="mobile-nav-link" onClick={closeMobileMenu}>
          {t('nav.features')}
        </a>
        <a href="#pricing" className="mobile-nav-link" onClick={closeMobileMenu}>
          {t('nav.pricing')}
        </a>
        <a href="https://github.com/gHashTag/vibee" className="mobile-nav-link" onClick={closeMobileMenu} target="_blank" rel="noopener noreferrer">
          {t('nav.docs')}
        </a>
        <div className="mobile-nav-divider" />
        <Link to="/editor" className="btn-cta" onClick={closeMobileMenu}>
          {t('nav.getStarted')}
        </Link>
      </nav>
    </>
  );
}

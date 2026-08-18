import { Header } from '@/components/Header';
import { TemplatesPanel } from '@/components/Panels/TemplatesPanel';
import { useLanguage } from '@/hooks/useLanguage';
import './Templates.css';

export function TemplatesPage() {
  const { t } = useLanguage();

  return (
    <div className="templates-page">
      <Header />
      <main className="templates-main">
        <section className="templates-content">
          <h1 className="templates-title">{t('templates.title')}</h1>
          <p className="templates-subtitle">{t('templates.pageSubtitle')}</p>
          <TemplatesPanel />
        </section>
      </main>
    </div>
  );
}

export default TemplatesPage;

import { useLanguage } from '@/hooks/useLanguage';
import './HowItWorks.css';

const steps = [
  {
    number: '01',
    titleKey: 'howItWorks.step1.title',
    descKey: 'howItWorks.step1.desc',
    emoji: '📝',
  },
  {
    number: '02',
    titleKey: 'howItWorks.step2.title',
    descKey: 'howItWorks.step2.desc',
    emoji: '🎬',
  },
  {
    number: '03',
    titleKey: 'howItWorks.step3.title',
    descKey: 'howItWorks.step3.desc',
    emoji: '🚀',
  },
];

export function HowItWorks() {
  const { t } = useLanguage();

  return (
    <section className="how-it-works">
      <div className="how-container">
        <div className="how-header">
          <span className="how-badge">{t('howItWorks.badge')}</span>
          <h2 className="how-title">{t('howItWorks.title')}</h2>
          <p className="how-subtitle">{t('howItWorks.subtitle')}</p>
        </div>

        <div className="how-steps">
          {steps.map((step, index) => (
            <div className="how-step" key={index}>
              <div className="step-number">{step.number}</div>
              <div className="step-icon"><span style={{ fontSize: '40px' }}>{step.emoji}</span></div>
              <h3 className="step-title">{t(step.titleKey)}</h3>
              <p className="step-desc">{t(step.descKey)}</p>
              {index < steps.length - 1 && <div className="step-connector" />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

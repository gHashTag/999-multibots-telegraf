import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import './Pricing.css';

const plans = [
  {
    id: 'free',
    nameKey: 'pricing.free.name',
    priceKey: 'pricing.free.price',
    periodKey: 'pricing.free.period',
    features: [
      'pricing.free.feature1',
      'pricing.free.feature2',
      'pricing.free.feature3',
      'pricing.free.feature4',
    ],
    ctaKey: 'pricing.free.cta',
    highlighted: false,
  },
  {
    id: 'pro',
    nameKey: 'pricing.pro.name',
    priceKey: 'pricing.pro.price',
    periodKey: 'pricing.pro.period',
    features: [
      'pricing.pro.feature1',
      'pricing.pro.feature2',
      'pricing.pro.feature3',
      'pricing.pro.feature4',
      'pricing.pro.feature5',
    ],
    ctaKey: 'pricing.pro.cta',
    highlighted: true,
    popularKey: 'pricing.pro.popular',
  },
  {
    id: 'business',
    nameKey: 'pricing.business.name',
    priceKey: 'pricing.business.price',
    periodKey: 'pricing.business.period',
    features: [
      'pricing.business.feature1',
      'pricing.business.feature2',
      'pricing.business.feature3',
      'pricing.business.feature4',
      'pricing.business.feature5',
    ],
    ctaKey: 'pricing.business.cta',
    highlighted: false,
  },
];

export function Pricing() {
  const { t } = useLanguage();

  return (
    <section className="pricing" id="pricing">
      <div className="pricing-container">
        <div className="pricing-header">
          <span className="pricing-header-badge">{t('pricing.badge')}</span>
          <h2 className="pricing-title">{t('pricing.title')}</h2>
          <p className="pricing-subtitle">{t('pricing.subtitle')}</p>
        </div>

        <div className="pricing-grid">
          {plans.map((plan, index) => (
            <div
              className={`pricing-card ${plan.highlighted ? 'highlighted' : ''}`}
              key={index}
            >
              {plan.highlighted && plan.popularKey && (
                <div className="pricing-badge">{t(plan.popularKey)}</div>
              )}
              <div className="pricing-name">{t(plan.nameKey)}</div>
              <div className="pricing-price">
                <span className="price-value">{t(plan.priceKey)}</span>
                <span className="price-period">{t(plan.periodKey)}</span>
              </div>
              <ul className="pricing-features">
                {plan.features.map((featureKey, i) => (
                  <li key={i}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t(featureKey)}
                  </li>
                ))}
              </ul>
              <Link
                to={`/editor?plan=${plan.id}`}
                className={`pricing-cta ${plan.highlighted ? 'primary' : 'secondary'}`}
              >
                {t(plan.ctaKey)}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// PaywallModal - Subscription paywall
// Shows when free renders are exhausted

import { useAtomValue, useSetAtom } from 'jotai';
import { showPaywallAtom, renderQuotaAtom, userAtom } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { X, Zap, Star, Crown, CreditCard, Sparkles } from 'lucide-react';
import './styles.css';

const PLANS = [
  {
    id: 'junior',
    nameKey: 'paywall.junior',
    price: 99,
    generations: 100,
    featureKeys: ['100 renders/month', 'paywall.hdQuality', 'paywall.emailSupport'],
    popular: false,
  },
  {
    id: 'middle',
    nameKey: 'paywall.middle',
    price: 299,
    generations: 500,
    featureKeys: ['500 renders/month', 'paywall.4kQuality', 'paywall.prioritySupport', 'paywall.customFonts'],
    popular: true,
  },
  {
    id: 'senior',
    nameKey: 'paywall.senior',
    price: 999,
    generations: null, // Unlimited
    featureKeys: ['paywall.unlimitedRenders', 'paywall.4kQuality', 'paywall.premiumSupport', 'paywall.customFonts', 'paywall.apiAccess'],
    popular: false,
  },
];

const PAYMENT_METHODS = [
  { id: 'robokassa', name: 'Robokassa', icon: CreditCard, labelKey: 'paywall.card' },
  { id: 'stars', name: 'Telegram Stars', icon: Star, labelKey: 'paywall.stars' },
  { id: 'ton', name: 'TON', icon: Sparkles, labelKey: 'paywall.ton' },
];

interface PaywallModalProps {
  onClose?: () => void;
}

export function PaywallModal({ onClose }: PaywallModalProps) {
  const { t } = useLanguage();
  const showPaywall = useAtomValue(showPaywallAtom);
  const setShowPaywall = useSetAtom(showPaywallAtom);
  const quota = useAtomValue(renderQuotaAtom);
  const user = useAtomValue(userAtom);

  // Translate feature key or return as-is if it's a number-based string
  const translateFeature = (key: string) => {
    if (key.startsWith('paywall.')) {
      return t(key);
    }
    // Handle "100 renders/month" style strings
    const match = key.match(/^(\d+)\s+renders\/month$/);
    if (match) {
      return `${match[1]} ${t('paywall.rendersMonth')}`;
    }
    return key;
  };

  const handleClose = () => {
    setShowPaywall(false);
    onClose?.();
  };

  const handleSubscribe = async (planId: string, paymentMethod: string) => {
    if (!user) return;

    // TODO: Integrate with payment API
    // For now, open Telegram bot for payment
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return;

    // Redirect to Telegram bot with payment deeplink
    const telegramUrl = `https://telegram.me/t27ai_bot?start=subscribe_${planId}_${paymentMethod}`;
    window.open(telegramUrl, '_blank');

    console.log('[Paywall] Subscribe clicked:', { planId, paymentMethod, user: user.id });
  };

  if (!showPaywall) return null;

  return (
    <div className="paywall-overlay" onClick={handleClose}>
      <div className="paywall-modal" onClick={(e) => e.stopPropagation()}>
        <button className="paywall-close" onClick={handleClose}>
          <X size={24} />
        </button>

        <div className="paywall-header">
          <Zap size={48} className="paywall-icon" />
          <h2>{t('paywall.freeUsedUp')}</h2>
          <p className="paywall-subtitle">
            {t('paywall.subscribeMessage')}
          </p>
        </div>

        <div className="paywall-plans">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`paywall-plan ${plan.popular ? 'popular' : ''}`}
            >
              {plan.popular && (
                <div className="plan-badge">{t('paywall.mostPopular')}</div>
              )}

              <div className="plan-header">
                <h3 className="plan-name">{t(plan.nameKey)}</h3>
                <div className="plan-price">
                  <span className="price-amount">${plan.price}</span>
                  <span className="price-period">{t('paywall.perMonth')}</span>
                </div>
              </div>

              <div className="plan-generations">
                {plan.generations === null ? (
                  <>
                    <Crown size={20} />
                    <span>{t('paywall.unlimitedRenders')}</span>
                  </>
                ) : (
                  <>
                    <Zap size={20} />
                    <span>{plan.generations} {t('paywall.rendersMonth')}</span>
                  </>
                )}
              </div>

              <ul className="plan-features">
                {plan.featureKeys.map((featureKey, i) => (
                  <li key={i}>{translateFeature(featureKey)}</li>
                ))}
              </ul>

              <div className="plan-payment-methods">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    className="payment-btn"
                    onClick={() => handleSubscribe(plan.id, method.id)}
                    title={method.name}
                  >
                    <method.icon size={16} />
                    <span>{t(method.labelKey)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="paywall-footer">
          <p>{t('paywall.securePayments')}</p>
        </div>
      </div>
    </div>
  );
}

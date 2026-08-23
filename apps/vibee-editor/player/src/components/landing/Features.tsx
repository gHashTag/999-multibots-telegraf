import { useLanguage } from '@/hooks/useLanguage'
import { BRAND_COLORS } from '@vibee/atoms'
import './Features.css'

const features = [
  {
    emoji: '🎬',
    titleKey: 'features.reels.title',
    descKey: 'features.reels.desc',
    gradient: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, #4dffab 100%)`,
  },
  {
    emoji: '🌐',
    titleKey: 'features.feed.title',
    descKey: 'features.feed.desc',
    gradient: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, #80ffbe 100%)`,
  },
  {
    emoji: '🤖',
    titleKey: 'features.avatars.title',
    descKey: 'features.avatars.desc',
    gradient: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, #4dffab 100%)`,
  },
  {
    emoji: '📈',
    titleKey: 'features.analytics.title',
    descKey: 'features.analytics.desc',
    gradient: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, #80ffbe 100%)`,
  },
]

export function Features() {
  const { t } = useLanguage()

  return (
    <section className="features" id="features">
      <div className="features-container">
        <div className="features-header">
          <span className="features-badge">{t('features.badge')}</span>
          <h2 className="features-title">{t('features.title')}</h2>
          <p className="features-subtitle">{t('features.subtitle')}</p>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <div
              className="feature-card"
              key={index}
              style={{ '--delay': `${index * 0.1}s` } as React.CSSProperties}
            >
              <div
                className="feature-icon"
                style={{ background: feature.gradient }}
              >
                <span className="feature-emoji">{feature.emoji}</span>
              </div>
              <h3 className="feature-title">{t(feature.titleKey)}</h3>
              <p className="feature-desc">{t(feature.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

import { useLanguage } from '@/hooks/useLanguage';
import './CreatorShowcase.css';

// Mock data for creators
const creators = [
  {
    id: 1,
    name: 'Anna K.',
    username: '@anna_creates',
    avatar: null, // Placeholder
    followers: '45.2K',
    reels: 128,
    quote: 'creatorShowcase.quote1',
  },
  {
    id: 2,
    name: 'Max V.',
    username: '@max_video',
    avatar: null,
    followers: '32.8K',
    reels: 89,
    quote: 'creatorShowcase.quote2',
  },
  {
    id: 3,
    name: 'Lisa M.',
    username: '@lisa_motion',
    avatar: null,
    followers: '67.1K',
    reels: 203,
    quote: 'creatorShowcase.quote3',
  },
];

export function CreatorShowcase() {
  const { t } = useLanguage();

  return (
    <section className="creator-showcase">
      <div className="creator-showcase-container">
        <div className="creator-showcase-header">
          <span className="creator-showcase-badge">{t('creatorShowcase.badge')}</span>
          <h2 className="creator-showcase-title">{t('creatorShowcase.title')}</h2>
          <p className="creator-showcase-subtitle">{t('creatorShowcase.subtitle')}</p>
        </div>

        <div className="creator-showcase-grid">
          {creators.map((creator, index) => (
            <div
              className="creator-card"
              key={creator.id}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="creator-card-header">
                <div className="creator-avatar">
                  <div className="creator-avatar-placeholder">
                    {creator.name.charAt(0)}
                  </div>
                </div>
                <div className="creator-info">
                  <h3 className="creator-name">{creator.name}</h3>
                  <span className="creator-username">{creator.username}</span>
                </div>
              </div>

              <div className="creator-stats">
                <div className="creator-stat">
                  <span className="creator-stat-value">{creator.followers}</span>
                  <span className="creator-stat-label">{t('creatorShowcase.followers')}</span>
                </div>
                <div className="creator-stat-divider" />
                <div className="creator-stat">
                  <span className="creator-stat-value">{creator.reels}</span>
                  <span className="creator-stat-label">{t('creatorShowcase.reels')}</span>
                </div>
              </div>

              <blockquote className="creator-quote">
                "{t(creator.quote)}"
              </blockquote>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

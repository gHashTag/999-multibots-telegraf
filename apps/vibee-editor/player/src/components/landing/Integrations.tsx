import { useLanguage } from '@/hooks/useLanguage';
import './Integrations.css';

const integrations = [
  { name: 'Kling AI', category: 'Video' },
  { name: 'Hedra', category: 'Avatar' },
  { name: 'HeyGen', category: 'Avatar' },
  { name: 'ElevenLabs', category: 'Voice' },
  { name: 'OpenAI', category: 'AI' },
  { name: 'BFL FLUX', category: 'Image' },
  { name: 'FAL.ai', category: 'Image' },
  { name: 'Replicate', category: 'AI' },
  { name: 'KIE.ai', category: 'Video' },
  { name: 'Gemini', category: 'AI' },
];

export function Integrations() {
  const { t } = useLanguage();

  return (
    <section className="integrations">
      <div className="integrations-container">
        <div className="integrations-header">
          <h2 className="integrations-title">{t('integrations.title')}</h2>
          <p className="integrations-subtitle">{t('integrations.subtitle')}</p>
        </div>

        <div className="integrations-track">
          <div className="integrations-slider">
            {[...integrations, ...integrations].map((integration, index) => (
              <div className="integration-card" key={index}>
                <span className="integration-name">{integration.name}</span>
                <span className="integration-category">{integration.category}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

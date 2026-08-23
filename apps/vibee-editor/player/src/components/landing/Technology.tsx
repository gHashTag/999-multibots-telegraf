import { useLanguage } from '@/hooks/useLanguage'
import { BRAND_COLORS } from '@vibee/atoms'
import './Technology.css'

const technologies = [
  {
    emoji: '⚡',
    title: 'VIBEE V5',
    subtitle: 'Ultra-Minimal Syntax',
    features: [
      '75% boilerplate reduction',
      'Smart type inference',
      'Async/await built-in',
      '10 new features',
    ],
    gradient: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, #4dffab 100%)`,
  },
  {
    emoji: '🚀',
    title: 'V4 Compiler',
    subtitle: 'Production-Ready',
    features: [
      '10-100x faster compilation',
      'Incremental + parallel',
      'Full IDE support (LSP)',
      '200+ test cases',
    ],
    gradient: `linear-gradient(135deg, #4dffab 0%, #80ffbe 100%)`,
  },
  {
    emoji: '🧠',
    title: 'ML/RL Integration',
    subtitle: 'AI-Powered',
    features: [
      'PyTorch, JAX, Candle',
      'GPU acceleration',
      'Reinforcement learning',
      '10-100x performance',
    ],
    gradient: `linear-gradient(135deg, #80ffbe 0%, ${BRAND_COLORS.amber} 100%)`,
  },
  {
    emoji: '🔄',
    title: 'Parallel Computing',
    subtitle: 'Unified API',
    features: [
      'CPU/GPU/Actor/Distributed',
      'Actor model (BEAM)',
      'Real-time processing',
      '$530K/year savings',
    ],
    gradient: `linear-gradient(135deg, ${BRAND_COLORS.amber} 0%, #4dffab 100%)`,
  },
]

export function Technology() {
  const { t } = useLanguage()

  return (
    <section className="technology" id="technology">
      <div className="technology-container">
        <div className="technology-header">
          <span className="technology-badge">Technology</span>
          <h2 className="technology-title">Built on Cutting-Edge Tech</h2>
          <p className="technology-subtitle">
            Powered by VIBEE V5 - the most advanced language for AI agents
          </p>
        </div>

        <div className="technology-grid">
          {technologies.map((tech, index) => (
            <div
              className="technology-card"
              key={index}
              style={{ '--delay': `${index * 0.1}s` } as React.CSSProperties}
            >
              <div
                className="technology-icon"
                style={{ background: tech.gradient }}
              >
                <span className="technology-emoji">{tech.emoji}</span>
              </div>
              <h3 className="technology-title-text">{tech.title}</h3>
              <p className="technology-subtitle-text">{tech.subtitle}</p>
              <ul className="technology-features">
                {tech.features.map((feature, i) => (
                  <li key={i} className="technology-feature">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="technology-stats">
          <div className="technology-stat">
            <div className="technology-stat-value">75%</div>
            <div className="technology-stat-label">Less Boilerplate</div>
          </div>
          <div className="technology-stat">
            <div className="technology-stat-value">100x</div>
            <div className="technology-stat-label">Faster Compilation</div>
          </div>
          <div className="technology-stat">
            <div className="technology-stat-value">$630K</div>
            <div className="technology-stat-label">Annual Savings</div>
          </div>
          <div className="technology-stat">
            <div className="technology-stat-value">10+</div>
            <div className="technology-stat-label">New Features</div>
          </div>
        </div>

        {/* CTA */}
        <div className="technology-cta">
          <a
            href="https://github.com/gHashTag/vibee-gleam"
            target="_blank"
            rel="noopener noreferrer"
            className="technology-cta-button"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            View on GitHub
          </a>
          <a href="/docs/V5_FINAL_REPORT.md" className="technology-cta-link">
            Read Documentation →
          </a>
        </div>
      </div>
    </section>
  )
}

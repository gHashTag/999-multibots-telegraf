import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { API_BASE } from '@/config'
import './Pricing.css'

/**
 * THE FIRST PAGE A VISITOR SEES SOLD A SUBSCRIPTION THAT DOES NOT EXIST.
 *
 * This section offered three monthly tiers -- free, nineteen dollars, and
 * forty-nine dollars -- in both locales, with feature lists to match: three
 * reels a month, unlimited reels, no watermark, 4K export, five team members,
 * shared assets, team analytics, a dedicated manager. None of it exists:
 * there is no monthly plan, no watermark, no seat, no 4K switch, and no code
 * has ever charged anyone a monthly fee. The chosen tier even travelled in
 * the CTA as a query parameter, which NOTHING in this repository reads.
 *
 * It was the third invented tier found in one day: the business bot offered
 * rouble tariffs (#2282), the agent offered a club priced in dollars a month
 * (#2285), and this offered two more. One product was being described three
 * different ways, and none of them was the real one.
 *
 * The prices are spelled in words above on purpose: the guard in
 * src/__tests__/the-landing-sells-tokens.test.ts greps this file for the
 * shape of a plan, and a comment quoting one reads exactly like the offer.
 *
 * The owner sells tokens. So this section shows the packs -- and it FETCHES
 * them from /api/tokens/packs (public, no credential) rather than keeping a
 * fourth copy of the numbers. If the fetch does not answer, the section still
 * renders and simply names no price: a landing page that invents a number is
 * exactly the failure being repaired here.
 */

interface Pack {
  id: string
  tokens: number
  stars: number
}

/**
 * The endpoint answers with Russian field names -- it has since it existed.
 * Translate once, here, and let the rest of the file read in one language;
 * bracket access also keeps those names inside string literals, which is
 * where this repository's Cyrillic gate expects user-facing text to live.
 */
function toPack(raw: Record<string, unknown>): Pack {
  return {
    id: String(raw['id']),
    tokens: Number(raw['токенов']),
    stars: Number(raw['звёзд']),
  }
}

export function Pricing() {
  const { t } = useLanguage()
  const [packs, setPacks] = useState<Pack[] | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tokens/packs`)
        const d = await res.json()
        const raw = d?.['пакеты']
        if (alive && Array.isArray(raw)) setPacks(raw.map(toPack))
      } catch {
        /* no answer means no price shown, never an invented one */
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const features = [
    t('pricing.tokens.feature1'),
    t('pricing.tokens.feature2'),
    t('pricing.tokens.feature3'),
    t('pricing.tokens.feature4'),
  ]

  return (
    <section className="pricing" id="pricing">
      <div className="pricing-container">
        <div className="pricing-header">
          <span className="pricing-header-badge">{t('pricing.badge')}</span>
          <h2 className="pricing-title">{t('pricing.title')}</h2>
          <p className="pricing-subtitle">{t('pricing.subtitle')}</p>
        </div>

        {packs && (
          <div className="pricing-grid">
            {packs.map((pack, index) => (
              <div
                className={`pricing-card ${index === 1 ? 'highlighted' : ''}`}
                key={pack.id}
              >
                {index === 1 && (
                  <div className="pricing-badge">
                    {t('pricing.pro.popular')}
                  </div>
                )}
                <div className="pricing-name">
                  {t('pricing.pack.name', { n: pack.tokens })}
                </div>
                <div className="pricing-price">
                  <span className="price-value">{pack.stars} ⭐</span>
                  <span className="price-period">
                    {t('pricing.pack.period')}
                  </span>
                </div>
                <ul className="pricing-features">
                  {features.map((feature, i) => (
                    <li key={i}>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/editor"
                  className={`pricing-cta ${index === 1 ? 'primary' : 'secondary'}`}
                >
                  {t('pricing.pack.cta')}
                </Link>
              </div>
            ))}
          </div>
        )}

        <p className="pricing-subtitle">{t('pricing.tokens.note')}</p>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'
import {
  AGENT_PACKAGES,
  agentPackageOrderUrl,
  tryableAgentOf,
} from '../../../../packages/vibee-atoms/src/agent-packages'
import type { Language } from '@/hooks/useLanguage'
import { openTelegramLink } from '@/lib/telegram'
import './PackageCards.css'

const copy = {
  en: {
    popular: 'Most chosen',
    setup: 'launch',
    monthly: (usd: number) => `then $${usd}/month · first month included`,
    order: 'Order',
    tryFirst: 'Try it first',
  },
  ru: {
    popular: 'Выбирают чаще',
    setup: 'запуск',
    monthly: (usd: number) => `далее $${usd}/мес · первый месяц включён`,
    order: 'Заказать',
    tryFirst: 'Сначала попробовать',
  },
} as const

/**
 * THE THREE AGENTS FOR SALE, drawn from the one catalogue
 * (packages/vibee-atoms/src/agent-packages.ts). Shown on /welcome and on
 * /agents#packages -- one component, so the two screens cannot quote
 * different prices.
 *
 * "Order" opens the bot with `agentpkg_<id>`: the bot confirms the request
 * and tells the team, who set the agent's bot up by hand. There is no
 * checkout here yet, and the button does not pretend there is.
 */
export function PackageCards({ lang }: { lang: Language }) {
  const l = lang === 'ru' ? 'ru' : 'en'
  const text = copy[l]
  return (
    <div className="package-cards">
      {AGENT_PACKAGES.map(pkg => {
        const tryable = tryableAgentOf(pkg)
        return (
          <article
            key={pkg.id}
            className={`package-card${pkg.popular ? ' package-card--popular' : ''}`}
            data-testid={`package-${pkg.id}`}
          >
            {pkg.popular ? (
              <span className="package-card__badge">{text.popular}</span>
            ) : null}
            <span className="package-card__icon" aria-hidden="true">
              {pkg.icon}
            </span>
            <h3 className="package-card__name">{pkg.name[l]}</h3>
            <p className="package-card__price">
              <strong>${pkg.setupUsd}</strong> <span>{text.setup}</span>
            </p>
            <p className="package-card__monthly">
              {text.monthly(pkg.monthlyUsd)}
            </p>
            <p className="package-card__promise">{pkg.promise[l]}</p>
            <ul className="package-card__includes">
              {pkg.includes.map(item => (
                <li key={item.en}>{item[l]}</li>
              ))}
            </ul>
            <div className="package-card__actions">
              <button
                type="button"
                className="package-card__order"
                onClick={() => openTelegramLink(agentPackageOrderUrl(pkg))}
              >
                {text.order} →
              </button>
              {tryable ? (
                <Link
                  className="package-card__try"
                  to={`/agents/${tryable}/work`}
                >
                  {text.tryFirst}
                </Link>
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

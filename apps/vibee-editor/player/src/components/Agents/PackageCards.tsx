import { Link } from 'react-router-dom'
import {
  AGENT_PACKAGES,
  agentPackageOrderUrl,
  tryableAgentOf,
} from '../../../../packages/vibee-atoms/src/agent-packages'
import {
  monthTokens,
  reelsIn,
} from '../../../../packages/vibee-atoms/src/token-wallet'
import type { Language } from '@/hooks/useLanguage'
import { openTelegramLink } from '@/lib/telegram'
import { tryFreeNote } from './tryFree'
import './PackageCards.css'

const copy = {
  en: {
    popular: 'Most chosen',
    setup: 'launch',
    monthly: (usd: number) => `then $${usd}/month · first month included`,
    tokens: (tokens: string, reels: number) =>
      `${tokens} tokens a month ≈ ${reels} reels`,
    textTokens: (tokens: string) =>
      `${tokens} tokens a month for client replies · text only`,
    order: 'Order',
    orderLabel: (name: string) => `Order ${name}`,
    tryFirst: 'Try it first',
    // Starts with the visible words, so voice control can say what it sees.
    tryLabel: (name: string) => `Try it first: ${name}, free`,
  },
  ru: {
    popular: 'Выбирают чаще',
    setup: 'запуск',
    monthly: (usd: number) => `далее $${usd}/мес · первый месяц включён`,
    tokens: (tokens: string, reels: number) =>
      `${tokens} токенов в месяц ≈ ${reels} рилсов`,
    textTokens: (tokens: string) =>
      `${tokens} токенов в месяц на ответы клиентам · только текст`,
    order: 'Заказать',
    orderLabel: (name: string) => `Заказать: ${name}`,
    tryFirst: 'Сначала попробовать',
    tryLabel: (name: string) => `Сначала попробовать: ${name}, бесплатно`,
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
  /*
   * WHAT "TRY IT FIRST" COSTS, SAID UNDER THE BUTTON. Every competitor states
   * the condition next to the try button (Lindy: "no credit card required";
   * Relevance AI: "Free" on each template); ours said nothing, and outside
   * Telegram the chat turned out to need a sign-in. The agent chat is on the
   * FREE list (render/src/agent/pricing.ts) -- the price claim is pinned to
   * that list by a test -- and a browser with no credential is told up front
   * that it will be asked to sign in. The words live in ./tryFree.ts, shared
   * with the welcome screen's own try button.
   */
  const tryNote = tryFreeNote(l)
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
            {/*
             * THE MONTH IN TOKENS AND RESULTS. The whole monthly fee becomes
             * tokens at the one rate (specs/automation/token-wallet.t27), and
             * a reel is the story reel's own estimate -- so this line moves
             * when a price moves, never by hand.
             */}
            <p className="package-card__tokens">
              {pkg.media
                ? text.tokens(
                    monthTokens(pkg.monthlyUsd).toLocaleString(
                      l === 'ru' ? 'ru-RU' : 'en-US'
                    ),
                    reelsIn(monthTokens(pkg.monthlyUsd))
                  )
                : text.textTokens(
                    monthTokens(pkg.monthlyUsd).toLocaleString(
                      l === 'ru' ? 'ru-RU' : 'en-US'
                    )
                  )}
            </p>
            <p className="package-card__promise">{pkg.promise[l]}</p>
            <ul className="package-card__includes">
              {pkg.includes.map(item => (
                <li key={item.en}>{item[l]}</li>
              ))}
            </ul>
            <div className="package-card__actions">
              <a
                className="package-card__order"
                href={agentPackageOrderUrl(pkg)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={text.orderLabel(pkg.name[l])}
                onClick={event => {
                  if (openTelegramLink(agentPackageOrderUrl(pkg)))
                    event.preventDefault()
                }}
              >
                {text.order} →
              </a>
              {tryable ? (
                <Link
                  className="package-card__try"
                  to={`/agents/${tryable}/work`}
                  aria-label={text.tryLabel(pkg.name[l])}
                >
                  {text.tryFirst}
                </Link>
              ) : null}
            </div>
            {tryable ? (
              <p className="package-card__try-note">{tryNote}</p>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

import { Link } from 'react-router-dom'
import {
  AGENT_PACKAGES,
  agentPackageOrderUrl,
  agentPackageStars,
  tryableAgentOf,
} from '../../../../packages/vibee-atoms/src/agent-packages'
import {
  monthTokens,
  reelsIn,
} from '../../../../packages/vibee-atoms/src/token-wallet'
import type { Language } from '@/hooks/useLanguage'
import { openTelegramLink } from '@/lib/telegram'
import { useAgentPackagePurchase } from '@/hooks/useAgentPackagePurchase'
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
    buy: (stars: string) => `Buy for ${stars} ⭐`,
    buyLabel: (name: string, stars: string, usd: number) =>
      `Buy ${name} for ${stars} Telegram Stars, about $${usd}`,
    buyNote: (usd: number, month: string) =>
      `≈ $${usd} · then ${month} ⭐ a month by subscription`,
    order: 'Ask the team first',
    orderLabel: (name: string) => `Ask the team first about ${name}`,
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
    buy: (stars: string) => `Купить за ${stars} ⭐`,
    buyLabel: (name: string, stars: string, usd: number) =>
      `Купить ${name} за ${stars} звёзд Telegram, около $${usd}`,
    buyNote: (usd: number, month: string) =>
      `≈ $${usd} · далее ${month} ⭐ в месяц по подписке`,
    order: 'Сначала спросить команду',
    orderLabel: (name: string) => `Сначала спросить команду: ${name}`,
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
 * "Buy" pays in Telegram Stars (useAgentPackagePurchase): the launch first,
 * then the monthly subscription; the render books the charge from its own
 * Stars ledger and the bot tells the team, who set the agent's bot up.
 * "Ask the team first" opens the bot with `agentpkg_<id>` for anyone who
 * wants to talk before paying, or who is outside Telegram.
 */
export function PackageCards({
  lang,
  onAction,
}: {
  lang: Language
  /**
   * Told which button was pressed on which package. The welcome screen
   * counts it for its heatmap; the market page passes nothing.
   */
  onAction?: (action: 'buy' | 'order' | 'try', packageId: string) => void
}) {
  const l = lang === 'ru' ? 'ru' : 'en'
  const text = copy[l]
  const purchase = useAgentPackagePurchase(l)
  const locale = l === 'ru' ? 'ru-RU' : 'en-US'
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
        const stars = agentPackageStars(pkg)
        const setupStars = stars.setup.toLocaleString(locale)
        const note = purchase.noteFor(pkg.id)
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
              <button
                type="button"
                className="package-card__buy"
                aria-label={text.buyLabel(
                  pkg.name[l],
                  setupStars,
                  pkg.setupUsd
                )}
                disabled={purchase.busy !== null}
                aria-busy={purchase.busy === pkg.id}
                onClick={() => {
                  onAction?.('buy', pkg.id)
                  void purchase.buy(pkg.id)
                }}
              >
                {text.buy(setupStars)}
              </button>
              <p className="package-card__buy-note">
                {text.buyNote(pkg.setupUsd, stars.month.toLocaleString(locale))}
              </p>
              {note ? (
                <p className="package-card__pay-note" role="status">
                  {note}
                </p>
              ) : null}
              <a
                className="package-card__order"
                href={agentPackageOrderUrl(pkg)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={text.orderLabel(pkg.name[l])}
                onClick={event => {
                  onAction?.('order', pkg.id)
                  if (openTelegramLink(agentPackageOrderUrl(pkg)))
                    event.preventDefault()
                }}
              >
                {text.order}
              </a>
              {tryable ? (
                <Link
                  className="package-card__try"
                  to={`/agents/${tryable}/work`}
                  aria-label={text.tryLabel(pkg.name[l])}
                  onClick={() => onAction?.('try', pkg.id)}
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

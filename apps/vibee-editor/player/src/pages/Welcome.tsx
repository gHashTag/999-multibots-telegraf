import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'
import {
  AGENT_PACKAGES,
  agentPackageOrderUrl,
  tryableAgentOf,
} from '../../../packages/vibee-atoms/src/agent-packages'
import {
  MONTH_DAYS,
  monthTokens,
  PORTRAIT_TOKENS,
  REEL_TOKENS,
  reelsIn,
  START_TOKENS,
  WARN_DAYS_FIRST,
} from '../../../packages/vibee-atoms/src/token-wallet'
import { useLanguage, type Language } from '@/hooks/useLanguage'
import { useAgentAvatars } from '@/hooks/useAgentAvatars'
import { useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import { AgentFace } from '@/components/Chat/AgentFace'
import { PackageCards } from '@/components/Agents/PackageCards'
import { VerdictLine } from '@/components/Agents/VerdictLine'
import { CheckedTools } from '@/components/Agents/CheckedTools'
import { tryFreeNote } from '@/components/Agents/tryFree'
import { markWelcomed } from '@/lib/welcomeMemory'
import { openTelegramLink } from '@/lib/telegram'
import './Welcome.css'

const copy = {
  en: {
    eyebrow: 'T27 · AGENT MARKET',
    title: 'Hire an AI agent that lives in its own Telegram bot.',
    outcome: (agent: string, reels: number) =>
      `${agent}: ≈${reels} reels with your face, every month.`,
    lead: 'Hire an outcome, not a chat. Every agent you hire gets a bot of its own and works for you around the clock.',
    points: [
      [
        'Its own bot',
        'Every agent you order gets a separate Telegram bot in your name; the team sets it up.',
      ],
      [
        'Your face and voice',
        'From the Blogger Agent up: reels with a clone of your own face and voice, not a stock avatar.',
      ],
      [
        'Work with receipts',
        "Each live agent's card below says what proves its work; a job without live receipts is not done.",
      ],
    ],
    working: 'Working now',
    open: 'Details',
    talk: 'Talk to the agent',
    talkLabel: (name: string) => `Talk to the agent: ${name}, free`,
    proof: 'What proves the job',
    gift: 'Your first step: a gift',
    giftTitle: (tokens: number) => `${tokens} tokens to try, on us`,
    giftBody: (cost: number) =>
      `Enough for a story portrait drawn from your own face (${cost} tokens). Send the agent a photo of yourself and ask for one.`,
    giftCta: 'Get my portrait',
    giftShort: (tokens: number) => `Get my portrait · ${tokens} tokens free`,
    giftLabel: (name: string) => `Get my portrait from ${name}`,
    packages: 'Agents to order',
    packagesLead:
      'Launch price includes the first month; the team sets the bot up for you.',
    wallet: 'Where the monthly fee goes',
    walletRows: (perUsd: number, days: number, warn: number) =>
      [
        [
          'All of it becomes tokens',
          `$1 = ${perUsd} tokens, no fee kept back.`,
        ],
        [
          `A month lives ${days} days`,
          `What is not spent burns, so the agent makes content instead of saving it. We remind you ${warn} days before.`,
        ],
      ] as const,
    priceReel: (tokens: number) => `a story reel ≈ ${tokens} tokens`,
    pricePortrait: (tokens: number) =>
      `a portrait from your face = ${tokens} tokens`,
    how: 'What happens after "Order"',
    steps: [
      ['You press "Order"', 'The request goes to the team from the T27 bot.'],
      [
        'The team writes to you',
        'In the same chat: your tasks, your tone, what the agent may do.',
      ],
      [
        'Your bot goes live',
        'The agent is checked on your account first; the invoice comes with it.',
      ],
    ],
    market: 'Go to the Agent Market',
    allAgents: 'All agents',
    order: (name: string) => `Order: ${name}`,
    later: 'Skip',
    laterLabel: 'Skip the introduction and open the feed',
    lang: 'Русский',
  },
  ru: {
    eyebrow: 'T27 · РЫНОК АГЕНТОВ',
    title: 'Наймите ИИ-агента со своим Telegram-ботом.',
    outcome: (agent: string, reels: number) =>
      `${agent}: ≈${reels} рилсов с вашим лицом каждый месяц.`,
    lead: 'Нанимайте результат, а не чат. Каждый нанятый агент получает своего бота и работает на вас круглосуточно.',
    points: [
      [
        'Свой бот',
        'Каждый заказанный агент получает отдельного Telegram-бота на ваше имя; настраивает команда.',
      ],
      [
        'Ваше лицо и голос',
        'Начиная с «Агента-блогера»: рилсы с клоном вашего лица и голоса, а не стоковый аватар.',
      ],
      [
        'Работа с доказательствами',
        'На карточке живого агента ниже написано, чем подтверждается его работа; без живых подтверждений задача не закрыта.',
      ],
    ],
    working: 'Уже работают',
    open: 'Подробнее',
    talk: 'Написать агенту',
    talkLabel: (name: string) => `Написать агенту: ${name}, бесплатно`,
    proof: 'Чем подтверждается работа',
    gift: 'Первый шаг: подарок',
    giftTitle: (tokens: number) => `${tokens} токенов на пробу — от нас`,
    giftBody: (cost: number) =>
      `Хватит на портрет-сторис с вашим лицом (${cost} токенов). Пришлите агенту своё фото и попросите портрет.`,
    giftCta: 'Получить портрет',
    giftShort: (tokens: number) =>
      `Получить портрет · ${tokens} токенов в подарок`,
    giftLabel: (name: string) => `Получить портрет: ${name}`,
    packages: 'Агенты на заказ',
    packagesLead:
      'В цену запуска входит первый месяц; бота настраивает команда.',
    wallet: 'Куда идёт абонентка',
    walletRows: (perUsd: number, days: number, warn: number) =>
      [
        ['Вся — в токены', `$1 = ${perUsd} токенов, ничего не удерживаем.`],
        [
          `Месяц живёт ${days} дней`,
          `Что не потрачено — сгорает: агент делает контент, а не копит. Напомним за ${warn} дней.`,
        ],
      ] as const,
    priceReel: (tokens: number) => `рилс-история ≈ ${tokens} токенов`,
    pricePortrait: (tokens: number) =>
      `портрет с вашим лицом = ${tokens} токенов`,
    how: 'Что будет после «Заказать»',
    steps: [
      ['Вы жмёте «Заказать»', 'Заявка уходит команде через бота T27.'],
      [
        'Команда пишет вам',
        'В том же чате: ваши задачи, ваш тон, что агенту можно делать.',
      ],
      [
        'Ваш бот начинает работать',
        'Сначала агента проверяют на вашем аккаунте, вместе с этим приходит счёт.',
      ],
    ],
    market: 'Перейти на рынок агентов',
    allAgents: 'Все агенты',
    order: (name: string) => `Заказать: ${name}`,
    later: 'Пропустить',
    laterLabel: 'Пропустить знакомство и открыть ленту',
    lang: 'English',
  },
} as const

/**
 * THE FIRST SCREEN OF A FIRST LAUNCH (owner, 2026-09-30: "a welcome screen
 * right when the app opens"). LaunchRedirect sends a person here once; the
 * flag is set as soon as the screen is shown, so a reload, a return from the
 * bot or a closed app never brings it back uninvited. There is no start
 * parameter for it on purpose: a new one has to land in three mirrored route
 * tables at once (appLinksParity.test.ts), and nothing sends people back here.
 *
 * Nothing here is invented: the working agents are the live ones from the
 * market catalogue, the packages come from the one package catalogue.
 *
 * The three points are claims, and each is held to the catalogue it rests on
 * (welcome-claims.test.ts). They used to speak of "each agent" in the present
 * tense -- "answers from a Telegram bot of its own" -- while the one live
 * agent has no bot at all (no `bot` in agent-marketplace.ts): the own bot is
 * what an ORDERED agent gets, and the face-and-voice clone starts at the
 * Blogger package, not at Manager.
 */
export function WelcomePage() {
  const { lang, setLang } = useLanguage()
  const l: Language = lang === 'ru' ? 'ru' : 'en'
  const text = copy[l]
  const faces = useAgentAvatars()
  const verdicts = useAgentAcceptance()
  const working = MARKETPLACE_AGENTS.filter(agent => agent.status === 'live')
  /*
   * THE LADDER. Promise (what a month buys), proof (the live agent and its
   * check), a gift (the start tokens, spent on the person's own face), how
   * ordering works, then the packages in tokens and results. Every number
   * on the way comes from specs/automation/token-wallet.t27.
   */
  const featured = AGENT_PACKAGES.find(pkg => pkg.popular) ?? AGENT_PACKAGES[0]
  const giftAgent = tryableAgentOf(featured)
  const giftAgentName = MARKETPLACE_AGENTS.find(a => a.id === giftAgent)?.name[
    l
  ]
  const featuredReels = reelsIn(monthTokens(featured.monthlyUsd))
  const packagesRef = useRef<HTMLElement>(null)
  const [atPackages, setAtPackages] = useState(false)

  useEffect(() => {
    markWelcomed()
  }, [])

  /*
   * THE PINNED BUTTON FOLLOWS THE LADDER: above the packages it offers the
   * gift (the free step), from the packages on it orders the featured one.
   * Without IntersectionObserver (old webviews, jsdom) it stays on the gift.
   */
  useEffect(() => {
    const el = packagesRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    // The bottom 40% of the screen does not count: the pinned bar covers
    // part of it, and a heading peeking out under the bar is not "in view".
    const seen = new IntersectionObserver(
      ([entry]) => {
        setAtPackages(entry.isIntersecting || entry.boundingClientRect.top < 0)
      },
      { rootMargin: '0px 0px -40% 0px' }
    )
    seen.observe(el)
    return () => seen.disconnect()
  }, [])

  return (
    <div className="welcome-page">
      <main className="welcome-main" id="main-content">
        <header className="welcome-hero">
          <div className="welcome-topline">
            <p className="welcome-eyebrow">{text.eyebrow}</p>
            {/*
             * A way out on the first screen. The page is several screens
             * tall on a phone; somebody who came for the feed should not
             * have to scroll past the whole pitch to leave it.
             */}
            <Link
              className="welcome-skip"
              to="/feed"
              aria-label={text.laterLabel}
            >
              {text.later}
            </Link>
            <button
              type="button"
              className="welcome-lang"
              lang={l === 'ru' ? 'en' : 'ru'}
              onClick={() => setLang(l === 'ru' ? 'en' : 'ru')}
            >
              {text.lang}
            </button>
          </div>
          <h1>{text.title}</h1>
          <p className="welcome-outcome">
            {text.outcome(featured.name[l], featuredReels)}
          </p>
          <p className="welcome-lead">{text.lead}</p>
          <ul className="welcome-points">
            {text.points.map(([title, body]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </header>

        {working.length > 0 ? (
          <section
            className="welcome-working"
            aria-labelledby="welcome-working-title"
          >
            <h2 className="welcome-section-title" id="welcome-working-title">
              {text.working}
            </h2>
            {working.map(agent => (
              <div key={agent.id} className="welcome-agent-card">
                <Link className="welcome-agent" to={`/agents/${agent.id}`}>
                  <AgentFace
                    className="welcome-agent__face"
                    icon={agent.icon}
                    url={faces[agent.id]}
                  />
                  <span className="welcome-agent__text">
                    <strong>{agent.name[l]}</strong>
                    <span>{agent.role[l]}</span>
                  </span>
                  <span className="welcome-agent__open">
                    {text.open} <span aria-hidden="true">→</span>
                  </span>
                </Link>
                {/*
                 * The third point promises that a live agent's card says
                 * what proves its work. This is that card, so the proof is
                 * on it -- outside the link, so the link's name stays short.
                 */}
                {agent.evidence.length > 0 ? (
                  <div className="welcome-agent__proof">
                    {/*
                     * What was MEASURED above what is promised: the newest
                     * daily acceptance run, in the same words as the market
                     * card (verdictLine). A failure and a stale check are
                     * said plainly; no answer shows nothing, never "not
                     * checked".
                     */}
                    {verdicts?.[agent.id] ? (
                      <>
                        <VerdictLine
                          className="welcome-agent__checked"
                          verdict={verdicts[agent.id]}
                          lang={l}
                          withStreak
                        />
                        <CheckedTools
                          className="welcome-agent__calls"
                          verdict={verdicts[agent.id]}
                          lang={l}
                        />
                      </>
                    ) : null}
                    <h3 id={`welcome-proof-${agent.id}`}>{text.proof}</h3>
                    <ul aria-labelledby={`welcome-proof-${agent.id}`}>
                      {agent.evidence.map(item => (
                        <li key={item.en}>{item[l]}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {/*
                 * THE SHORTEST WAY TO A FIRST ANSWER. The card's own link
                 * opens the agent's dashboard (details, checks); talking to
                 * it used to wait two sections down, on a package card.
                 * Competitors put "Chat with Ava" (Artisan) or "Try for
                 * free" with its condition (Lindy) at the first mention of
                 * the agent -- so does this, with what it costs under it.
                 */}
                <div className="welcome-agent__try">
                  <Link
                    className="welcome-agent__talk"
                    to={`/agents/${agent.id}/work`}
                    aria-label={text.talkLabel(agent.name[l])}
                  >
                    {text.talk} <span aria-hidden="true">→</span>
                  </Link>
                  <p>{tryFreeNote(l)}</p>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {giftAgent && giftAgentName ? (
          <section
            className="welcome-gift"
            aria-labelledby="welcome-gift-title"
          >
            <h2 className="welcome-section-title" id="welcome-gift-title">
              {text.gift}
            </h2>
            <p className="welcome-gift__title">
              {text.giftTitle(START_TOKENS)}
            </p>
            <p className="welcome-gift__body">
              {text.giftBody(PORTRAIT_TOKENS)}
            </p>
            <Link
              className="welcome-gift__cta"
              to={`/agents/${giftAgent}/work`}
              aria-label={text.giftLabel(giftAgentName)}
            >
              {text.giftCta} <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : null}

        <section className="welcome-how" aria-labelledby="welcome-how-title">
          <h2 className="welcome-section-title" id="welcome-how-title">
            {text.how}
          </h2>
          <ol className="welcome-steps">
            {text.steps.map(([title, body]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section
          ref={packagesRef}
          className="welcome-packages"
          aria-labelledby="welcome-packages-title"
        >
          <h2 className="welcome-section-title" id="welcome-packages-title">
            {text.packages}
          </h2>
          <p className="welcome-packages__lead">{text.packagesLead}</p>
          <div className="welcome-wallet">
            <h3>{text.wallet}</h3>
            <dl>
              {text
                .walletRows(monthTokens(1), MONTH_DAYS, WARN_DAYS_FIRST)
                .map(([term, detail]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{detail}</dd>
                  </div>
                ))}
            </dl>
            <p className="welcome-wallet__prices">
              {text.priceReel(REEL_TOKENS)} ·{' '}
              {text.pricePortrait(PORTRAIT_TOKENS)}
            </p>
          </div>
          <PackageCards lang={l} />
        </section>

        {/* Pinned to the bottom, so the one main action is always in reach. */}
        <nav className="welcome-exits">
          {atPackages ? (
            <a
              className="welcome-exit welcome-exit--primary"
              data-stage="order"
              href={agentPackageOrderUrl(featured)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={event => {
                if (openTelegramLink(agentPackageOrderUrl(featured)))
                  event.preventDefault()
              }}
            >
              {text.order(featured.name[l])} <span aria-hidden="true">→</span>
            </a>
          ) : giftAgent ? (
            <Link
              className="welcome-exit welcome-exit--primary"
              data-stage="gift"
              to={`/agents/${giftAgent}/work`}
            >
              {text.giftShort(START_TOKENS)} <span aria-hidden="true">→</span>
            </Link>
          ) : null}
          <Link className="welcome-exit welcome-exit--quiet" to="/agents">
            {giftAgent || atPackages ? text.allAgents : text.market}{' '}
            <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </main>
    </div>
  )
}

export default WelcomePage

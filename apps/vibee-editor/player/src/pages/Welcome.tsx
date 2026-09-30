import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'
import { useLanguage, type Language } from '@/hooks/useLanguage'
import { useAgentAvatars } from '@/hooks/useAgentAvatars'
import { AgentFace } from '@/components/Chat/AgentFace'
import { PackageCards } from '@/components/Agents/PackageCards'
import { markWelcomed } from '@/lib/welcomeMemory'
import './Welcome.css'

const copy = {
  en: {
    eyebrow: 'T27 · AGENT MARKET',
    title: 'Hire an AI agent that lives in its own Telegram bot.',
    lead: 'Hire an outcome, not a chat. Every agent is a separate bot that works for you around the clock.',
    points: [
      ['Its own bot', 'Each agent answers from a Telegram bot of its own.'],
      [
        'Your face and voice',
        'Reels and replies with your clone, not a stock avatar.',
      ],
      [
        'Work with receipts',
        'Live agents are checked on a real account; the result is on the card.',
      ],
    ],
    working: 'Working now',
    open: 'Open',
    packages: 'Agents to order',
    packagesLead:
      'Launch price includes the first month; the team sets the bot up for you.',
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
    later: 'Skip',
    laterLabel: 'Skip the introduction and open the feed',
    lang: 'Русский',
  },
  ru: {
    eyebrow: 'T27 · РЫНОК АГЕНТОВ',
    title: 'Наймите ИИ-агента со своим Telegram-ботом.',
    lead: 'Нанимайте результат, а не чат. Каждый агент — отдельный бот, который работает на вас круглосуточно.',
    points: [
      ['Свой бот', 'Каждый агент отвечает из собственного Telegram-бота.'],
      [
        'Ваше лицо и голос',
        'Рилсы и ответы с вашим клоном, а не со стоковым аватаром.',
      ],
      [
        'Работа с доказательствами',
        'Живых агентов проверяют на реальном аккаунте, результат — на карточке.',
      ],
    ],
    working: 'Уже работают',
    open: 'Открыть',
    packages: 'Агенты на заказ',
    packagesLead:
      'В цену запуска входит первый месяц; бота настраивает команда.',
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
 */
export function WelcomePage() {
  const { lang, setLang } = useLanguage()
  const l: Language = lang === 'ru' ? 'ru' : 'en'
  const text = copy[l]
  const faces = useAgentAvatars()
  const working = MARKETPLACE_AGENTS.filter(agent => agent.status === 'live')

  useEffect(() => {
    markWelcomed()
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
              <Link
                key={agent.id}
                className="welcome-agent"
                to={`/agents/${agent.id}`}
              >
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
            ))}
          </section>
        ) : null}

        <section
          className="welcome-packages"
          aria-labelledby="welcome-packages-title"
        >
          <h2 className="welcome-section-title" id="welcome-packages-title">
            {text.packages}
          </h2>
          <p className="welcome-packages__lead">{text.packagesLead}</p>
          <PackageCards lang={l} />
        </section>

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

        {/* Pinned to the bottom, so the one main action is always in reach. */}
        <nav className="welcome-exits">
          <Link className="welcome-exit welcome-exit--primary" to="/agents">
            {text.market} <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </main>
    </div>
  )
}

export default WelcomePage

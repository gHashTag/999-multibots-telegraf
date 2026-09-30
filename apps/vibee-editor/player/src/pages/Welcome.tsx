import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'
import { useLanguage, type Language } from '@/hooks/useLanguage'
import { useAgentAvatars } from '@/hooks/useAgentAvatars'
import { useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import { AgentFace } from '@/components/Chat/AgentFace'
import { PackageCards } from '@/components/Agents/PackageCards'
import { VerdictLine } from '@/components/Agents/VerdictLine'
import { tryFreeNote } from '@/components/Agents/tryFree'
import { markWelcomed } from '@/lib/welcomeMemory'
import './Welcome.css'

const copy = {
  en: {
    eyebrow: 'T27 · AGENT MARKET',
    title: 'Hire an AI agent that lives in its own Telegram bot.',
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
                      <VerdictLine
                        className="welcome-agent__checked"
                        verdict={verdicts[agent.id]}
                        lang={l}
                        withStreak
                      />
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

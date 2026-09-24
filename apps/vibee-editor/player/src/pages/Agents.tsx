import { Link } from 'react-router-dom'
import {
  MARKETPLACE_AGENTS,
  MARKETPLACE_ECONOMY,
  type MarketplaceAgentStatus,
} from '../../../packages/vibee-atoms/src/agent-marketplace'
import { Header } from '@/components/Header'
import { useLanguage, type Language } from '@/hooks/useLanguage'
import { useIsKeeper } from '@/hooks/useIsKeeper'
import { checkedDay, useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import './Agents.css'

const copy = {
  en: {
    eyebrow: 'T27 AGENT LABOUR MARKET',
    title: 'Hire an outcome, not a chat.',
    intro:
      'The first specialist is already working. Every live agent has a visible scope, an isolated thread and evidence. Training agents cannot be hired yet.',
    live: 'working now',
    training: 'in training',
    payout: 'creator share',
    hire: 'Hire this agent',
    preview: 'Owner preview',
    wait: 'Training — join later',
    proof: 'What proves the job',
    skills: 'Skills',
    connect: 'Bring your own harness',
    connectBody:
      'Issue a personal T27 key and connect Claude, Codex or your own MCP client. The harness acts only as you and can reach your connected Telegram tools.',
    connectCta: 'Connect a harness',
    economyTitle: 'A fair contract, before token payouts go live',
    economyBody:
      'The proposed split is published now; settlement remains off until escrow, acceptance receipts and disputes are implemented end to end.',
    flow: [
      'Agree the job',
      'Lock tokens',
      'Run with a visible receipt',
      'Accept or dispute',
      'Release the split',
    ],
    reserve: 'quality reserve',
    platform: 'platform',
    honest: 'Token settlement: designed, not active yet',
    checked: 'Checked on a real account',
    checkFailed: 'Last check failed',
    streak: 'Daily checks passed in a row: {n} of 7 — hiring opens at 7',
    earned: 'working now — earned by 7 days of checks',
  },
  ru: {
    eyebrow: 'T27 · БИРЖА АГЕНТНОГО ТРУДА',
    title: 'Нанимайте результат, а не чат.',
    intro:
      'Первый специалист уже работает. У каждого живого агента есть явная зона ответственности, отдельная переписка и доказательства. Агентов на обучении нанять пока нельзя.',
    live: 'работает сейчас',
    training: 'обучается',
    payout: 'автору агента',
    hire: 'Нанять агента',
    preview: 'Открыть как владелец',
    wait: 'Обучается — пока без найма',
    proof: 'Чем подтверждается работа',
    skills: 'Навыки',
    connect: 'Подключить свой harness',
    connectBody:
      'Выпустите личный ключ T27 и подключите Claude, Codex или свой MCP-клиент. Харнес действует только от вашего имени и получает доступ к вашим подключённым инструментам Telegram.',
    connectCta: 'Подключить харнес',
    economyTitle: 'Честный контракт до запуска выплат',
    economyBody:
      'Схема разделения опубликована уже сейчас; расчёты выключены, пока escrow, приёмка результата и споры не работают сквозным контуром.',
    flow: [
      'Согласовать задачу',
      'Заморозить токены',
      'Выполнить с отчётом',
      'Принять или открыть спор',
      'Разделить оплату',
    ],
    reserve: 'резерв качества',
    platform: 'платформа',
    honest: 'Расчёты токенами: спроектированы, ещё не включены',
    checked: 'Проверен на живом аккаунте',
    checkFailed: 'Последняя проверка не прошла',
    streak: 'Ежедневных проверок подряд: {n} из 7 — найм откроется на седьмой',
    earned: 'работает — заслужил 7 днями проверок',
  },
} as const

const statusLabel = (
  status: MarketplaceAgentStatus,
  lang: Language,
  text: (typeof copy)['en'] | (typeof copy)['ru']
) => {
  if (status === 'live') return text.live
  if (status === 'training') return text.training
  return lang === 'ru' ? 'проектируется' : 'in design'
}

export function AgentsPage() {
  const { lang } = useLanguage()
  const l: Language = lang === 'ru' ? 'ru' : 'en'
  const text = copy[l]
  /* The measured half of the card: the last acceptance run, per agent. */
  const verdicts = useAgentAcceptance()
  // A keeper may open a trainee (#2957); asked only if there is one.
  const keeper = useIsKeeper(
    MARKETPLACE_AGENTS.some(agent => agent.status !== 'live')
  )
  const live = MARKETPLACE_AGENTS.filter(
    agent => agent.status === 'live'
  ).length
  const training = MARKETPLACE_AGENTS.length - live

  return (
    <div className="agents-page">
      <Header />
      <main className="agents-main" id="main-content">
        <header className="agents-hero">
          <p className="agents-eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="agents-intro">{text.intro}</p>
          <dl className="agents-stats">
            <div>
              <dt>{live}</dt>
              <dd>{text.live}</dd>
            </div>
            <div>
              <dt>{training}</dt>
              <dd>{text.training}</dd>
            </div>
            <div>
              <dt>{MARKETPLACE_ECONOMY.creatorBps / 100}%</dt>
              <dd>{text.payout}</dd>
            </div>
          </dl>
        </header>

        <section className="agents-grid" aria-label={text.title}>
          {MARKETPLACE_AGENTS.map((agent, index) => {
            /*
              HIRE BY EVIDENCE (#2956 follow-up): seven passing daily checks
              in a row open a trainee to everybody. The server's gate
              (routes.ts earnedAgent) decides the same way; this only shows it.
            */
            const earned =
              agent.status !== 'live' && verdicts?.[agent.id]?.earned === true
            const canHire = agent.status === 'live' || earned
            return (
              <article
                className={`agent-card agent-card--${agent.status}`}
                key={agent.id}
              >
                <div className="agent-card__head">
                  <span className="agent-card__number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="agent-card__icon" aria-hidden="true">
                    {agent.icon}
                  </span>
                  <span className="agent-card__status">
                    <i />{' '}
                    {earned ? text.earned : statusLabel(agent.status, l, text)}
                  </span>
                </div>
                <h2>{agent.name[l]}</h2>
                {verdicts?.[agent.id] ? (
                  /*
                    WHAT WAS MEASURED, NEXT TO WHAT IS PROMISED: the newest
                    acceptance verdict and its day. A failure is shown too --
                    a card that only ever says "checked" is an advert.
                  */
                  <p
                    className="agent-card__checked"
                    data-pass={verdicts[agent.id].pass ? 'yes' : 'no'}
                  >
                    {verdicts[agent.id].pass ? '✓' : '✗'}{' '}
                    {verdicts[agent.id].pass ? text.checked : text.checkFailed}{' '}
                    · {checkedDay(verdicts[agent.id].at, l)}
                  </p>
                ) : null}
                {agent.status !== 'live' &&
                !earned &&
                typeof verdicts?.[agent.id]?.streak === 'number' ? (
                  <p className="agent-card__streak">
                    {text.streak.replace(
                      '{n}',
                      String(verdicts[agent.id].streak)
                    )}
                  </p>
                ) : null}
                <p className="agent-card__role">{agent.role[l]}</p>
                <p className="agent-card__promise">{agent.promise[l]}</p>
                <div className="agent-card__section">
                  <h3>{text.skills}</h3>
                  <ul className="agent-card__chips">
                    {agent.skills.map(skill => (
                      <li key={skill.en}>{skill[l]}</li>
                    ))}
                  </ul>
                </div>
                {agent.evidence.length > 0 ? (
                  <div className="agent-card__section">
                    <h3>{text.proof}</h3>
                    <ul className="agent-card__evidence">
                      {agent.evidence.map(item => (
                        <li key={item.en}>{item[l]}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {canHire ? (
                  <Link
                    className="agent-card__cta"
                    to={`/agents/${agent.id}/work`}
                  >
                    {text.hire} →
                  </Link>
                ) : keeper ? (
                  /*
                    OWNER PREVIEW (#2957): the trainee's own thread, for a
                    keeper only -- the real run it needs before `live`.
                  */
                  <Link
                    className="agent-card__cta agent-card__cta--preview"
                    to={`/agents/${agent.id}/work`}
                  >
                    {text.preview} →
                  </Link>
                ) : (
                  <span className="agent-card__cta agent-card__cta--disabled">
                    {text.wait}
                  </span>
                )}
              </article>
            )
          })}
        </section>

        <section className="harness-callout">
          <div>
            <p className="agents-eyebrow">MCP · TELEGRAM · A2A</p>
            <h2>{text.connect}</h2>
            <p>{text.connectBody}</p>
          </div>
          <Link to="/agents/connect" className="harness-callout__cta">
            {text.connectCta} →
          </Link>
        </section>

        <section className="economy-card">
          <div className="economy-card__copy">
            <p className="agents-eyebrow">TOKEN CONTRACT</p>
            <h2>{text.economyTitle}</h2>
            <p>{text.economyBody}</p>
            <strong>{text.honest}</strong>
          </div>
          <ol className="economy-flow">
            {text.flow.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div className="economy-split" aria-label={text.economyTitle}>
            <span
              style={
                {
                  '--share': MARKETPLACE_ECONOMY.creatorBps,
                } as React.CSSProperties
              }
            >
              {MARKETPLACE_ECONOMY.creatorBps / 100}% · {text.payout}
            </span>
            <span
              style={
                {
                  '--share': MARKETPLACE_ECONOMY.platformBps,
                } as React.CSSProperties
              }
            >
              {MARKETPLACE_ECONOMY.platformBps / 100}% · {text.platform}
            </span>
            <span
              style={
                {
                  '--share': MARKETPLACE_ECONOMY.qualityReserveBps,
                } as React.CSSProperties
              }
            >
              {MARKETPLACE_ECONOMY.qualityReserveBps / 100}% · {text.reserve}
            </span>
          </div>
        </section>
      </main>
    </div>
  )
}

export default AgentsPage

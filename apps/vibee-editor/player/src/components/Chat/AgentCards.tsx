import './AgentCards.css'
import { useLanguage } from '@/hooks/useLanguage'
import type { AgentCard, CardState } from '@/lib/agentCards'

/**
 * THE AGENT'S PROPOSALS, AS CARDS (lib/agentCards.ts).
 *
 * Only the latest answer's open cards can be pressed: an older proposal the
 * conversation has moved past is shown, dimmed, for the record. Approve all
 * appears once there is more than one open card -- the whole point is that
 * steering the agent is a tap, not a paragraph.
 */
export function AgentCards({
  cards,
  states,
  actionable,
  onAnswer,
}: {
  cards: AgentCard[]
  states: CardState[]
  actionable: boolean
  onAnswer: (cards: AgentCard[], approve: boolean) => void
}) {
  const { t } = useLanguage()
  if (cards.length === 0) return null
  /* Approve all is for the steps of a plan, never for alternatives. */
  const openSteps = cards.filter(
    (c, i) => c.kind === 'step' && states[i] === 'open'
  )
  return (
    <div
      className="agent-cards"
      role="group"
      aria-label={t('chat.cards.label')}
    >
      {cards.map((card, i) => {
        const state = states[i]
        const live = actionable && state === 'open'
        return (
          <article
            key={card.title}
            className={`agent-card agent-card--${live ? 'live' : state} agent-card--${card.kind}`}
          >
            <div className="agent-card__body">
              <h3>
                {card.kind === 'step' ? (
                  <span className="agent-card__n">{i + 1}</span>
                ) : null}
                {card.title}
              </h3>
              {card.detail ? <p>{card.detail}</p> : null}
            </div>
            {live ? (
              <div className="agent-card__buttons">
                <button
                  type="button"
                  className="agent-card__no"
                  onClick={() => onAnswer([card], false)}
                >
                  {t('chat.cards.decline')}
                </button>
                <button
                  type="button"
                  className="agent-card__yes"
                  onClick={() => onAnswer([card], true)}
                >
                  {t('chat.cards.approve')}
                </button>
              </div>
            ) : (
              <span className="agent-card__state">
                {state === 'approved'
                  ? t('chat.cards.approved')
                  : state === 'declined'
                    ? t('chat.cards.declined')
                    : t('chat.cards.skipped')}
              </span>
            )}
          </article>
        )
      })}
      {actionable && openSteps.length > 1 ? (
        <button
          type="button"
          className="agent-cards__all"
          onClick={() => onAnswer(openSteps, true)}
        >
          {t('chat.cards.approveAll', { n: openSteps.length })}
        </button>
      ) : null}
    </div>
  )
}

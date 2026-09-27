import { useLanguage } from '@/hooks/useLanguage'
import type { Funnel, Reached } from '@/lib/crm'
import './FunnelStrip.css'

/**
 * THE FUNNEL, ONE LINE AT THE TOP OF THE WORK (`crm_summary`).
 *
 * How many people stand at each stage, in the order a person moves through
 * them. Counted on the server with the same rule as the list, so a chip here
 * is the number `/sweep stage=X` would take.
 *
 * Unreachable, refused, or an answer without stages: NOTHING is drawn. A row
 * of zeros would say the business is empty; a missing strip says nothing
 * false, and the panels below already say when the server is down.
 */
export function FunnelStrip({ state }: { state: Reached<Funnel> }) {
  const { t } = useLanguage()
  const data = state.reachable ? state.data : null
  if (!data || data.stages.length === 0) return null
  const label = (stage: string) => {
    const key = `crm.stage.${stage}`
    const said = t(key)
    // A stage the dictionary does not know yet is shown by its own name.
    return said === key ? stage : said
  }
  return (
    <section
      className="crm-funnel"
      aria-label={t('crm.funnel.title')}
      data-testid="crm-funnel"
    >
      <ol className="crm-funnel__stages">
        {data.stages.map(s => (
          <li
            key={s.stage}
            className={`crm-funnel__chip crm-funnel__chip--${s.stage}`}
            data-stage={s.stage}
          >
            <span className="crm-funnel__name">{label(s.stage)}</span>
            <span className="crm-funnel__count">{s.count}</span>
          </li>
        ))}
      </ol>
      {data.people !== null ? (
        <p className="crm-funnel__people">
          {t('crm.funnel.people', { n: data.people })}
        </p>
      ) : null}
    </section>
  )
}

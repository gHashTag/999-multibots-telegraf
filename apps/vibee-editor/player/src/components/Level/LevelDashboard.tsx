/**
 * THE HEAD OF A LEVEL'S CRM DASHBOARD: whose dashboard this is, and the few
 * places that level goes to first. Which panels follow is decided by
 * CRM_DASHBOARD (packages/vibee-atoms/src/user-level.ts); this card only
 * names it. No level -- the screen as it always was -- draws nothing.
 */
import { Link } from 'react-router-dom'
import { LEVEL_SHORTCUTS, USER_LEVEL_LABEL, type UserLevel } from '@vibee/atoms'
import './Level.css'

const COPY = {
  en: { title: 'Dashboard', testing: 'test view' },
  ru: { title: 'Дашборд', testing: 'тестовый вид' },
} as const

export function LevelDashboard(props: {
  level: UserLevel | null
  switched: boolean
  lang: 'en' | 'ru'
}) {
  if (!props.level) return null
  const copy = COPY[props.lang]
  return (
    <section
      className={`level-dashboard level-dashboard--${props.level}`}
      data-testid="level-dashboard"
      data-level={props.level}
    >
      <p className="level-dashboard__title">
        {copy.title}: {USER_LEVEL_LABEL[props.level][props.lang]}
        {props.switched ? (
          <span className="level-dashboard__testing"> · {copy.testing}</span>
        ) : null}
      </p>
      <nav className="level-dashboard__shortcuts">
        {LEVEL_SHORTCUTS[props.level].map(s => (
          <Link key={s.to} to={s.to} className="level-dashboard__shortcut">
            {s.label[props.lang]}
          </Link>
        ))}
      </nav>
    </section>
  )
}

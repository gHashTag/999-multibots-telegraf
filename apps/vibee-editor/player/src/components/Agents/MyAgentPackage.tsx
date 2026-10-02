/**
 * A PERSON WHO HAS AN AGENT IS NOT SOLD ONE AGAIN.
 *
 * Owner, 2026-10-02: "if the user chose agents, do not show the sales screen
 * again". For someone with a paid package (or an admin testing through a
 * switched level) the packages block on /agents becomes their agent: which
 * one, until when, and the way back into the conversation. The other packages
 * stay one tap away, folded, for an upgrade.
 */
import { Link } from 'react-router-dom'
import { AGENT_PACKAGES, levelOfPackage, type UserLevel } from '@vibee/atoms'
import type { PackageStatus } from '@/hooks/useUserLevel'
import { PackageCards } from './PackageCards'

const COPY = {
  en: {
    yours: 'Your agent',
    until: (d: string) => `Paid until ${d}`,
    chat: 'Open the agent chat',
    crm: 'Clients',
    others: 'Other packages',
  },
  ru: {
    yours: 'Ваш агент',
    until: (d: string) => `Оплачен до ${d}`,
    chat: 'Открыть чат с агентом',
    crm: 'Клиенты',
    others: 'Другие пакеты',
  },
} as const

export function MyAgentPackage(props: {
  level: UserLevel
  packages: PackageStatus[] | null
  lang: 'en' | 'ru'
}) {
  const copy = COPY[props.lang]
  const pkg = AGENT_PACKAGES.find(p => levelOfPackage(p.id) === props.level)
  const row = props.packages?.find(p => p.id === pkg?.id && p.active)
  const until = row?.until
    ? new Date(row.until).toLocaleDateString(
        props.lang === 'ru' ? 'ru-RU' : 'en-GB',
        { day: 'numeric', month: 'long', timeZone: 'UTC' }
      )
    : null

  return (
    <div className="my-agent-package" data-testid="my-agent-package">
      <p className="agents-eyebrow">{copy.yours}</p>
      <h2>{pkg ? pkg.name[props.lang] : copy.yours}</h2>
      {until ? <p>{copy.until(until)}</p> : null}
      <div className="my-agent-package__actions">
        <Link to="/chat" className="agent-card__cta">
          {copy.chat}
        </Link>
        <Link to="/crm" className="agent-card__cta">
          {copy.crm}
        </Link>
      </div>
      <details className="my-agent-package__others">
        <summary>{copy.others}</summary>
        <PackageCards lang={props.lang} />
      </details>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import {
  hireMember,
  loadTeam,
  memberHref,
  splitTitle,
  teamChips,
  type TeamView,
} from '@/lib/team'
import './ChatThreads.css'

/**
 * THE TEAM ROW ABOVE THE CHAT (bot-agent-team.t27, "the same logic in the
 * mini-app"): one circle per member on the person's team, each opening that
 * member's chat -- the same conversation as its tab in the bot -- and a "+"
 * circle for each member not yet hired. Nothing is drawn while the team
 * cannot be read: the chat itself never waits on it.
 */
export function TeamRow({ current }: { current: string | null }) {
  const { t, lang } = useLanguage()
  const navigate = useNavigate()
  const [view, setView] = useState<TeamView | null>(null)
  const [hiring, setHiring] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void loadTeam(lang).then(v => {
      if (live) setView(v)
    })
    return () => {
      live = false
    }
  }, [lang])

  const chips = teamChips(view, current)
  if (chips.length === 0) return null

  const hire = async (kind: string) => {
    setHiring(kind)
    const conversation = await hireMember(kind, lang)
    setHiring(null)
    if (conversation === undefined) return
    setView(await loadTeam(lang))
    navigate(memberHref({ conversation }))
  }

  return (
    <nav className="chat-threads chat-team" aria-label={t('chat.team.label')}>
      {chips.map(({ member, hire: isHire, current: isCurrent }) => {
        const { mark, name } = splitTitle(member.title)
        return isHire ? (
          <button
            key={member.kind}
            type="button"
            className="chat-threads__dot is-hire"
            disabled={hiring !== null}
            title={t('chat.team.hire', { name })}
            onClick={() => void hire(member.kind)}
          >
            <span className="chat-threads__circle" aria-hidden="true">
              {hiring === member.kind ? '…' : mark}
            </span>
            <span className="chat-threads__caption">+ {name}</span>
          </button>
        ) : (
          <Link
            key={member.kind}
            to={memberHref(member)}
            className={`chat-threads__dot is-agent${isCurrent ? ' is-current' : ''}`}
            aria-current={isCurrent ? 'page' : undefined}
          >
            <span className="chat-threads__circle" aria-hidden="true">
              {mark}
            </span>
            <span className="chat-threads__caption">{name}</span>
          </Link>
        )
      })}
    </nav>
  )
}

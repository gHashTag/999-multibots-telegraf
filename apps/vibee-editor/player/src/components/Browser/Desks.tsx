import { useEffect, useState } from 'react'
import './Desks.css'
import { useLanguage } from '@/hooks/useLanguage'
import { readDesks, walkMyAccounts, type Desk } from '@/lib/remoteBrowser'

/**
 * A DESK PER LINE OF WORK (render agent/profiles.ts).
 *
 * Owner, 2026-09-23: "every agent, by its profile, has a personal cabinet
 * laid out for the work that profile does." So the Browser tab shows one
 * card per desk: what it is for, which accounts belong to it, and one button
 * that sends the agent round exactly those and nothing else.
 *
 * The report arrives in the chat, as it does for the cron, so the card only
 * says what happened to the asking.
 */
export function Desks() {
  const { t } = useLanguage()
  const [desks, setDesks] = useState<Desk[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [said, setSaid] = useState<Record<string, 'done' | 'failed'>>({})

  useEffect(() => {
    let stopped = false
    void readDesks().then(list => {
      if (!stopped) setDesks(list)
    })
    return () => {
      stopped = true
    }
  }, [])

  if (!desks.length) return null

  return (
    <section className="desks" aria-label={t('browser.desks')}>
      {desks.map(desk => (
        <article className="desks__card" key={desk.id}>
          <h3 className="desks__name">{desk.name}</h3>
          <p className="desks__about">{desk.about}</p>
          <p className="desks__sites">
            {desk.sites.map(s => s.name).join(' · ')}
          </p>
          <button
            type="button"
            className="desks__go"
            disabled={busy !== null}
            onClick={() => {
              setBusy(desk.id)
              setSaid(was => ({ ...was, [desk.id]: undefined as never }))
              void walkMyAccounts(desk.id).then(answer => {
                setBusy(null)
                setSaid(was => ({
                  ...was,
                  [desk.id]: answer === null ? 'failed' : 'done',
                }))
              })
            }}
          >
            {busy === desk.id ? t('browser.round.going') : t('browser.round')}
          </button>
          {said[desk.id] ? (
            <p className="desks__said" aria-live="polite">
              {t(`browser.round.${said[desk.id]}`)}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  )
}

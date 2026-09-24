import { useEffect, useState } from 'react'
import './Desks.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  readDesks,
  readScenarios,
  runScenario,
  walkMyAccounts,
  type Desk,
  type Scenario,
} from '@/lib/remoteBrowser'

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
  /* The runs the agent can repeat (render agent/scenarios.ts). */
  const [runs, setRuns] = useState<Scenario[]>([])
  const [ran, setRan] = useState<string[] | null>(null)

  useEffect(() => {
    let stopped = false
    void readDesks().then(list => {
      if (!stopped) setDesks(list)
    })
    void readScenarios().then(list => {
      if (!stopped) setRuns(list)
    })
    return () => {
      stopped = true
    }
  }, [])

  if (!desks.length) return null

  return (
    <section className="desks" aria-label={t('browser.desks')}>
      {/*
       * All desks at once, each in its own window, tiled (render
       * browser/windows.ts). This is what the cron does too.
       */}
      <article className="desks__card desks__card--all">
        <h3 className="desks__name">{t('browser.desks.all')}</h3>
        <p className="desks__about">{t('browser.desks.allAbout')}</p>
        <button
          type="button"
          className="desks__go"
          disabled={busy !== null}
          onClick={() => {
            setBusy('all')
            void walkMyAccounts().then(answer => {
              setBusy(null)
              setSaid(was => ({
                ...was,
                all: answer === null ? 'failed' : 'done',
              }))
            })
          }}
        >
          {busy === 'all' ? t('browser.round.going') : t('browser.round')}
        </button>
        {said.all ? (
          <p className="desks__said" aria-live="polite">
            {t(`browser.round.${said.all}`)}
          </p>
        ) : null}
      </article>
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
      {runs.length ? (
        <article className="desks__card">
          <h3 className="desks__name">{t('browser.runs')}</h3>
          <p className="desks__about">{t('browser.runs.about')}</p>
          {runs.map(run => (
            <button
              key={run.id}
              type="button"
              className="desks__go desks__run"
              title={run.steps.join(' → ')}
              disabled={busy !== null}
              onClick={() => {
                setBusy(run.id)
                setRan(null)
                void runScenario(run.id).then(lines => {
                  setBusy(null)
                  setRan(lines ?? [t('browser.round.failed')])
                })
              }}
            >
              {busy === run.id ? t('browser.round.going') : run.name}
            </button>
          ))}
          {ran ? (
            <ol className="desks__ran" aria-live="polite">
              {ran.map((line, i) => (
                <li key={`${line}:${i}`}>{line}</li>
              ))}
            </ol>
          ) : null}
        </article>
      ) : null}
    </section>
  )
}

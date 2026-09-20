import { useCallback, useEffect, useRef, useState } from 'react'
import { useAtom } from 'jotai'
import './Browser.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  readBrowserSession,
  openBrowserSession,
  absoluteViewUrl,
  canEmbed,
  fitBrowserScreen,
  type BrowserSessionView,
} from '@/lib/remoteBrowser'
import {
  askFor,
  worthRefitting,
  REFIT_DEBOUNCE_MS,
  type Box,
} from '@/lib/browserFit'
import { BROWSER_BUTTONS, tapWipe } from '@/lib/remoteBrowserUi'
import { agentWorkingAtom } from '@/atoms/agentWorking'
import {
  wentOut,
  wheelAfterTouch,
  wheelAfterHandBack,
  type Wheel,
} from '@/lib/browserWatch'

/**
 * THE PERSON'S OWN BROWSER, ON A SCREEN.
 *
 * One pod, one profile, started when they ask and stopped when they say so.
 * Three things on this screen are deliberate:
 *
 * 1. IT SAYS WHO SIGNS IN. The whole design rests on the person signing into
 *    their own accounts themselves, inside the stream, so no password ever
 *    reaches us or the agent. If the screen does not say that, the first
 *    question will be "where do I put my password" -- and the answer must
 *    never be "in the chat".
 *
 * 2. TWO DIFFERENT BUTTONS, NOT ONE. Closing keeps the logins; forgetting
 *    wipes them. A single button would either lose the logins every time or
 *    quietly keep the cookies when somebody asked to be forgotten.
 *
 * 3. IT OPENS TOP-LEVEL WHEN IT MUST. The session cookie is `SameSite=Lax`
 *    and this app is a different origin from the render server, so a frame
 *    here would load and then be refused -- and Telegram on iOS blocks
 *    third-party cookies outright, so loosening the cookie would not help.
 *    `canEmbed` decides, and it starts returning true by itself once the app
 *    proxies `/live/` under its own origin.
 */
export default function BrowserPage() {
  const { t } = useLanguage()
  const [view, setView] = useState<BrowserSessionView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmForget, setConfirmForget] = useState(false)
  const [agentWorking, setAgentWorking] = useAtom(agentWorkingAtom)
  /* Remembers a browser that was here, so its absence can be explained. */
  const lastState = useRef<BrowserSessionView['state'] | null>(null)
  const [explainGone, setExplainGone] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)
  /* The last shape we asked the pod for, so a scroll does not ask again. */
  const fitted = useRef<Box | null>(null)

  const act = useCallback(async (fn: () => Promise<BrowserSessionView>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await fn()
      /* It did not forget them; say so rather than show an empty screen. */
      setExplainGone(wentOut(lastState.current, next.state))
      lastState.current = next.state
      setView(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void act(readBrowserSession)
  }, [act])

  /*
   * THE DESKTOP IS MADE THE SHAPE OF THIS BOX.
   *
   * The stylesheet has already decided how big the picture is on this device;
   * this measures that decision and asks the pod to match it, so a phone held
   * upright gets a tall desktop instead of a landscape one shrunk into a
   * stamp. It runs when the browser goes live, and again when the window
   * changes shape -- a rotation, a split screen, a desktop window dragged.
   */
  useEffect(() => {
    if (view?.state !== 'live') return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const measureAndFit = () => {
      const el = stage.current
      if (!el || stopped) return
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const want = askFor({ width: rect.width, height: rect.height })
      if (!worthRefitting(fitted.current, want)) return
      fitted.current = want
      /* A pod that will not resize is still a pod; the person keeps watching. */
      void fitBrowserScreen(want)
    }

    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(measureAndFit, REFIT_DEBOUNCE_MS)
    }

    measureAndFit()
    window.addEventListener('resize', later)
    window.addEventListener('orientationchange', later)
    return () => {
      stopped = true
      clearTimeout(timer)
      window.removeEventListener('resize', later)
      window.removeEventListener('orientationchange', later)
    }
  }, [view?.state])

  const state = view?.state ?? 'none'
  const live = state === 'live' && Boolean(view?.viewUrl)
  const embedded = live && canEmbed(view!.viewUrl!)

  return (
    <div
      className={
        live && embedded
          ? 'remote-browser remote-browser--live'
          : 'remote-browser'
      }
    >
      <header className="remote-browser__head">
        <h1>{t('browser.title')}</h1>
        <p className="remote-browser__lead">{t('browser.lead')}</p>
      </header>

      {view === null && !error ? (
        <p className="remote-browser__muted">{t('browser.loading')}</p>
      ) : null}

      {/* It did not forget them: the profile is where they left it. */}
      {explainGone ? (
        <p className="remote-browser__notice">{t('browser.wentOut')}</p>
      ) : null}

      {state === 'unavailable' ? (
        <p className="remote-browser__notice">{t('browser.unavailable')}</p>
      ) : null}

      {/* Not an error: the ordinary state of somebody who has not signed in. */}
      {state === 'signin' ? (
        <p className="remote-browser__notice">{t('browser.signInFirst')}</p>
      ) : null}

      {error ? (
        <p className="remote-browser__error" role="alert">
          {error}
        </p>
      ) : null}

      {state === 'none' && view !== null ? (
        <section className="remote-browser__start">
          {/* The promise, before the button, not after it. */}
          <p className="remote-browser__promise">{t('browser.youSignIn')}</p>
          <button
            type="button"
            className="remote-browser__cta"
            disabled={busy}
            onClick={() => void act(openBrowserSession)}
          >
            {busy ? t('browser.opening') : t('browser.open')}
          </button>
          <p className="remote-browser__muted">{t('browser.startsIn')}</p>
        </section>
      ) : null}

      {live ? (
        <section className="remote-browser__live">
          {embedded ? (
            /*
             * The glow says an agent is working in here. It stops the moment
             * the person touches the frame: from then on THEY are driving,
             * and a screen that kept claiming otherwise would be lying.
             */
            <div
              ref={stage}
              className={
                agentWorking
                  ? 'remote-browser__stage remote-browser__stage--working'
                  : 'remote-browser__stage'
              }
              onPointerDown={() =>
                setAgentWorking(wheelAfterTouch() === 'agent')
              }
              onKeyDownCapture={() =>
                setAgentWorking(wheelAfterTouch() === 'agent')
              }
            >
              <p className="remote-browser__working" aria-live="polite">
                {agentWorking
                  ? t('browser.agentWorking')
                  : t('browser.youDrive')}
              </p>
              <iframe
                className="remote-browser__frame"
                src={absoluteViewUrl(view!.viewUrl!)}
                title={t('browser.title')}
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            </div>
          ) : (
            <div className="remote-browser__elsewhere">
              <a
                className="remote-browser__cta"
                href={absoluteViewUrl(view!.viewUrl!)}
                target="_blank"
                rel="noreferrer"
              >
                {t('browser.openTab')}
              </a>
              <p className="remote-browser__muted">{t('browser.whyTab')}</p>
            </div>
          )}

          <div className="remote-browser__actions">
            {/* A phone in portrait shows the stream as a stamp otherwise. */}
            <button
              type="button"
              className="remote-browser__secondary"
              onClick={() => void stage.current?.requestFullscreen?.()}
            >
              {t('browser.fullscreen')}
            </button>

            {/* Handing the wheel back is a press, never a timeout. */}
            {!agentWorking ? (
              <button
                type="button"
                className="remote-browser__secondary"
                onClick={() =>
                  setAgentWorking(wheelAfterHandBack() === 'agent')
                }
              >
                {t('browser.handBack')}
              </button>
            ) : null}

            <button
              type="button"
              className="remote-browser__secondary"
              disabled={busy}
              onClick={() => void act(BROWSER_BUTTONS.close)}
            >
              {t('browser.close')}
            </button>

            {/* Irreversible, so it asks once. */}
            <button
              type="button"
              className="remote-browser__danger"
              disabled={busy}
              onClick={() => {
                const step = tapWipe(confirmForget)
                setConfirmForget(step.confirming)
                if (step.wipeNow) void act(BROWSER_BUTTONS.forget)
              }}
            >
              {confirmForget ? t('browser.forget.sure') : t('browser.forget')}
            </button>
          </div>
          <p className="remote-browser__muted">{t('browser.closeKeeps')}</p>
        </section>
      ) : null}
    </div>
  )
}

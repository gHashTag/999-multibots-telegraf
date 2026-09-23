import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAtom } from 'jotai'
import './Browser.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  readBrowserSession,
  openBrowserSession,
  absoluteViewUrl,
  canEmbed,
  fitBrowserScreen,
  setBrowserWheel,
  type BrowserSessionView,
  type InputRequestView,
  type PendingApproval,
  readPendingApproval,
  isPressedAsk,
  walkMyAccounts,
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
  shouldRenewWheel,
  type Wheel,
} from '@/lib/browserWatch'
import { listenForTouchInside } from '@/lib/frameTouch'
import { Desks } from '@/components/Browser/Desks'
import { ImportLogins } from '@/components/Browser/ImportLogins'
import { TypeSheet } from '@/components/Browser/TypeSheet'
import { DetentSheet } from '@/components/DetentSheet/DetentSheet'
import { PEEK_PX, ISLAND_PX, type Detent } from '@/lib/sheetDetents'
import { browserLayout, CLASSIC_VIEW } from '@/lib/browserLayout'
import { PHONE_MAX } from '@/lib/browserFit'
import {
  BrowserKeys,
  AskedPermission,
  AskedChoice,
} from '@/components/Browser/BrowserKeys'
import { isBrowserPath } from '@/lib/keptBrowser'
import { frameStateOf, shouldReread, touchReportOf } from '@/lib/frameState'
import { reportClientError } from '@/lib/clientErrorBeacon'
import {
  readBrowserJournal,
  journalLine,
  foldRepeats,
  JOURNAL_POLL_MS,
  type JournalStep,
} from '@/lib/browserJournal'
import { BrandLoader } from '@/components/BrandLoader/BrandLoader'
import { sendToAgent, isAgentBusy } from '@/lib/agentStream'
import { shouldWakeAgent, wakeMessage } from '@/lib/wakeAgent'

/**
 * THE PICTURE TAKES THE WHOLE SCREEN -- BY DEFAULT (lib/browserLayout.ts).
 *
 * Not the element fullscreen API, which Telegram's iOS WebView does not
 * implement for anything but a video. The picture covers the app -- the tab
 * bar included -- and the controls float over it in one frosted-glass sheet.
 * The classic page (`?view=classic`) is a history entry, so Back, Telegram's
 * own or the browser's, returns to the minimal view.
 */
const FULL_VIEW = 'full'
/* The address parameter it lives in: ?view=full. */
const VIEW_PARAM = 'view'
/* ?type=1: the Telegram button "Type it" lands here with the sheet open. */
const TYPE_PARAM = 'type'

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
  const [showImport, setShowImport] = useState(false)
  const [showType, setShowType] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [walking, setWalking] = useState(false)
  const [walked, setWalked] = useState<'done' | 'failed' | null>(null)
  const [agentWorking, setAgentWorking] = useAtom(agentWorkingAtom)
  /* Remembers a browser that was here, so its absence can be explained. */
  const lastState = useRef<BrowserSessionView['state'] | null>(null)
  const [explainGone, setExplainGone] = useState(false)
  const stage = useRef<HTMLDivElement | null>(null)
  const [params, setParams] = useSearchParams()
  const viewParam = params.get(VIEW_PARAM)
  const typeAsked = params.get(TYPE_PARAM) === '1'
  useEffect(() => {
    if (typeAsked) setShowType(true)
  }, [typeAsked])
  /* Undoes the listeners on the frame's current window; see frameTouch.ts. */
  const unlistenFrame = useRef<(() => void) | null>(null)
  useEffect(() => () => unlistenFrame.current?.(), [])
  /* The last shape we asked the pod for, so a scroll does not ask again. */
  const fitted = useRef<Box | null>(null)

  const act = useCallback(
    async (fn: () => Promise<BrowserSessionView>) => {
      setBusy(true)
      setError(null)
      try {
        const next = await fn()
        /* It did not forget them; say so rather than show an empty screen. */
        setExplainGone(wentOut(lastState.current, next.state))
        lastState.current = next.state
        setView(next)
        /* The server says who is driving: after a reload, or from another
         device, the glow shows the truth instead of assuming the agent. */
        if (next.wheel === 'person') setAgentWorking(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [setAgentWorking]
  )

  /*
   * Read on arrival, and again on every RETURN: the page is kept mounted
   * while the person is on other tabs (lib/keptBrowser.ts), so "on mount"
   * would be once per five minutes, and the session may have changed. The
   * view address is stable for a session, so the frame does not reload.
   */
  const { pathname } = useLocation()
  const onThisTab = isBrowserPath(pathname)
  useEffect(() => {
    if (onThisTab) void act(readBrowserSession)
  }, [act, onThisTab])

  /*
   * The window says when its connection is lost (lib/frameState.ts). A lost
   * connection may be a session that ended: read the state again rather
   * than keep a frozen frame on screen.
   */
  const frame = useRef<HTMLIFrameElement | null>(null)
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const state = frameStateOf(
        e,
        frame.current?.contentWindow,
        window.location.origin
      )
      if (shouldReread(state)) void act(readBrowserSession)
      /* What a tap met inside the window, for the server log (skin.ts). */
      const touch = touchReportOf(
        e,
        frame.current?.contentWindow,
        window.location.origin
      )
      if (touch) reportClientError({ kind: 'browser-touch', message: touch })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
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

    /*
     * The BOX is watched, not the window. Going full screen changes the box
     * and not the window, and the pod has to follow it or the picture comes
     * back with the black bars it was meant to lose.
     */
    const box =
      typeof ResizeObserver !== 'undefined' && stage.current
        ? new ResizeObserver(later)
        : null
    if (box && stage.current) box.observe(stage.current)

    measureAndFit()
    window.addEventListener('resize', later)
    window.addEventListener('orientationchange', later)
    return () => {
      stopped = true
      clearTimeout(timer)
      box?.disconnect()
      window.removeEventListener('resize', later)
      window.removeEventListener('orientationchange', later)
    }
  }, [view?.state])

  /* The screen AND the server: the agent's acting tools stand still while
     the person drives (lib/browserWatch.ts shouldRenewWheel). */
  const wheelSent = useRef<number | null>(null)
  const takeTheWheel = useCallback(() => {
    setAgentWorking(wheelAfterTouch() === 'agent')
    const now = Date.now()
    if (shouldRenewWheel(wheelSent.current, now)) {
      wheelSent.current = now
      void setBrowserWheel('person')
    }
  }, [setAgentWorking])

  const state = view?.state ?? 'none'
  const live = state === 'live' && Boolean(view?.viewUrl)

  /* What the agent did here (lib/browserJournal.ts), read while the window
     is live and this tab is on screen. */
  const [journal, setJournal] = useState<JournalStep[]>([])
  /*
   * THE AGENT ASKS FOR SOMETHING TO BE TYPED (render input-request.ts): read
   * on the same beat as the journal, and it opens the typing sheet with the
   * agent's words on it. A request the person closed stays closed.
   */
  const [inputRequest, setInputRequest] = useState<InputRequestView | null>(
    null
  )
  const dismissedRequest = useRef<string | null>(null)
  /* The agent's open question (render approvals.ts), shown with two buttons. */
  const [approval, setApproval] = useState<PendingApproval | null>(null)

  /*
   * THE SHEET ON A PHONE. It opens by itself to half the screen when the
   * agent needs the person -- a permission, a choice, something to type --
   * so nobody has to find the question; otherwise it stays a peek and the
   * picture has the screen.
   */
  const [sheet, setSheet] = useState<Detent>('peek')
  const [phone, setPhone] = useState(
    () => window.matchMedia?.(`(max-width: ${PHONE_MAX}px)`).matches ?? false
  )
  useEffect(() => {
    const mq = window.matchMedia?.(`(max-width: ${PHONE_MAX}px)`)
    if (!mq) return
    const on = () => setPhone(mq.matches)
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  const needsPerson = Boolean(approval || inputRequest || showType)
  useEffect(() => {
    if (needsPerson) setSheet(s => (s === 'peek' ? 'half' : s))
  }, [needsPerson])
  useEffect(() => {
    if (!live || !onThisTab) return
    let stopped = false
    const pull = async () => {
      if (document.visibilityState !== 'visible') return
      const [steps, session, question] = await Promise.all([
        readBrowserJournal(),
        readBrowserSession().catch(() => null),
        readPendingApproval(),
      ])
      if (stopped) return
      if (steps) setJournal(steps)
      setApproval(question)
      const asked = session?.inputRequest ?? null
      setInputRequest(asked)
      /* A request to TYPE opens the sheet; a choice has its own card. */
      if (
        asked &&
        !isPressedAsk(asked) &&
        dismissedRequest.current !== asked.id
      )
        setShowType(true)
    }
    void pull()
    const timer = setInterval(() => void pull(), JOURNAL_POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [live, onThisTab])
  const embedded = live && canEmbed(view!.viewUrl!)
  const layout = browserLayout({ embedded, phone, view: viewParam })
  const minimal = layout === 'minimal'
  const peekPx = minimal ? ISLAND_PX : PEEK_PX

  /* The peek's height, for the picture to end above it (Browser.css). */
  const sheetStyle = { ['--sheet-peek' as string]: `${peekPx}px` }

  const rootClass = [
    'remote-browser',
    embedded ? 'remote-browser--live' : '',
    /* The minimal view reuses full screen's stage: fixed, over the app. */
    minimal ? 'remote-browser--full remote-browser--minimal' : '',
    layout === 'sheet' ? 'remote-browser--sheet' : '',
  ]
    .filter(Boolean)
    .join(' ')

  /*
   * EVERYTHING UNDER THE PICTURE: on a phone it lives in the bottom sheet
   * (components/DetentSheet), so the picture takes the whole screen and the
   * controls come up when they are wanted; elsewhere it stays in the flow.
   */
  const underPicture = (
    <>
      {embedded && journal.length > 0 ? (
        <div className="remote-browser__journal-wrap">
          <button
            type="button"
            className="remote-browser__journal-toggle"
            aria-expanded={journalOpen}
            onClick={() => setJournalOpen(v => !v)}
          >
            {journalOpen
              ? t('browser.journal.hide')
              : t('browser.journal.show', {
                  n: foldRepeats(journal, t).length,
                })}
          </button>
          {journalOpen ? (
            <ol
              className="remote-browser__journal"
              aria-label={t('browser.journal')}
            >
              {foldRepeats(journal, t).map((step, i) => {
                const line = journalLine(step, t)
                return (
                  <li
                    key={`${step.at}:${i}`}
                    className={line.ok ? '' : 'is-error'}
                  >
                    <time>{line.time}</time> <b>{line.verb}</b>
                    {step.times > 1 ? <em> ×{step.times}</em> : null}{' '}
                    <span>{line.text}</span>
                  </li>
                )
              })}
            </ol>
          ) : null}
        </div>
      ) : null}

      {/*
       * Who is driving, said UNDER the picture. It used to sit on the
       * picture's top edge, and there it lay over the window's own bar:
       * the controls under it could not be pressed.
       */}
      {embedded ? (
        <p
          className={
            agentWorking
              ? 'remote-browser__working remote-browser__working--agent'
              : 'remote-browser__working'
          }
          aria-live="polite"
        >
          {agentWorking ? t('browser.agentWorking') : t('browser.youDrive')}
        </p>
      ) : null}

      {embedded && approval ? (
        <AskedPermission
          approval={approval}
          onAnswered={() => setApproval(null)}
        />
      ) : null}

      {embedded && inputRequest && isPressedAsk(inputRequest) ? (
        <AskedChoice
          request={inputRequest}
          onAnswered={() => setInputRequest(null)}
        />
      ) : null}

      {embedded ? <BrowserKeys /> : null}

      {embedded ? (
        showType ? (
          <TypeSheet
            request={isPressedAsk(inputRequest) ? null : inputRequest}
            onClose={() => {
              dismissedRequest.current = inputRequest?.id ?? null
              setShowType(false)
            }}
          />
        ) : (
          <button
            type="button"
            className="remote-browser__cta remote-browser__type"
            onClick={() => setShowType(true)}
          >
            {t('browser.type.open')}
          </button>
        )
      ) : null}

      <div className="remote-browser__actions">
        {/* A history entry either way, so Back undoes it; see browserLayout. */}
        {embedded ? (
          minimal ? (
            <button
              type="button"
              className="remote-browser__secondary"
              onClick={() => setParams({ view: CLASSIC_VIEW })}
            >
              {t('browser.classic')}
            </button>
          ) : (
            <button
              type="button"
              className="remote-browser__secondary"
              onClick={() => setParams({ view: FULL_VIEW })}
            >
              {t('browser.fullscreen')}
            </button>
          )
        ) : null}

        {/* Taking the wheel is a press too: watching must not interrupt. */}
        {agentWorking ? (
          <button
            type="button"
            className="remote-browser__secondary"
            onClick={takeTheWheel}
          >
            {t('browser.takeTheWheel')}
          </button>
        ) : null}

        {/* Handing the wheel back is a press, never a timeout. */}
        {!agentWorking ? (
          <button
            type="button"
            className="remote-browser__secondary"
            onClick={() => {
              setAgentWorking(wheelAfterHandBack() === 'agent')
              wheelSent.current = null
              void setBrowserWheel('agent')
              /* The agent wakes knowing the person needs help (wakeAgent.ts). */
              if (
                shouldWakeAgent({
                  agentWaiting: Boolean(approval || inputRequest),
                  replying: isAgentBusy(),
                  lastStepAt: journal[0]?.at ?? null,
                  now: Date.now(),
                })
              )
                void sendToAgent(
                  wakeMessage(
                    t('browser.wake.ask'),
                    t('browser.wake.steps'),
                    journal,
                    step => {
                      const l = journalLine(step, t)
                      return `${l.verb} ${l.text}`.trim()
                    }
                  )
                )
            }}
          >
            {t('browser.handBack')}
          </button>
        ) : null}

        {/*
         * The round, now rather than in three hours (render agent/rounds.ts).
         * It reports in the chat, so the button only says what happened to
         * the asking.
         */}
        <button
          type="button"
          className="remote-browser__secondary"
          disabled={walking}
          onClick={() => {
            setWalking(true)
            setWalked(null)
            void walkMyAccounts().then(said => {
              setWalking(false)
              setWalked(said === null ? 'failed' : 'done')
            })
          }}
        >
          {walking ? t('browser.round.going') : t('browser.round')}
        </button>

        {/* Passwords through the vault, sessions from a file; see ImportLogins. */}
        <button
          type="button"
          className="remote-browser__secondary"
          aria-expanded={showImport}
          onClick={() => setShowImport(v => !v)}
        >
          {t('browser.import.open')}
        </button>

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
      {walked ? (
        <p className="remote-browser__muted" aria-live="polite">
          {t(`browser.round.${walked}`)}
        </p>
      ) : null}
      {/* One cabinet per line of work (components/Browser/Desks.tsx). */}
      {embedded ? <Desks /> : null}
      {showImport ? <ImportLogins /> : null}
      <p className="remote-browser__muted">{t('browser.closeKeeps')}</p>
    </>
  )

  /* The closed sheet: who is driving, or what the agent is waiting on. */
  const waitingOn = approval
    ? t('browser.ask.title')
    : inputRequest
      ? isPressedAsk(inputRequest)
        ? inputRequest.kind === 'action'
          ? t('browser.choice.actionTitle')
          : t('browser.choice.title')
        : t(`browser.type.ask.${inputRequest.kind}`)
      : null
  const peekLine = (
    <span
      className={
        waitingOn
          ? 'remote-browser__peek remote-browser__peek--asks'
          : agentWorking
            ? 'remote-browser__peek remote-browser__peek--agent'
            : 'remote-browser__peek'
      }
    >
      {waitingOn ??
        (agentWorking ? t('browser.agentWorking') : t('browser.youDrive'))}
    </span>
  )

  return (
    <div className={rootClass} style={sheetStyle}>
      <header className="remote-browser__head">
        <h1>{t('browser.title')}</h1>
        <p className="remote-browser__lead">{t('browser.lead')}</p>
      </header>

      {view === null && !error ? (
        <BrandLoader label={t('browser.loading')} />
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
              /* A click, not a passing pointer (lib/deliberateTouch.ts). */
              onClick={takeTheWheel}
              onKeyDownCapture={takeTheWheel}
            >
              <iframe
                ref={frame}
                className="remote-browser__frame"
                src={absoluteViewUrl(view!.viewUrl!)}
                title={t('browser.title')}
                allow="clipboard-read; clipboard-write; fullscreen"
                onLoad={e => {
                  /* Every load is a new window inside: listen to that one. */
                  unlistenFrame.current?.()
                  unlistenFrame.current = listenForTouchInside(
                    e.currentTarget,
                    window,
                    takeTheWheel
                  )
                }}
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

          {minimal || layout === 'sheet' ? (
            <DetentSheet
              detent={sheet}
              onDetent={setSheet}
              label={t('browser.sheet.label')}
              peek={peekLine}
              peekPx={peekPx}
              className={
                [
                  minimal ? 'detent-sheet--glass' : '',
                  /* The sheet glows too while the agent works. */
                  agentWorking ? 'detent-sheet--working' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              {underPicture}
            </DetentSheet>
          ) : (
            underPicture
          )}
        </section>
      ) : null}
    </div>
  )
}

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import './TabStrip.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  readBrowserTabs,
  actOnBrowserTab,
  AGENT_WORKING,
  type BrowserTab,
  type TabAction,
} from '@/lib/remoteBrowser'
import * as SPEC from '@/spec/browser-tab-strip.gen'

/**
 * THE TABS OF THE PERSON'S OWN BROWSER, ABOVE THE PICTURE.
 *
 * Spec: browser-tab-strip.t27 (vendored in render/src/spec, its generated
 * module copied to player/src/spec). The pod's Chromium shows no tab bar, so
 * a page the agent opened, or a link that opened a new tab, was a page the
 * person could not get back to. One tap switches; "+" opens; "x" closes, and
 * the server refuses to close the last one.
 *
 * Read every POLL_MS while the page is visible and `live` is true, and again
 * right after each press, so the strip shows what the press did.
 *
 * v2: a tab the agent is working in carries a small mark (desk run or chat),
 * and its "x" first asks, inline under the row, naming the agent; the close is
 * sent only on "Close". The server refuses an unconfirmed close with 409
 * `agent-working`, so a tab that became the agent's between two reads asks too.
 */
export function TabStrip({ live }: { live: boolean }) {
  const { t } = useLanguage()
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(false)
  /* The agent's tab whose close waits for the person's yes. */
  const [asking, setAsking] = useState<string | null>(null)
  const askId = useId()
  /* A read that started before a press must not undo what the press showed. */
  const pressed = useRef(0)

  useEffect(() => {
    if (!live) return
    let stopped = false
    const pull = async () => {
      if (document.visibilityState !== 'visible') return
      const seen = pressed.current
      const next = await readBrowserTabs()
      if (!stopped && next && seen === pressed.current) setTabs(next)
    }
    void pull()
    const timer = setInterval(() => void pull(), SPEC.POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [live])

  const act = useCallback(
    async (action: TabAction, id?: string, confirm = false) => {
      if (busy) return
      setBusy(true)
      setAsking(null)
      pressed.current += 1
      const next = confirm
        ? await actOnBrowserTab(action, id, true)
        : await actOnBrowserTab(action, id)
      if (next === AGENT_WORKING) {
        /* The agent took the tab since the last read: ask, do not close. */
        setRefused(false)
        if (id) setAsking(id)
        const fresh = await readBrowserTabs()
        if (fresh) setTabs(fresh)
      } else {
        setRefused(next === null)
        if (next) setTabs(next)
      }
      setBusy(false)
    },
    [busy]
  )

  const agentLabel = (tab: BrowserTab) =>
    tab.agent === SPEC.AGENT_DESK
      ? t('browser.tabs.agentDesk')
      : t('browser.tabs.agentChat')

  if (!live) return null
  const canClose = tabs.length > 1
  const canOpen = tabs.length < SPEC.MAX_TABS_SHOWN
  const asked = asking ? tabs.find(tab => tab.id === asking) : undefined
  const askedName = asked
    ? asked.title || asked.host || t('browser.tabs.untitled')
    : ''

  return (
    <div className="tab-strip">
      <div
        className="tab-strip__row"
        role="tablist"
        aria-label={t('browser.tabs.label')}
      >
        {tabs.map(tab => {
          const name = tab.title || tab.host || t('browser.tabs.untitled')
          return (
            <div
              key={tab.id}
              className={
                tab.active ? 'tab-strip__tab is-active' : 'tab-strip__tab'
              }
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.active}
                className="tab-strip__pick"
                disabled={busy}
                title={tab.host}
                onClick={() => void act('activate', tab.id)}
              >
                <span className="tab-strip__title">
                  {tab.agent ? (
                    <span
                      className={`tab-strip__agent is-${tab.agent}`}
                      role="img"
                      aria-label={agentLabel(tab)}
                      title={agentLabel(tab)}
                    >
                      {tab.agent === SPEC.AGENT_DESK
                        ? '\u2699\uFE0E'
                        : '\u270E'}
                    </span>
                  ) : null}
                  {name}
                </span>
                {tab.title && tab.host ? (
                  <span className="tab-strip__host">{tab.host}</span>
                ) : null}
              </button>
              {canClose ? (
                <button
                  type="button"
                  className="tab-strip__close"
                  disabled={busy}
                  aria-label={t('browser.tabs.close', { title: name })}
                  onClick={() =>
                    tab.agent ? setAsking(tab.id) : void act('close', tab.id)
                  }
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
        <button
          type="button"
          className="tab-strip__new"
          disabled={busy || !canOpen}
          aria-label={t('browser.tabs.new')}
          onClick={() => void act('new')}
        >
          +
        </button>
      </div>
      {asked ? (
        <div
          className="tab-strip__confirm"
          role="alertdialog"
          aria-labelledby={askId}
        >
          <p id={askId} className="tab-strip__confirm-text">
            {t(
              asked.agent === SPEC.AGENT_DESK
                ? 'browser.tabs.confirmDesk'
                : 'browser.tabs.confirmChat',
              { title: askedName }
            )}
          </p>
          <div className="tab-strip__confirm-actions">
            <button
              type="button"
              className="tab-strip__confirm-close"
              disabled={busy}
              onClick={() => void act('close', asked.id, true)}
            >
              {t('browser.tabs.closeAnyway')}
            </button>
            <button
              type="button"
              className="tab-strip__confirm-keep"
              onClick={() => setAsking(null)}
            >
              {t('browser.tabs.keep')}
            </button>
          </div>
        </div>
      ) : null}
      {refused ? (
        <p className="tab-strip__refused" role="status">
          {t('browser.tabs.refused')}
        </p>
      ) : null}
    </div>
  )
}

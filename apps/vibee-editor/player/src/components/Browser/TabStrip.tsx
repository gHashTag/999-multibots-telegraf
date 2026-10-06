import { useCallback, useEffect, useRef, useState } from 'react'
import './TabStrip.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  readBrowserTabs,
  actOnBrowserTab,
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
 */
export function TabStrip({ live }: { live: boolean }) {
  const { t } = useLanguage()
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(false)
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
    async (action: TabAction, id?: string) => {
      if (busy) return
      setBusy(true)
      pressed.current += 1
      const next = await actOnBrowserTab(action, id)
      setRefused(next === null)
      if (next) setTabs(next)
      setBusy(false)
    },
    [busy]
  )

  if (!live) return null
  const canClose = tabs.length > 1
  const canOpen = tabs.length < SPEC.MAX_TABS_SHOWN

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
                <span className="tab-strip__title">{name}</span>
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
                  onClick={() => void act('close', tab.id)}
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
      {refused ? (
        <p className="tab-strip__refused" role="status">
          {t('browser.tabs.refused')}
        </p>
      ) : null}
    </div>
  )
}

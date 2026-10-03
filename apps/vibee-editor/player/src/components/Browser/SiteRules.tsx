import { useCallback, useEffect, useState } from 'react'
import './SiteRules.css'
import { useLanguage } from '@/hooks/useLanguage'
import {
  dropSiteRule,
  nextRule,
  putSiteRule,
  readSiteListState,
  siteRuleFailKey,
  siteRuleReason,
  type SiteListState,
  type SiteRule,
} from '@/lib/remoteBrowser'

/**
 * WHERE THE AGENT ASKS FIRST, AND WHERE IT NEVER GOES.
 *
 * The person's own list (render/src/browser/site-rules.ts). Banks, mail and
 * payment pages are guarded for everyone already; this is for the places
 * only the person can name -- a clinic's portal, the shop with their card,
 * a work chat.
 *
 * This screen is the person's door, so it is the only place a rule gets
 * LOOSER: a site removed, or "never" softened to "ask". The agent can only
 * add or tighten, which is why a row the agent added says so -- the person
 * should see what was decided for them.
 */
export function SiteRules() {
  const { t } = useLanguage()
  /* undefined: still reading. */
  const [list, setList] = useState<SiteListState | undefined>(undefined)
  const [site, setSite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reread = useCallback(async () => {
    setList(await readSiteListState())
  }, [])

  useEffect(() => {
    void reread()
  }, [reread])

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await work()
      await reread()
    } catch (e) {
      const key = siteRuleFailKey(e)
      setError(
        key ? t(key) : t('browser.sites.fail', { error: siteRuleReason(e) })
      )
    } finally {
      setBusy(false)
    }
  }

  const add = (rule: SiteRule) =>
    run(async () => {
      await putSiteRule(site.trim(), rule)
      setSite('')
    })

  return (
    <section className="site-rules" aria-labelledby="site-rules-title">
      <h2 id="site-rules-title">{t('browser.sites.title')}</h2>
      <p>{t('browser.sites.how')}</p>

      <div className="site-rules__add">
        <input
          type="text"
          inputMode="url"
          data-ai="off"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t('browser.sites.placeholder')}
          placeholder={t('browser.sites.placeholder')}
          value={site}
          onChange={e => setSite(e.currentTarget.value)}
          onKeyDown={e => {
            /*
             * The phone keyboard's Enter adds the gentler rule -- but not the
             * Enter that confirms a word in an input method (pinyin, kana, a
             * Russian autocorrect pick): that one is still typing. Safari
             * ends the composition before keydown, so isComposing is already
             * false there and only keyCode 229 tells.
             */
            const composing =
              e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229
            if (e.key === 'Enter' && !composing && !busy && site.trim())
              void add('ask')
          }}
        />
        <button
          type="button"
          className="remote-browser__secondary"
          disabled={busy || !site.trim()}
          onClick={() => void add('ask')}
        >
          {t('browser.sites.ask')}
        </button>
        <button
          type="button"
          className="remote-browser__danger"
          disabled={busy || !site.trim()}
          onClick={() => void add('block')}
        >
          {t('browser.sites.block')}
        </button>
      </div>

      {error ? (
        <p className="site-rules__fail" role="alert">
          {error}
        </p>
      ) : null}

      {list === undefined ? (
        <p className="site-rules__muted">{t('browser.sites.loading')}</p>
      ) : 'unreadable' in list ? (
        <p className="site-rules__fail" role="alert">
          {t('browser.sites.unreadable')}
        </p>
      ) : 'failed' in list ? (
        <p className="site-rules__fail" role="alert">
          {t('browser.sites.readFail', { error: list.failed })}
        </p>
      ) : list.rows.length === 0 ? (
        <p className="site-rules__muted">{t('browser.sites.empty')}</p>
      ) : (
        <ul className="site-rules__list">
          {list.rows.map(row => (
            <li key={row.site} data-rule={row.rule}>
              <span className="site-rules__site">{row.site}</span>
              <span className="site-rules__rule">
                {row.rule === 'block'
                  ? t('browser.sites.block')
                  : t('browser.sites.ask')}
                {row.by === 'agent' ? ` · ${t('browser.sites.byAgent')}` : ''}
              </span>
              <button
                type="button"
                className="remote-browser__secondary"
                disabled={busy}
                onClick={() =>
                  void run(() => putSiteRule(row.site, nextRule(row.rule)))
                }
              >
                {row.rule === 'block'
                  ? t('browser.sites.toAsk')
                  : t('browser.sites.toBlock')}
              </button>
              <button
                type="button"
                className="remote-browser__secondary"
                disabled={busy}
                onClick={() => void run(() => dropSiteRule(row.site))}
              >
                {t('browser.sites.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

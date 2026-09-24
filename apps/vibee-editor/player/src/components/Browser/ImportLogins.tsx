import { useState } from 'react'
import './ImportLogins.css'
import { useLanguage } from '@/hooks/useLanguage'
import { importBrowserLogins, sitesInWords } from '@/lib/remoteBrowser'

/**
 * BRING YOUR LOGINS OVER, IN ONE GO.
 *
 * Two roads, and the difference is the point:
 *
 *   PASSWORDS never come through the app. The owner's rule is that a person
 *   types a secret themselves, inside the stream, and it reaches their pod
 *   and nothing else. So passwords in bulk go through the password manager
 *   installed IN the browser (Bitwarden), which the person unlocks there.
 *
 *   SESSIONS (cookies) are brought as a file the person exported from their
 *   own computer. They pass through the broker on their way in and are kept
 *   nowhere; the answer names sites and counts, never a value. Only the
 *   person can do this -- the broker refuses an agent key.
 *
 * There is no password field here, and there never will be.
 */
export const IMPORT_ACCEPTS = '.json,.txt,application/json,text/plain'

export function ImportLogins() {
  const { t } = useLanguage()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ ok: boolean; line: string } | null>(null)

  const bring = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setSaid(null)
    try {
      const got = await importBrowserLogins(text)
      const sites = sitesInWords(got.sites, n =>
        t('browser.import.andMore', { n })
      )
      setSaid({
        ok: true,
        line: t('browser.import.done', { n: got.imported, sites }),
      })
      /* The keys have done their job; do not leave them on the screen. */
      setText('')
    } catch (e) {
      setSaid({
        ok: false,
        line: t('browser.import.fail', {
          error: e instanceof Error ? e.message : String(e),
        }),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="import-logins" aria-labelledby="import-logins-title">
      <h2 id="import-logins-title">{t('browser.import.title')}</h2>
      <p>{t('browser.import.passwords')}</p>
      <p>{t('browser.import.cookiesHow')}</p>

      <label className="import-logins__file">
        {t('browser.import.file')}
        <input
          type="file"
          accept={IMPORT_ACCEPTS}
          onChange={async e => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (file) setText(await file.text())
          }}
        />
      </label>
      <textarea
        className="import-logins__paste"
        data-ai="off"
        placeholder={t('browser.import.paste')}
        value={text}
        onChange={e => setText(e.currentTarget.value)}
        rows={4}
        spellCheck={false}
        autoComplete="off"
      />
      <button
        type="button"
        className="remote-browser__cta"
        disabled={busy || !text.trim()}
        onClick={() => void bring()}
      >
        {busy ? t('browser.import.going') : t('browser.import.go')}
      </button>
      {said ? (
        <p
          className={said.ok ? 'import-logins__ok' : 'import-logins__fail'}
          role={said.ok ? 'status' : 'alert'}
        >
          {said.line}
        </p>
      ) : null}
      <p className="import-logins__warn">{t('browser.import.warn')}</p>
    </section>
  )
}

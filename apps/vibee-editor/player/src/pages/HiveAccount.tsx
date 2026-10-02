import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { ArrowLeft, KeyRound, RefreshCw } from 'lucide-react'
import { openLoginAtom, userAtom } from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import {
  addHiveKey,
  changeHiveKey,
  hiveKeyError,
  loadHiveKeys,
  type HiveKey,
  type HiveKeyAccount,
} from '@/lib/hiveKeys'
import './HiveAccount.css'

export default function HiveAccount() {
  const { lang, t } = useLanguage()
  const user = useAtomValue(userAtom)
  const openLogin = useSetAtom(openLoginAtom)
  const [account, setAccount] = useState<HiveKeyAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const result = await loadHiveKeys(controller.signal)
      if (!controller.signal.aborted) setAccount(result)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setAccount(null)
        setError(hiveKeyError(failure))
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    generation.current += 1
    setAccount(null)
    setBusy(false)
    setNotice(null)
    setProgress(null)
    form.current?.reset()
    void refresh()
    return () => {
      generation.current += 1
      request.current?.abort()
    }
  }, [refresh, user?.id])

  const replaceKey = (key: HiveKey) => {
    setAccount(current =>
      current
        ? {
            ...current,
            keys: current.keys.some(row => row.id === key.id)
              ? current.keys.map(row => (row.id === key.id ? key : row))
              : [...current.keys, key],
          }
        : null
    )
  }

  const perform = async (
    operation: (signal: AbortSignal) => Promise<void>,
    success: string
  ) => {
    if (busy) return
    const epoch = generation.current
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await operation(controller.signal)
      if (!controller.signal.aborted && epoch === generation.current)
        setNotice(success)
    } catch (failure) {
      if (!controller.signal.aborted && epoch === generation.current) {
        const code = hiveKeyError(failure)
        setError(code)
        if (
          code === 'hiveAccount.error.signin' ||
          code === 'hiveAccount.error.attribution'
        )
          setAccount(null)
      }
    } finally {
      if (!controller.signal.aborted && epoch === generation.current) {
        setBusy(false)
        setProgress(null)
      }
    }
  }

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !account) return
    const fields = new FormData(event.currentTarget)
    const provider = account.providers.find(
      row => row.id === fields.get('provider')
    )
    const secretInput = event.currentTarget.elements.namedItem(
      'apiKey'
    ) as HTMLInputElement
    const apiKey = secretInput.value.trim()
    if (!provider || !apiKey) return
    const label = String(fields.get('label') ?? '').trim()
    // Clear immediately. No secret enters component state, a URL, or browser storage.
    secretInput.value = ''
    void perform(async signal => {
      const result = await addHiveKey(
        { provider: provider.id, apiKey, label },
        signal
      )
      if (!signal.aborted) {
        replaceKey(result.key)
        form.current?.reset()
      }
    }, 'hiveAccount.saved')
  }

  const change = (key: HiveKey, action: 'probe' | 'disable' | 'enable') => {
    void perform(
      async signal => {
        const result = await changeHiveKey(key.id, action, signal)
        if (!signal.aborted) replaceKey(result.key)
      },
      action === 'probe' ? 'hiveAccount.checked' : 'hiveAccount.updated'
    )
  }

  const probeAll = () => {
    if (!account) return
    const keys = [...account.keys]
    void perform(async signal => {
      setProgress({ done: 0, total: keys.length })
      for (const [index, key] of keys.entries()) {
        const result = await changeHiveKey(key.id, 'probe', signal)
        if (signal.aborted) return
        replaceKey(result.key)
        setProgress({ done: index + 1, total: keys.length })
      }
    }, 'hiveAccount.checkedAll')
  }

  const date = (value: string | null) => {
    if (!value || !Number.isFinite(Date.parse(value)))
      return t('hiveAccount.never')
    return new Date(value).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  }

  return (
    <main className="hive-account">
      <Link to="/game" className="hive-account__back">
        <ArrowLeft size={18} aria-hidden="true" />
        {t('hiveAccount.back')}
      </Link>
      <header className="hive-account__heading">
        <div>
          <h1>{t('hiveAccount.title')}</h1>
          <p>{t('hiveAccount.lead')}</p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={18} aria-hidden="true" />
          {t('hiveAccount.refresh')}
        </button>
      </header>

      {loading && <p role="status">{t('hiveAccount.loading')}</p>}
      {error && (
        <div className="hive-account__message is-error" role="alert">
          <p>{t(error)}</p>
          {error === 'hiveAccount.error.signin' ? (
            <button type="button" onClick={() => openLogin('board')}>
              {t('hiveAccount.signin')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              {t('hiveAccount.retry')}
            </button>
          )}
        </div>
      )}
      <div role="status" aria-live="polite" className="hive-account__status">
        {progress
          ? t('hiveAccount.progress', {
              done: progress.done,
              total: progress.total,
            })
          : busy
            ? t('hiveAccount.working')
            : notice
              ? t(notice)
              : null}
      </div>

      {account && !loading && (
        <>
          <section
            className="hive-account__attribution"
            aria-labelledby="hive-attribution"
          >
            <h2 id="hive-attribution">{t('hiveAccount.attribution')}</h2>
            <p>
              {account.attribution.github ? (
                <strong>@{account.attribution.github}</strong>
              ) : (
                t('hiveAccount.unlinked')
              )}
            </p>
            <p className="hive-account__muted">
              {t('hiveAccount.attributionNote')}
            </p>
            <dl className="hive-account__totals">
              <div>
                <dt>{t('hiveAccount.xp')}</dt>
                <dd>{account.contribution.xp.toLocaleString(lang)}</dd>
              </div>
              <div>
                <dt>{t('hiveAccount.accepted')}</dt>
                <dd>{account.contribution.accepted}</dd>
              </div>
              <div>
                <dt>{t('hiveAccount.specs')}</dt>
                <dd>{account.contribution.specs}</dd>
              </div>
              <div>
                <dt>{t('hiveAccount.hours')}</dt>
                <dd>
                  {account.contribution.hours.toLocaleString(lang, {
                    maximumFractionDigits: 1,
                  })}
                </dd>
              </div>
            </dl>
            <p className="hive-account__muted">
              {t('hiveAccount.scoring', {
                accepted: account.scoring.acceptedXp,
                spec: account.scoring.specXp,
                hour: account.scoring.hourXp,
              })}
            </p>
          </section>

          <section className="hive-account__keys" aria-labelledby="hive-keys">
            <div className="hive-account__section-heading">
              <h2 id="hive-keys">
                {t('hiveAccount.keys', { n: account.keys.length })}
              </h2>
              <button
                type="button"
                disabled={busy || account.keys.length === 0}
                onClick={probeAll}
              >
                {t('hiveAccount.probeAll')}
              </button>
            </div>
            <p className="hive-account__muted">{t('hiveAccount.probeNote')}</p>
            {account.keys.length === 0 ? (
              <p className="hive-account__empty">{t('hiveAccount.empty')}</p>
            ) : (
              <ul className="hive-account__list">
                {account.keys.map(key => (
                  <li
                    key={key.id}
                    className="hive-account__key"
                    data-key-id={key.id}
                  >
                    <div className="hive-account__key-name">
                      <strong>{key.label || key.provider}</strong>
                      <span>{key.model}</span>
                      <code>
                        {/^[a-f0-9]{12}$/i.test(key.fingerprint)
                          ? key.fingerprint
                          : t('hiveAccount.fingerprintUnavailable')}
                      </code>
                    </div>
                    <div className="hive-account__health">
                      <span
                        className={`hive-account__probe is-${key.lastProbe.status}`}
                      >
                        {t(`hiveAccount.health.${key.lastProbe.status}`)}
                      </span>
                      <span>
                        {key.enabled
                          ? t('hiveAccount.enabled')
                          : t('hiveAccount.disabled')}
                      </span>
                      <time dateTime={key.lastProbe.checkedAt ?? undefined}>
                        {date(key.lastProbe.checkedAt)}
                      </time>
                    </div>
                    <div className="hive-account__key-work">
                      <strong>
                        {key.contribution.xp.toLocaleString(lang)} XP
                      </strong>
                      <span>
                        {t('hiveAccount.keyWork', {
                          n: key.contribution.accepted,
                        })}
                      </span>
                    </div>
                    <div className="hive-account__actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => change(key, 'probe')}
                        aria-label={`${t('hiveAccount.probe')}: ${key.label || key.provider}`}
                      >
                        {t('hiveAccount.probe')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          change(key, key.enabled ? 'disable' : 'enable')
                        }
                        aria-label={`${t(key.enabled ? 'hiveAccount.disable' : 'hiveAccount.enable')}: ${key.label || key.provider}`}
                      >
                        {t(
                          key.enabled
                            ? 'hiveAccount.disable'
                            : 'hiveAccount.enable'
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="hive-account__add" aria-labelledby="hive-add">
            <h2 id="hive-add">
              <KeyRound size={21} aria-hidden="true" />
              {t('hiveAccount.add')}
            </h2>
            <p className="hive-account__muted">{t('hiveAccount.secretNote')}</p>
            <form ref={form} onSubmit={add} autoComplete="off">
              <fieldset disabled={busy || account.providers.length === 0}>
                <label>
                  {t('hiveAccount.provider')}
                  <select name="provider" required>
                    {account.providers.map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('hiveAccount.label')}
                  <input name="label" type="text" autoComplete="off" />
                </label>
                <label className="hive-account__secret">
                  {t('hiveAccount.secret')}
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    autoCapitalize="none"
                    required
                  />
                </label>
                <button className="hive-account__primary" type="submit">
                  {t('hiveAccount.save')}
                </button>
              </fieldset>
            </form>
          </section>
        </>
      )}
    </main>
  )
}

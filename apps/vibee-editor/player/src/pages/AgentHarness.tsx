import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '@/components/Header'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { useLanguage } from '@/hooks/useLanguage'
import './AgentHarness.css'

interface AgentKeyRow {
  key_prefix: string
  label: string | null
  created_at: string
  revoked: boolean
}

const MCP_URL = `${API_BASE.replace(/\/$/, '')}/mcp`

function apiError(body: any, status: number, ru: boolean): string {
  if (status === 401) {
    return ru
      ? 'Откройте эту страницу внутри Telegram и войдите своим аккаунтом — только так ключ можно привязать именно к вам.'
      : 'Open this page inside Telegram and sign in with your account so the key can be bound to you.'
  }
  return String(body?.detail || body?.error || `HTTP ${status}`)
}

export function AgentHarnessPage() {
  const { lang } = useLanguage()
  const ru = lang === 'ru'
  const [label, setLabel] = useState('my-harness')
  const [keys, setKeys] = useState<AgentKeyRow[]>([])
  const [issued, setIssued] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/agent/keys`, {
        headers: authHeaders(),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(body, response.status, ru))
      setKeys(Array.isArray(body?.['ключи']) ? body['ключи'] : [])
    } catch (error) {
      setNote(String(error))
    }
  }, [ru])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setNote(null)
    setIssued(null)
    try {
      const headers = authHeaders()
      headers.set('Content-Type', 'application/json')
      const response = await fetch(`${API_BASE}/api/agent/keys`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ label: label.trim() || 'harness' }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.['ключ'])
        throw new Error(apiError(body, response.status, ru))
      setIssued(String(body['ключ']))
      await load()
    } catch (error) {
      setNote(String(error))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (prefix: string) => {
    setBusy(true)
    setNote(null)
    try {
      const response = await fetch(
        `${API_BASE}/api/agent/keys/${encodeURIComponent(prefix)}`,
        {
          method: 'DELETE',
          headers: authHeaders(),
        }
      )
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok)
        throw new Error(apiError(body, response.status, ru))
      if (issued?.startsWith(prefix)) setIssued(null)
      await load()
    } catch (error) {
      setNote(String(error))
    } finally {
      setBusy(false)
    }
  }

  const config = useMemo(
    () =>
      issued
        ? JSON.stringify(
            {
              mcpServers: {
                t27: {
                  url: MCP_URL,
                  headers: { 'X-Agent-Key': issued },
                },
              },
            },
            null,
            2
          )
        : '',
    [issued]
  )

  const copyConfig = async () => {
    if (!config) return
    try {
      await navigator.clipboard.writeText(config)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setNote(
        ru
          ? 'Clipboard недоступен — выделите конфигурацию вручную.'
          : 'Clipboard is unavailable — select the configuration manually.'
      )
    }
  }

  return (
    <div className="harness-page">
      <Header />
      <main className="harness-main" id="main-content">
        <Link to="/agents" className="harness-back">
          ← {ru ? 'к агентам' : 'agents'}
        </Link>
        <p className="harness-kicker">MCP · A2A · TELEGRAM</p>
        <h1>
          {ru
            ? 'Ваш агент. Ваш ключ. Ваш Telegram.'
            : 'Your agent. Your key. Your Telegram.'}
        </h1>
        <p className="harness-lead">
          {ru
            ? 'Выпустите токен T27 для своего харнеса. Ключ привязан к вашей Telegram-личности: он не принимает чужой telegram_id и не может выпускать новые ключи.'
            : 'Issue a T27 token for your own harness. The key is bound to your Telegram identity: it cannot impersonate another telegram_id or mint more keys.'}
        </p>

        <section className="harness-step">
          <span className="harness-step__number">01</span>
          <div>
            <h2>{ru ? 'Назовите харнес' : 'Name the harness'}</h2>
            <p>
              {ru
                ? 'Метка помогает отозвать именно тот доступ, который больше не нужен.'
                : 'The label lets you revoke only the access you no longer need.'}
            </p>
            <div className="harness-issue">
              <input
                value={label}
                maxLength={60}
                onChange={event => setLabel(event.target.value)}
                aria-label={ru ? 'Метка харнеса' : 'Harness label'}
              />
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy}
              >
                {busy ? '…' : ru ? 'Выпустить токен' : 'Issue token'}
              </button>
            </div>
          </div>
        </section>

        <section className="harness-step">
          <span className="harness-step__number">02</span>
          <div>
            <h2>
              {ru
                ? 'Передайте его харнесу один раз'
                : 'Give it to the harness once'}
            </h2>
            {issued ? (
              <>
                <p className="harness-warning">
                  {ru
                    ? 'Скопируйте сейчас: сервер хранит только хеш и больше не покажет этот ключ.'
                    : 'Copy it now: the server stores only a hash and will not show this key again.'}
                </p>
                <textarea
                  readOnly
                  rows={12}
                  value={config}
                  aria-label={ru ? 'MCP-конфигурация' : 'MCP configuration'}
                />
                <button
                  type="button"
                  className="harness-copy"
                  onClick={() => void copyConfig()}
                >
                  {copied
                    ? '✓'
                    : ru
                      ? 'Скопировать конфигурацию'
                      : 'Copy configuration'}
                </button>
              </>
            ) : (
              <p>
                {ru
                  ? 'После выпуска здесь появится готовая MCP-конфигурация для Claude, Codex или собственного клиента.'
                  : 'After issuing, a ready MCP configuration for Claude, Codex or your own client appears here.'}
              </p>
            )}
          </div>
        </section>

        <section className="harness-step">
          <span className="harness-step__number">03</span>
          <div>
            <h2>{ru ? 'Проверяйте и отзывайте' : 'Inspect and revoke'}</h2>
            <p>
              {ru
                ? 'Начните с whoami и tools/list. Доступ к Telegram появляется только к инструментам и аккаунту, которые подключили вы сами.'
                : 'Start with whoami and tools/list. Telegram access is limited to the tools and account you connected yourself.'}
            </p>
            <ul className="harness-keys">
              {keys.length === 0 ? (
                <li className="harness-empty">
                  {ru ? 'Активных ключей ещё нет.' : 'No keys yet.'}
                </li>
              ) : (
                keys.map(key => (
                  <li key={`${key.key_prefix}-${key.created_at}`}>
                    <span>
                      <strong>{key.label || 'agent'}</strong>
                      <code>{key.key_prefix}…</code>
                    </span>
                    <span className={key.revoked ? 'revoked' : 'active'}>
                      {key.revoked
                        ? ru
                          ? 'отозван'
                          : 'revoked'
                        : ru
                          ? 'активен'
                          : 'active'}
                    </span>
                    {!key.revoked ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void revoke(key.key_prefix)}
                      >
                        {ru ? 'Отозвать' : 'Revoke'}
                      </button>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        <aside className="harness-security">
          <strong>
            {ru
              ? 'Почему не Telegram Bot Token?'
              : 'Why not a Telegram Bot Token?'}
          </strong>
          <p>
            {ru
              ? 'T27 не просит секрет от BotFather на этой странице. Личный ключ T27 можно отозвать отдельно, он не даёт полного контроля над ботом и не хранится открытым текстом.'
              : 'T27 does not ask for a BotFather secret on this page. A personal T27 key can be revoked independently, does not grant full bot control, and is not stored in plaintext.'}
          </p>
        </aside>
        {note ? (
          <p className="harness-note" role="alert">
            {note}
          </p>
        ) : null}
      </main>
    </div>
  )
}

export default AgentHarnessPage

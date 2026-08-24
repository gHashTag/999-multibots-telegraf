import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Cable,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  callAgentTool,
  listAgentTools,
  type McpToolDescription,
} from '../../lib/agentMcp'
import {
  SAFE_BETA_TOOL_NAMES,
  createSafeActivityEvent,
  isExactSafeBetaRegistry,
  parsePreparedOwnerDraft,
  redactAgentStreamText,
  selectSafeBetaTools,
  verifiedOwnerId,
  type PreparedOwnerDraft,
  type SafeAgentActivityEvent,
  type SafeBetaToolName,
} from '../../lib/agentControls'
import { CopyAgentButton } from './CopyAgentButton'
import './AgentControlCenter.css'

interface DiagnosticsResponse {
  ownerId: string
  username: string
  published: number
  authors: number
  reels: number
  views: number
  likes: number
}

interface WhoAmIResponse {
  telegram_id?: string | number
  профиль?: { username?: string; first_name?: string } | null
  опубликовано?: number
}

export interface AgentControlCenterProps {
  compact?: boolean
  activity?: SafeAgentActivityEvent[]
}

const toolLabel: Record<(typeof SAFE_BETA_TOOL_NAMES)[number], string> = {
  whoami: 'Проверка активного профиля',
  feed_stats: 'Статистика ленты владельца',
  content_plan_prepare: 'Контент-план только как draft',
}

const safeCount = (value: unknown): number => {
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0
}

export function AgentControlCenter({
  compact = false,
  activity = [],
}: AgentControlCenterProps) {
  const [tools, setTools] = useState<McpToolDescription[]>([])
  const [registryLoaded, setRegistryLoaded] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(
    null
  )
  const [plan, setPlan] = useState<PreparedOwnerDraft | null>(null)
  const [localActivity, setLocalActivity] = useState<SafeAgentActivityEvent[]>(
    []
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const registryRequest = useRef(0)

  const safeTools = useMemo(() => selectSafeBetaTools(tools), [tools])
  const registryReady = registryLoaded && isExactSafeBetaRegistry(tools)
  const confirmedTools = registryReady ? safeTools : []
  const safeActivity = useMemo(
    () =>
      [...activity, ...localActivity]
        .filter(event => SAFE_BETA_TOOL_NAMES.includes(event.toolName))
        .slice(-20)
        .reverse(),
    [activity, localActivity]
  )

  const loadRegistry = useCallback(async () => {
    const request = ++registryRequest.current
    setTools([])
    setRegistryLoaded(false)
    setError(null)
    try {
      const discovered = await listAgentTools()
      if (request !== registryRequest.current) return
      setTools(discovered)
      setRegistryLoaded(true)
      if (!isExactSafeBetaRegistry(discovered)) {
        setError(
          'Live registry не совпадает с контрактом SAFE BETA. Действия выключены.'
        )
      }
    } catch {
      if (request !== registryRequest.current) return
      setTools([])
      setRegistryLoaded(false)
      setError(
        'Не удалось подтвердить SAFE BETA registry. Проверьте Telegram-вход.'
      )
    }
  }, [])

  useEffect(() => {
    void loadRegistry()
    return () => {
      registryRequest.current += 1
    }
  }, [loadRegistry])

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name)
    setError(null)
    try {
      await action()
    } catch {
      setError(
        'Действие не выполнено: безопасный контракт ответа не подтверждён.'
      )
    } finally {
      setBusy(null)
    }
  }

  const withActivity = async <T,>(
    toolName: SafeBetaToolName,
    action: () => Promise<T>
  ): Promise<T> => {
    const started = createSafeActivityEvent(toolName)
    if (!started) throw new Error('tool is outside SAFE BETA')
    const startedMs = Date.now()
    setLocalActivity(previous => [...previous, started].slice(-20))

    const settle = (status: 'completed' | 'failed') => {
      const durationMs = Math.max(0, Date.now() - startedMs)
      setLocalActivity(previous =>
        previous.map(event =>
          event.id === started.id ? { ...event, status, durationMs } : event
        )
      )
    }

    try {
      const result = await action()
      settle('completed')
      return result
    } catch (cause) {
      settle('failed')
      throw cause
    }
  }

  const diagnose = () =>
    run('diagnostics', async () => {
      const [identity, stats] = await Promise.all([
        withActivity('whoami', () => callAgentTool<WhoAmIResponse>('whoami')),
        withActivity('feed_stats', () =>
          callAgentTool<{
            авторов?: number
            роликов?: number
            просмотров?: number
            лайков?: number
          }>('feed_stats')
        ),
      ])
      const ownerId = verifiedOwnerId(identity.telegram_id)
      if (!ownerId) throw new Error('whoami did not confirm an owner')
      setDiagnostics({
        ownerId,
        username: redactAgentStreamText(
          identity.профиль?.username ||
            identity.профиль?.first_name ||
            'Telegram owner'
        ),
        published: safeCount(identity.опубликовано),
        authors: safeCount(stats.авторов),
        reels: safeCount(stats.роликов),
        views: safeCount(stats.просмотров),
        likes: safeCount(stats.лайков),
      })
    })

  const preparePlan = () =>
    run('plan', async () => {
      const identity = await withActivity('whoami', () =>
        callAgentTool<WhoAmIResponse>('whoami')
      )
      const ownerId = verifiedOwnerId(identity.telegram_id)
      if (!ownerId) throw new Error('whoami did not confirm an owner')

      const result = await withActivity('content_plan_prepare', async () => {
        const response = await callAgentTool<unknown>('content_plan_prepare', {
          topic: 'Контент моего профиля',
          goal: 'регулярный контент из моего профиля, публикаций и ассетов',
          days: 7,
        })
        const receipt = parsePreparedOwnerDraft(response, ownerId)
        if (!receipt) throw new Error('unsafe content-plan response')
        return receipt
      })
      setDiagnostics(previous => ({
        ownerId,
        username: redactAgentStreamText(
          identity.профиль?.username ||
            identity.профиль?.first_name ||
            previous?.username ||
            'Telegram owner'
        ),
        published: safeCount(identity.опубликовано),
        authors: previous?.authors ?? 0,
        reels: previous?.reels ?? 0,
        views: previous?.views ?? 0,
        likes: previous?.likes ?? 0,
      }))
      setPlan(result)
    })

  return (
    <section
      className={`agent-control ${compact ? 'agent-control--compact' : ''}`}
    >
      <header className="agent-control__header">
        <div>
          <span className="agent-control__badge">SAFE BETA</span>
          <h2>
            <ShieldCheck size={18} /> Агент @
            {diagnostics?.username || 'Telegram owner'}
          </h2>
          <p>Verified-session reads и черновики. Внешние действия отключены.</p>
        </div>
        <button
          type="button"
          className="agent-control__refresh"
          onClick={() => void loadRegistry()}
          aria-label="Обновить live registry"
        >
          <RefreshCw size={15} />
        </button>
      </header>

      {error ? (
        <div className="agent-control__error" role="alert">
          {error}
        </div>
      ) : null}

      <div
        className="agent-control__boundaries"
        aria-label="SAFE BETA ограничения"
      >
        <span aria-disabled="true">Публикация выключена</span>
        <span aria-disabled="true">Платные действия выключены · quota 0</span>
      </div>

      <div className="agent-control__grid">
        <article className="agent-control__card">
          <h3>
            <Sparkles size={16} /> Мой контент
          </h3>
          <p>
            Сначала сверяем профиль и статистику, затем сохраняем только draft.
          </p>
          <button
            type="button"
            onClick={diagnose}
            disabled={busy !== null || !registryReady}
          >
            {busy === 'diagnostics'
              ? 'Проверяю…'
              : 'Проверить профиль и статистику'}
          </button>
          <button
            type="button"
            className="agent-control__primary"
            onClick={preparePlan}
            disabled={busy !== null || !registryReady}
          >
            {busy === 'plan'
              ? 'Готовлю draft…'
              : 'Подготовить мой контент-план'}
          </button>
          {diagnostics ? (
            <div className="agent-control__result" role="status">
              <strong>
                @{diagnostics.username} · {diagnostics.published} моих
                публикаций
              </strong>
              <span>
                {diagnostics.reels} роликов · {diagnostics.views} просмотров ·{' '}
                {diagnostics.likes} реакций · {diagnostics.authors} автора
              </span>
            </div>
          ) : null}
          {plan ? (
            <div className="agent-control__success" role="status">
              <CheckCircle2 size={15} /> Черновик #
              {redactAgentStreamText(plan.id)} · публикация: нет · платные
              действия: нет
            </div>
          ) : null}
        </article>

        <article className="agent-control__card">
          <h3>
            <Cable size={16} /> Codex / Claude / внешний MCP
          </h3>
          <p>
            Встроенный агент работает через подтверждённую Telegram-сессию.{' '}
            {confirmedTools.length} / {SAFE_BETA_TOOL_NAMES.length} live tools
            подтверждены server registry.
          </p>
          <ul className="agent-control__tools">
            {confirmedTools.map(tool => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                <span>{toolLabel[tool.name as keyof typeof toolLabel]}</span>
              </li>
            ))}
          </ul>
          <CopyAgentButton />
        </article>
      </div>

      <section className="agent-control__activity">
        <h3>
          <Activity size={16} /> Activity владельца · только чтение
        </h3>
        <div className="agent-control__events" aria-live="polite">
          {safeActivity.length ? (
            safeActivity.map(event => (
              <div className="agent-control__event" key={event.id}>
                <span
                  className={`agent-control__dot agent-control__dot--${event.status}`}
                />
                <code>{event.toolName}</code>
                <span>
                  {event.status === 'completed'
                    ? 'готово'
                    : event.status === 'failed'
                      ? 'ошибка'
                      : 'в работе'}
                </span>
                {event.durationMs === undefined ? null : (
                  <small>{event.durationMs} мс</small>
                )}
              </div>
            ))
          ) : (
            <p>Безопасных действий в этой сессии пока нет.</p>
          )}
        </div>
      </section>
    </section>
  )
}

export default AgentControlCenter

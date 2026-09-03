import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAgentTools, type McpToolDescription } from '@/lib/agentMcp'
import {
  SAFE_BETA_TOOL_NAMES,
  isExactSafeBetaRegistry,
  selectSafeBetaTools,
} from '@/lib/agentControls'
import './AgentConnect.css'

const toolEffect = {
  whoami: 'read',
  feed_stats: 'read',
  content_plan_prepare: 'draft only',
} as const

export function AgentConnect() {
  const [tools, setTools] = useState<McpToolDescription[]>([])
  const [registryStatus, setRegistryStatus] = useState<
    'checking' | 'ready' | 'unavailable' | 'regression'
  >('checking')

  useEffect(() => {
    let active = true
    void listAgentTools()
      .then(discovered => {
        if (!active) return
        if (isExactSafeBetaRegistry(discovered)) {
          setTools(selectSafeBetaTools(discovered))
          setRegistryStatus('ready')
        } else {
          setTools([])
          setRegistryStatus('regression')
        }
      })
      .catch(() => {
        if (active) {
          setTools([])
          setRegistryStatus('unavailable')
        }
      })
    return () => {
      active = false
    }
  }, [])

  const registryMessage = (() => {
    switch (registryStatus) {
      case 'ready':
        return 'контракт registry подтверждён'
      case 'regression':
        return 'контракт registry не подтверждён; действия закрыты'
      case 'unavailable':
        return 'live registry доступен только после Telegram-входа'
      default:
        return 'проверяем live registry…'
    }
  })()

  return (
    <section className="agent-connect">
      <div className="agent-connect__inner">
        <div className="agent-connect__badge">MCP · SAFE BETA</div>
        <h2 className="agent-connect__title">Встроенный агент уже работает</h2>
        <p className="agent-connect__lead">
          Он видит только подтверждённый Telegram-профиль, читает его статистику
          и сохраняет контент-план только как черновик.
        </p>

        <div className="agent-connect__panel">
          <div className="agent-connect__panel-head">
            <span
              className={`agent-connect__dot ${
                registryStatus === 'ready' ? '' : 'agent-connect__dot--blocked'
              }`}
            />
            {tools.length} / {SAFE_BETA_TOOL_NAMES.length} live tools
          </div>
          <p className="agent-connect__registry-status" role="status">
            {registryMessage}
          </p>
          {registryStatus === 'ready' ? (
            <ul className="agent-connect__tools">
              {tools.map(tool => (
                <li key={tool.name}>
                  <code>{tool.name}</code>
                  <span>
                    {toolEffect[tool.name as keyof typeof toolEffect]}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="agent-connect__blocked">
            <strong>Внешнее MCP-подключение временно закрыто.</strong>
            <span>
              Оно появится только после защищённой личной выдачи и отзыва
              доступа. Сейчас Codex, Claude и другие внешние клиенты не
              подключаются.
            </span>
          </div>

          <div className="agent-connect__actions">
            <Link to="/chat" className="agent-connect__try">
              Открыть встроенного агента
            </Link>
          </div>
        </div>

        <p className="agent-connect__note">
          Публикация и траты в SAFE BETA отключены. Владельца определяет сервер,
          а не аргументы агента.
        </p>
      </div>
    </section>
  )
}

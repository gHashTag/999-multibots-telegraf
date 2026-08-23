import { useState } from 'react'
import { Link } from 'react-router-dom'
import './AgentConnect.css'

/**
 * Секция лендинга: агентный вайбрилс.
 *
 * Ядро продукта — агент, который делает рилсы. Подключить можно ЛЮБОГО:
 * встроенного в приложении или своего по MCP. Отсюда две кнопки:
 *  - «Попробовать агента» — во встроенный чат;
 *  - «Copy to agent» — копирует готовый промпт-инструкцию, которую человек
 *    вставляет своему агенту (Claude, свой скрипт, любой MCP-клиент), и тот
 *    сам подключается.
 *
 * Инструкция написана ДЛЯ АГЕНТА, а не для человека: короткая, с точным
 * адресом, порядком вызовов и честным списком того, чего сервис не умеет, —
 * чтобы агент не тратил витки на выяснение перебором.
 */

const MCP_URL = 'https://vibee-render-production.up.railway.app/mcp'

const AGENT_BRIEF = `Ты подключаешься к Trinity S³AI — сервису создания рилсов — по MCP.

Эндпоинт: ${MCP_URL}
Протокол: MCP поверх JSON-RPC 2.0.
Авторизация: заголовок X-Agent-Key: <КЛЮЧ>. Ключ выдаёт владелец на его
telegram_id; инструменты работают от его имени, чужой id подставить нельзя.

Начни так:
1. GET ${MCP_URL} — карточка подключения и список инструментов (без ключа).
2. POST с телом {"jsonrpc":"2.0","id":1,"method":"tools/list"} и заголовком
   X-Agent-Key — точные схемы инструментов.
3. Вызов: {"jsonrpc":"2.0","id":1,"method":"tools/call",
   "params":{"name":"feed_stats","arguments":{}}}

Инструменты: whoami, feed_stats, feed_list, feed_get (со слоями — для ремикса),
my_assets, templates_list, feed_publish (текст поста с хештегами обязателен).
Начинай с whoami и feed_stats — они бесплатны, мгновенны и ничего не меняют.

Чего сервис пока НЕ умеет: платных генераций (нет списания баланса),
публикации от чужого имени, удаления записей ленты.

Пример одной командой:
curl -s ${MCP_URL} -H 'X-Agent-Key: КЛЮЧ' -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"feed_stats","arguments":{}}}'`

export function AgentConnect() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_BRIEF)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Некоторые встраивания Telegram блокируют clipboard API. Тогда даём
      // человеку выделить текст руками — а не молча делаем вид, что скопировали.
      const ta = document.getElementById(
        'agent-brief'
      ) as HTMLTextAreaElement | null
      if (ta) {
        ta.focus()
        ta.select()
      }
    }
  }

  return (
    <section className="agent-connect">
      <div className="agent-connect__inner">
        <div className="agent-connect__badge">MCP · white-label</div>
        <h2 className="agent-connect__title">Подключи любого агента</h2>
        <p className="agent-connect__lead">
          Агент читает твою ленту, файлы и шаблоны и публикует рилсы за тебя.
          Встроенный — во вкладке «Агент». Свой — по MCP одной инструкцией.
        </p>

        <div className="agent-connect__panel">
          <div className="agent-connect__panel-head">
            <span className="agent-connect__dot" />
            инструкция для агента
          </div>
          <textarea
            id="agent-brief"
            className="agent-connect__code"
            readOnly
            value={AGENT_BRIEF}
            rows={12}
          />
          <div className="agent-connect__actions">
            <button className="agent-connect__copy" onClick={copy}>
              {copied ? '✓ Скопировано' : 'Copy to agent'}
            </button>
            <Link to="/chat" className="agent-connect__try">
              Попробовать агента
            </Link>
          </div>
        </div>

        <p className="agent-connect__note">
          Ключ выдаётся на твой telegram_id. Инструменты работают от твоего
          имени — чужой аккаунт не тронуть.
        </p>
      </div>
    </section>
  )
}

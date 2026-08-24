import { useState, useEffect, useRef, useCallback } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { Header } from '@/components/Header'
import { ChatAssets } from '@/components/Chat/ChatAssets'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import './Chat.css'

/**
 * Чат с агентом.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ ПЕРЕПИСАН ЦЕЛИКОМ. Прежняя версия была скриптованной
 * заглушкой: она сопоставляла ключевые слова во вводе и отдавала заранее
 * записанные ответы через setTimeout. Никакого сервера, никакой модели —
 * «агент» разговаривал сам с собой. Владелец назвал это фейком, и правильно.
 *
 * Теперь чат говорит с настоящим агентом на /api/agent/chat: модель glm-5.3
 * с доступом к инструментам приложения (лента, файлы, публикация). Ответ
 * приходит ПОТОКОМ (NDJSON), и человек видит работу: размышление, вызов
 * инструмента, его результат, текст — по мере поступления, а не после паузы.
 *
 * Поток читается сырым fetch, а не apiFetch: apiFetch разбирает тело как один
 * JSON, а здесь нужно читать построчно. Подпись initData ставит authHeaders —
 * тот же механизм, что у остальных запросов к серверу.
 */

interface ToolCall {
  name: string
  ms?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Поток размышления модели — сворачиваемый, показывается по желанию. */
  thinking?: string
  tools?: ToolCall[]
}

const SUGGESTIONS = [
  'Что уже есть в ленте?',
  'Покажи мои шаблоны',
  'Сколько у меня публикаций?',
  'Как опубликовать рилс?',
]

function ChatPage() {
  const { t } = useLanguage()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({})
  const [tokens, setTokens] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Баланс токенов — в шапке чата: человек видит цену генераций всегда,
  // а не после первой списанной. Бесплатный инструмент, те же заголовки,
  // что и чат.
  useEffect(() => {
    ;(async () => {
      try {
        const headers = authHeaders()
        const devKey = import.meta.env.DEV
          ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
          : undefined
        if (devKey && !headers.has('X-Telegram-Init-Data')) {
          headers.set('X-Agent-Key', devKey)
        }
        const res = await fetch(`${API_BASE}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'my_balance', arguments: {} },
          }),
        })
        const d = await res.json()
        const bal = d?.result?.structuredContent?.['баланс_токенов']
        if (typeof bal === 'number') setTokens(bal)
      } catch {
        /* баланс — украшение, а не блокировщик чата */
      }
    })()
  }, [])

  useEffect(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text:
          'Привет! Я агент Trinity S³AI. Я не просто отвечаю — я смотрю в приложение ' +
          'своими инструментами: читаю ленту, твои файлы и шаблоны, публикую рилсы.\n\n' +
          '💰 Цены: картинка — 1 токен, рилс — 1, озвучка — 6, видео — 20. ' +
          'Баланс виден вверху. Бесплатно: лента, файлы, SOUL, аналитика, публикация.\n\n' +
          'С чего начнём? Могу сразу сделать картинку за 1 токен — только скажи тему.',
      },
    ])
  }, [])

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || busy) return
      setBusy(true)
      setInput('')

      const userMsg: Message = {
        id: `u${Date.now()}`,
        role: 'user',
        text: text.trim(),
      }
      const agentId = `a${Date.now()}`
      const agentMsg: Message = {
        id: agentId,
        role: 'assistant',
        text: '',
        thinking: '',
        tools: [],
      }

      // История для сервера — из уже показанных сообщений плюс новое.
      const history = [...messages, userMsg]
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.text }))

      setMessages(prev => [...prev, userMsg, agentMsg])

      const patch = (fn: (m: Message) => Message) =>
        setMessages(prev => prev.map(m => (m.id === agentId ? fn(m) : m)))

      try {
        // Личность: обычно подпись Telegram (authHeaders ставит
        // X-Telegram-Init-Data). В DEV на localhost подписи нет — тогда, если
        // задан VITE_AGENT_KEY, идём ключом агента. Ветка ТОЛЬКО для
        // import.meta.env.DEV: ключ в прод-сборку не попадает, иначе он
        // оказался бы в браузерном бандле у всех.
        const headers = authHeaders()
        const devKey = import.meta.env.DEV
          ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
          : undefined
        if (devKey && !headers.has('X-Telegram-Init-Data')) {
          headers.set('X-Agent-Key', devKey)
        }
        const res = await fetch(`${API_BASE}/api/agent/chat`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ messages: history }),
        })
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => '')
          patch(m => ({
            ...m,
            text: `Не получилось: ${res.status}. ${body.slice(0, 200)}`,
          }))
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            let ev: Record<string, unknown>
            try {
              ev = JSON.parse(line)
            } catch {
              continue
            }
            const kind = ev['тип']
            if (kind === 'размышление') {
              patch(m => ({
                ...m,
                thinking: (m.thinking || '') + String(ev['текст'] || ''),
              }))
            } else if (kind === 'текст') {
              patch(m => ({ ...m, text: m.text + String(ev['текст'] || '') }))
            } else if (kind === 'инструмент') {
              patch(m => ({
                ...m,
                tools: [...(m.tools || []), { name: String(ev['имя']) }],
              }))
            } else if (kind === 'результат') {
              const nm = String(ev['имя'])
              const ms = Number(ev['мс'])
              patch(m => ({
                ...m,
                tools: (m.tools || []).map(tc =>
                  tc.name === nm && tc.ms == null ? { ...tc, ms } : tc
                ),
              }))
            } else if (kind === 'ошибка') {
              patch(m => ({
                ...m,
                text: m.text + `\n\n⚠️ ${String(ev['текст'] || '')}`,
              }))
            }
          }
        }
      } catch (e) {
        patch(m => ({
          ...m,
          text: `Сеть недоступна: ${String(e).slice(0, 160)}`,
        }))
      } finally {
        setBusy(false)
      }
    },
    [busy, messages]
  )

  return (
    <div className="chat-page">
      <Header />
      {/* Бренд (знак + Trinity S³AI) уже стоит в Header выше — здесь его
          не повторяем, иначе название дублируется на экране дважды. */}
      <div className="chat-title">
        <div className="chat-title__text">
          <h1>Агент</h1>
          <p>
            Смотрит в приложение своими инструментами и делает, а не советует
          </p>
          {tokens !== null && (
            <div className="chat-tokens">💰 {tokens} токенов</div>
          )}
        </div>
      </div>

      <div className="chat-container" ref={scrollRef}>
        <div className="chat-messages">
          {messages.map(m => (
            <div
              key={m.id}
              className={`message ${m.role === 'user' ? 'user' : 'agent'}`}
            >
              {m.thinking ? (
                <button
                  className="thinking-toggle"
                  onClick={() =>
                    setOpenThinking(s => ({ ...s, [m.id]: !s[m.id] }))
                  }
                >
                  {openThinking[m.id] ? '▾' : '▸'} размышление
                </button>
              ) : null}
              {m.thinking && openThinking[m.id] ? (
                <div className="thinking-body">{m.thinking}</div>
              ) : null}
              {m.tools && m.tools.length > 0 ? (
                <div className="tool-chips">
                  {m.tools.map((tc, i) => (
                    <span key={i} className="tool-chip">
                      ⚙ {tc.name}
                      {tc.ms != null ? ` · ${tc.ms}мс` : '…'}
                    </span>
                  ))}
                </div>
              ) : null}
              {/* Ассеты — живыми превью: картинка показывается картинкой,
                  видео плеером, аудио плеером. Голые ссылки не смотрятся. */}
              {m.text ? (
                <div className="message-content">
                  <ChatAssets text={m.text} />
                </div>
              ) : null}
              {!m.text && m.role === 'assistant' && busy ? (
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              ) : null}
            </div>
          ))}

          {messages.length <= 1 ? (
            <div className="suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="chat-input-area">
        <div className="chat-input-container">
          <input
            type="text"
            className="chat-input"
            placeholder={t('chat.messagePlaceholder')}
            value={input}
            disabled={busy}
            onChange={e => setInput(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && send(input)}
          />
          <button
            className="send-btn"
            onClick={() => send(input)}
            disabled={busy}
          >
            {busy ? '…' : t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPage

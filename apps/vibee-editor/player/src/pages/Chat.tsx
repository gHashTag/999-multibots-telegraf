import { useState, useEffect, useRef, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { agentMessagesAtom, agentDraftAtom } from '@/atoms/agentChat'
import { sendToAgent, agentBusyAtom } from '@/lib/agentStream'
import type { Message } from '@/atoms/agentChat'
import { useLanguage } from '@/hooks/useLanguage'
import { Header } from '@/components/Header'
import { ChatAssets } from '@/components/Chat/ChatAssets'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { Paperclip, X } from 'lucide-react'
import {
  uploadChatAttachment,
  validateAttachmentSelection,
  type AgentAttachment,
  type AgentAttachmentKind,
  type AttachmentRejectionReason,
} from '@/lib/chatAttachments'
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

// Форма сообщения переехала в atoms/agentChat.ts вместе с хранением: тип и
// его хранилище должны меняться в одном месте.

/** Приветствие вынесено из эффекта: его ставят и при первом входе, и по
 *  кнопке «Новый разговор». Две копии одного текста разошлись бы. */
const WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Привет! Я агент Trinity S³AI. Я не просто отвечаю — я смотрю в приложение ' +
    'своими инструментами: читаю ленту, твои файлы и шаблоны, публикую рилсы.\n\n' +
    '💰 Цены: картинка — 1 токен, рилс — 1, озвучка — 6, видео — 20. ' +
    'Баланс виден вверху. Бесплатно: лента, файлы, SOUL, аналитика, публикация.\n\n' +
    // ЗДЕСЬ БЫЛО ОБЕЩАНИЕ: «Могу сразу сделать картинку за 1 токен — только
    // скажи тему». Замер 2026-08-26: у FAL кончился баланс, картинки не
    // выходят вовсе. То есть первый же текст, который человек читает, врал —
    // и узнавал он об этом, потратив ход.
    //
    // Инструменты агента я научил проверять providers_status перед обещанием
    // (PR #717), но приветствие — не его ответ, а статичная строка, и она
    // проверок не делает. Поэтому она больше ничего не обещает: спрашивает.
    // Что доступно, агент выяснит и скажет сам, когда человек ответит.
    'С чего начнём? Скажи, что хочешь получить — я проверю, что из этого ' +
    'работает прямо сейчас, и сделаю.',
}

/**
 * ЧЕТЫРЕ ПЕРВЫХ ВОПРОСА — ЭТО ВИТРИНА ВОЗМОЖНОСТЕЙ АГЕНТА.
 *
 * Прежние («Что уже есть в ленте?», «Покажи мои шаблоны», «Сколько у меня
 * публикаций?», «Как опубликовать рилс?») не менялись с первого дня. Три из
 * четырёх спрашивали ЧИСЛА, четвёртый — инструкцию. Ни один не вёл к работе,
 * и ни один не знал про то, что у агента появилось с тех пор: контент-план,
 * SOUL, проверка провайдеров.
 *
 * Человек читает эти кнопки как ответ на вопрос «а что ты вообще умеешь».
 * Значит они должны показывать умения, а не счётчики.
 *
 * Порядок намеренный: сначала «что работает» — потому что у FAL кончился
 * баланс, и честнее узнать это до того, как что-то заказывать.
 */
const SUGGESTIONS = [
  'Что сейчас работает, а что нет?',
  'Покажи мой контент-план',
  'Что мне снять дальше — предложи три темы',
  'Что ты знаешь обо мне?',
]

interface AttachmentDraft {
  localId: string
  kind: AgentAttachmentKind
  name: string
  size: number
  previewUrl: string
  status: 'uploading' | 'ready' | 'error'
  attachment?: AgentAttachment
  controller: AbortController
}

function ChatPage() {
  const { t } = useLanguage()
  // Переписка и черновик — в атомах с хранилищем, а не в useState: страница
  // размонтируется при переключении вкладки, и разговор пропадал вместе с ней.
  const [messages, setMessages] = useAtom(agentMessagesAtom)
  const [input, setInput] = useAtom(agentDraftAtom)
  // Занятость — в атоме: она принадлежит разговору, а не странице.
  const busy = useAtomValue(agentBusyAtom)
  const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({})
  const [tokens, setTokens] = useState<number | null>(null)
  const [topUp, setTopUp] = useState(false)
  const [topUpNote, setTopUpNote] = useState<string | null>(null)
  const [attachmentDrafts, setAttachmentDrafts] = useState<AttachmentDraft[]>(
    []
  )
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef(new Set<string>())
  const uploadControllersRef = useRef(new Map<string, AbortController>())

  useEffect(
    () => () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url)
      previewUrlsRef.current.clear()
      for (const controller of uploadControllersRef.current.values()) {
        controller.abort()
      }
      uploadControllersRef.current.clear()
    },
    []
  )

  const rejectionText = useCallback(
    (reason: AttachmentRejectionReason): string => {
      if (reason === 'too-large') return t('chat.attachmentTooLarge')
      if (reason === 'too-many') return t('chat.attachmentTooMany')
      return t('chat.attachmentUnsupported')
    },
    [t]
  )

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const files = Array.from(incoming)
      if (!files.length) return
      const { accepted, rejected } = validateAttachmentSelection(
        files,
        attachmentDrafts.length
      )
      if (rejected.length) {
        setAttachmentError(
          [...new Set(rejected.map(item => rejectionText(item.reason)))].join(
            ' '
          )
        )
      } else {
        setAttachmentError(null)
      }

      accepted.forEach(({ file, kind }, index) => {
        const localId = `pending-${Date.now()}-${index}-${Math.random()
          .toString(36)
          .slice(2, 7)}`
        const previewUrl = URL.createObjectURL(file)
        const controller = new AbortController()
        previewUrlsRef.current.add(previewUrl)
        uploadControllersRef.current.set(localId, controller)
        setAttachmentDrafts(prev => [
          ...prev,
          {
            localId,
            kind,
            name: file.name,
            size: file.size,
            previewUrl,
            status: 'uploading',
            controller,
          },
        ])

        void uploadChatAttachment(file, kind, controller.signal)
          .then(attachment => {
            uploadControllersRef.current.delete(localId)
            setAttachmentDrafts(prev =>
              prev.map(item =>
                item.localId === localId
                  ? { ...item, status: 'ready', attachment }
                  : item
              )
            )
          })
          .catch(() => {
            uploadControllersRef.current.delete(localId)
            if (controller.signal.aborted) return
            setAttachmentDrafts(prev =>
              prev.map(item =>
                item.localId === localId ? { ...item, status: 'error' } : item
              )
            )
            setAttachmentError(t('chat.attachmentUploadFailed'))
          })
      })
    },
    [attachmentDrafts.length, rejectionText, t]
  )

  const removeAttachment = useCallback((localId: string) => {
    setAttachmentDrafts(prev => {
      const removed = prev.find(item => item.localId === localId)
      if (removed) {
        removed.controller.abort()
        uploadControllersRef.current.delete(localId)
        URL.revokeObjectURL(removed.previewUrl)
        previewUrlsRef.current.delete(removed.previewUrl)
      }
      return prev.filter(item => item.localId !== localId)
    })
  }, [])

  const clearAttachments = useCallback(() => {
    for (const item of attachmentDrafts) {
      item.controller.abort()
      uploadControllersRef.current.delete(item.localId)
      URL.revokeObjectURL(item.previewUrl)
      previewUrlsRef.current.delete(item.previewUrl)
    }
    setAttachmentDrafts([])
    setAttachmentError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [attachmentDrafts])

  // Пополнение: инвойс создаёт сервер (XTR), открывает Telegram.WebApp.
  // Серверной верификацией занимается вебхук кассира — клиенту не верим.
  const buy = async (pack: string) => {
    setTopUpNote(null)
    try {
      const headers = authHeaders()
      const devKey = import.meta.env.DEV
        ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
        : undefined
      if (devKey && !headers.has('X-Telegram-Init-Data')) {
        headers.set('X-Agent-Key', devKey)
      }
      const res = await fetch(`${API_BASE}/api/tokens/invoice`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ pack }),
      })
      const d = await res.json()
      if (!d.ok) {
        setTopUpNote(String(d.error ?? 'не получилось'))
        return
      }
      const wa = window.Telegram?.WebApp
      if (wa?.openInvoice) {
        wa.openInvoice(d.link, async (status: string) => {
          if (status === 'paid') {
            setTopUpNote('Оплачено! Проверяю зачисление…')
            // Верификация по первоисточнику (getStarTransactions):
            // вебхук может спать, звёзды — не спят.
            try {
              const vres = await fetch(`${API_BASE}/api/tokens/verify`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ pack }),
              })
              const vd = await vres.json()
              if (vd.ok) {
                setTokens(vd['баланс'])
                setTopUpNote(
                  `Зачислено ${vd['зачислено_токенов']} токенов! Баланс: ${vd['баланс']}`
                )
              } else {
                setTopUpNote(
                  'Оплата прошла — проверяю зачисление ещё пару раз…'
                )
                // Транзакция звёзд появляется в Bot API с задержкой:
                // держим обещание реальными повторами, а не пустым таймером.
                for (let attempt = 0; attempt < 3; attempt++) {
                  await new Promise(r => setTimeout(r, 25_000))
                  try {
                    const r2 = await fetch(`${API_BASE}/api/tokens/verify`, {
                      method: 'POST',
                      headers,
                    })
                    const vd2 = await r2.json()
                    if (vd2?.ok) {
                      setTokens(vd2['баланс'])
                      setTopUpNote(
                        `Зачислено ${vd2['зачислено_токенов']} токенов! Баланс: ${vd2['баланс']}`
                      )
                      return
                    }
                  } catch {
                    /* сеть шалит — следующая попытка через 25с */
                  }
                }
                setTopUpNote(
                  'Оплата видна Telegram — зачисление догонит при следующем входе в чат'
                )
              }
            } catch {
              setTopUpNote('Оплата прошла — зачисление подтвердится чуть позже')
            }
          } else if (status === 'failed') {
            setTopUpNote('Оплата не прошла')
          }
        })
      } else {
        setTopUpNote('Покупка доступна внутри Telegram')
      }
    } catch {
      setTopUpNote('сеть подвела — попробуй ещё')
    }
  }

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

        // Вебхук кассира периодически спит (бот живёт в polling у бэкенда),
        // и оплата, совершённая «мимо» verify, повисала бы незачисленной.
        // Тихий фоновый verify при входе: гасит забытые инвойсы прошлого
        // визита по первоисточнику getStarTransactions.
        try {
          const vres = await fetch(`${API_BASE}/api/tokens/verify`, {
            method: 'POST',
            headers,
          })
          const vd = await vres.json()
          if (vd?.ok) {
            setTokens(vd['баланс'])
            setTopUpNote(
              `Зачислено ${vd['зачислено_токенов']} токенов — оплата прошлого визита дошла`
            )
          }
        } catch {
          /* авто-verify — фоновый, тишина нормальна */
        }
      } catch {
        /* баланс — украшение, а не блокировщик чата */
      }
    })()
  }, [])

  // Приветствие — ТОЛЬКО в пустой чат. Раньше эффект писал его безусловно на
  // каждом монтировании; теперь, когда история переживает уход со страницы,
  // это стирало бы разговор при каждом возврате.
  useEffect(() => {
    if (messages.length > 0) return
    setMessages([WELCOME])
    // Один раз на монтировании: messages читается ради проверки «пусто ли»,
    // в зависимостях ему делать нечего — иначе эффект пересчитается на каждое
    // новое сообщение.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Прокрутка вниз — только когда есть за чем гнаться.
   *
   * Эффект срабатывал и на самом первом рендере, где сообщение всего одно:
   * приветствие агента. Оно длиннее экрана, и прокрутка вниз прятала его
   * НАЧАЛО. Замер на 375×812: scrollTop 48 при переполнении ровно в 48 —
   * человек, впервые открывший вкладку, читал текст с середины фразы.
   *
   * Приветствие — это единственное сообщение, у которого важно начало:
   * дальше в чате важен конец, потому что там свежий ответ. Поэтому условие
   * не «первый рендер», а «сообщений больше одного».
   */
  useEffect(() => {
    if (messages.length <= 1) return
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  /**
   * Отправка ушла в модуль вне React — src/lib/agentStream.ts.
   *
   * Раньше поток жил здесь, внутри страницы: уход на другую вкладку
   * размонтирует её, и `fetch` умирал вместе с ней. Человек писал задание,
   * шёл посмотреть ленту и возвращался к оборванному ответу, даже когда
   * сервер честно досчитал. Теперь страница только зовёт и читает стор.
   */
  const send = useCallback(
    (text: string) => {
      if (attachmentDrafts.some(item => item.status === 'uploading')) return
      const attachments = attachmentDrafts.flatMap(item =>
        item.status === 'ready' && item.attachment ? [item.attachment] : []
      )
      if (!text.trim() && !attachments.length) return
      void sendToAgent(text, attachments)
      setInput('')
      clearAttachments()
    },
    [attachmentDrafts, clearAttachments, setInput]
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
          {/* Переписка теперь переживает уход со страницы — значит нужен и
              способ её закончить. Без этой кнопки старый разговор оставался
              бы на экране навсегда. */}
          {messages.length > 1 && (
            <button
              className="chat-reset"
              onClick={() => {
                setMessages([WELCOME])
                setInput('')
                clearAttachments()
              }}
            >
              Новый разговор
            </button>
          )}
          {tokens !== null && (
            <button className="chat-tokens" onClick={() => setTopUp(v => !v)}>
              💰 {tokens} токенов · пополнить
            </button>
          )}
          {topUp && (
            <div className="chat-topup">
              {/* Якорная психология (2026): большой пакет первым — средний
                  на его фоне выглядит выгодным. 150: 1.17⭐/ток против 1.5
                  у десятки — честный «выгоднее всех», не маркетинговый. */}
              {[150, 50, 10].map(p => (
                <button
                  key={p}
                  className="chat-topup__pack"
                  onClick={() => buy(String(p))}
                >
                  {p} токенов{p === 150 ? ' · выгоднее всех' : ''}
                  <span>
                    {p === 10 ? '15 ⭐' : p === 50 ? '65 ⭐' : '175 ⭐'}
                  </span>
                </button>
              ))}
              {topUpNote && <p className="chat-topup__note">{topUpNote}</p>}
            </div>
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
                  <ChatAssets text={m.text} attachments={m.attachments} />
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
        {attachmentDrafts.length > 0 && (
          <div
            className="chat-attachment-list"
            aria-label={t('chat.attachments')}
          >
            {attachmentDrafts.map(item => (
              <div
                key={item.localId}
                className={`chat-attachment chat-attachment--${item.status}`}
              >
                {item.kind === 'image' ? (
                  <img src={item.previewUrl} alt="" />
                ) : (
                  <video
                    src={item.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                  />
                )}
                <div className="chat-attachment__meta">
                  <span title={item.name}>{item.name}</span>
                  <small>
                    {item.status === 'uploading'
                      ? t('chat.attachmentUploading')
                      : item.status === 'ready'
                        ? t('chat.attachmentReady')
                        : t('chat.attachmentFailed')}
                  </small>
                </div>
                <button
                  type="button"
                  className="chat-attachment__remove"
                  onClick={() => removeAttachment(item.localId)}
                  aria-label={`${t('chat.attachmentRemove')}: ${item.name}`}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        {attachmentError && (
          <p className="chat-attachment-error" role="status">
            {attachmentError}
          </p>
        )}
        <div className="chat-input-container">
          <input
            ref={fileInputRef}
            type="file"
            className="chat-file-input"
            accept="image/*,video/*"
            multiple
            aria-hidden="true"
            tabIndex={-1}
            onChange={event => {
              if (event.target.files) addFiles(event.target.files)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="chat-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy || attachmentDrafts.length >= 4}
            aria-label={t('chat.addAttachment')}
            title={t('chat.addAttachment')}
          >
            <Paperclip size={21} aria-hidden="true" />
          </button>
          <input
            type="text"
            className="chat-input"
            placeholder={t('chat.messagePlaceholder')}
            value={input}
            disabled={busy}
            onChange={e => setInput(e.target.value)}
            onPaste={event => {
              if (event.clipboardData.files.length) {
                event.preventDefault()
                addFiles(event.clipboardData.files)
              }
            }}
            onKeyDown={e => e.key === 'Enter' && send(input)}
          />
          <button
            className="send-btn"
            onClick={() => send(input)}
            disabled={
              busy ||
              attachmentDrafts.some(item => item.status === 'uploading') ||
              (!input.trim() &&
                !attachmentDrafts.some(item => item.status === 'ready'))
            }
          >
            {busy ? '…' : t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatPage

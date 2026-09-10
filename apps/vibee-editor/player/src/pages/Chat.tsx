import { useState, useEffect, useRef, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { agentMessagesAtom, agentDraftAtom } from '@/atoms/agentChat'
import { sendToAgent, agentBusyAtom, isAgentBusy } from '@/lib/agentStream'
import {
  shouldAdoptHistory,
  adoptHistory,
  turnsFromResponse,
  surfaceLabel,
} from '@/lib/agentHistory'
import type {
  AgentAttachment,
  AgentAttachmentKind,
  Message,
} from '@/atoms/agentChat'
import { useLanguage } from '@/hooks/useLanguage'
import { Header } from '@/components/Header'
import { ChatAssets } from '@/components/Chat/ChatAssets'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { uploadToS3 } from '@/lib/s3Upload'
import { toAbsoluteUrl } from '@/lib/mediaUrl'
import { reportPayOutcome } from '@/lib/payOutcome'
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
    // THE SAME LESSON AS THE PROMISE BELOW, AND IT COST MORE. This line
    // spelled out four prices by hand -- 1 / 1 / 6 / 20 -- and every one was
    // half of what the server charges: the owner's markup reached the charge
    // and never reached this greeting. A static string cannot know a price,
    // so it no longer names one -- the balance in the header and the price on
    // each button come from the server, and the agent quotes my_balance.
    '💰 Платные — генерации: картинка, рилс, озвучка, видео. Цена каждой ' +
    'стоит на её кнопке, баланс виден вверху, а точный прайс я назову ' +
    'по первому вопросу. Бесплатно: лента, файлы, SOUL, аналитика, ' +
    'публикация.\n\n' +
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
  const [attachments, setAttachments] = useState<AgentAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const wa = (window as any).Telegram?.WebApp
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
              } else if (vd['зачисление_провалено']) {
                // Not "not visible yet" but "not credited": the invoice is
                // already marked redeemed, so a retry cannot find it again.
                // Promising it will catch up here is the same lie this
                // change repairs one layer down.
                setTokens(vd['баланс'] ?? null)
                setTopUpNote(
                  'Оплата прошла, но токены не зачислены. Мы уже знаем — напишите в поддержку, вернём или начислим руками.'
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
                reportPayOutcome('tokens', 'pending')
              }
            } catch {
              setTopUpNote('Оплата прошла — зачисление подтвердится чуть позже')
            }
          } else if (status === 'failed') {
            setTopUpNote('Оплата не прошла')
            reportPayOutcome('tokens', 'failed')
          } else if (status === 'cancelled') {
            reportPayOutcome('tokens', 'cancelled')
          }
        })
      } else {
        setTopUpNote('Покупка доступна внутри Telegram')
        reportPayOutcome('tokens', 'unsupported')
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

  /**
   * ОБЩИЙ РАЗГОВОР: история подтягивается С СЕРВЕРА, а не только из браузера.
   *
   * До этого переписка жила целиком в localStorage: почистил браузер, сменил
   * устройство или открыл мини-апп из другого клиента Telegram — разговора
   * нет. Теперь сервер хранит его сам (`agent_messages`), и обе поверхности —
   * бот и мини-апп — читают одно место.
   *
   * ПРАВИЛО СЛИЯНИЯ НАМЕРЕННО ПРОСТОЕ: сервер выигрывает, если ему есть что
   * сказать. Он записывает каждый виток с любой поверхности, значит он полнее
   * по построению. Пустой ответ сервера НЕ затирает местную историю — иначе
   * первый же заход после выкладки стёр бы разговор, которого сервер ещё не
   * видел.
   *
   * Локальное хранилище остаётся: оно рисует переписку мгновенно, до ответа
   * сети, и работает, когда сети нет.
   */
  useEffect(() => {
    let alive = true

    /*
     * REFRESHED ON EVERY RETURN TO THE TAB, NOT ONLY ON MOUNT.
     *
     * This used to run once, with an empty dependency list. A turn written in
     * the bot while this tab stayed open never appeared here -- and, worse,
     * never reached the model, because the next request carries THIS page's
     * transcript. The symptom reads as the agent being stupid: you tell the
     * bot something, switch to the app, ask a follow-up, and it has no idea.
     *
     * `isAgentBusy()` is read at call time rather than the `busy` value from
     * render: this effect never re-runs, so a captured `busy` would be stale
     * forever and the guard would be decorative.
     */
    const refresh = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden'
      ) {
        return
      }
      fetch(`${API_BASE}/api/agent/history?limit=100`, {
        headers: authHeaders(),
      })
        .then(response => (response.ok ? response.json() : null))
        .then(body => {
          if (!alive) return
          const server = turnsFromResponse(body)
          setMessages(local =>
            shouldAdoptHistory({ server, local, busy: isAgentBusy() })
              ? adoptHistory(server)
              : local
          )
        })
        .catch(() => {
          // Silent ON PURPOSE: an unreachable history must not stand between a
          // person and writing a new message. The local copy is already shown.
        })
    }

    refresh()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
    // Mount once; the listeners above carry every later refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if ((!text.trim() && attachments.length === 0) || uploading) return
      void sendToAgent(text, attachments)
      setInput('')
      setAttachments([])
      setAttachmentError(null)
    },
    [attachments, setInput, uploading]
  )

  const uploadAttachments = useCallback(
    async (files: FileList | null) => {
      const selected = Array.from(files ?? []).slice(
        0,
        Math.max(0, 4 - attachments.length)
      )
      if (selected.length === 0) return
      setUploading(true)
      setAttachmentError(null)
      const uploaded: AgentAttachment[] = []
      try {
        for (const file of selected) {
          if (file.size > 100 * 1024 * 1024) {
            throw new Error(`${file.name}: максимум 100 МБ`)
          }
          /*
           * Имя файла остаётся в сообщении, но теперь рядом с ПРИЧИНОЙ.
           * «photo_….jpeg: загрузка не удалась» одинаково звучало и при
           * отказе в доступе, и при лопнувшей сети — по такому тексту
           * чинить нечего.
           */
          const url = await uploadToS3(file, file.name).catch(e => {
            throw new Error(
              `${file.name}: ${e instanceof Error ? e.message : String(e)}`
            )
          })
          if (!url) throw new Error(`${file.name}: сервер не вернул адрес`)
          const kind: AgentAttachmentKind = file.type.startsWith('image/')
            ? 'image'
            : file.type.startsWith('video/')
              ? 'video'
              : file.type.startsWith('audio/')
                ? 'audio'
                : 'file'
          uploaded.push({
            id: `attachment-${Date.now()}-${uploaded.length}`,
            name: file.name,
            url: toAbsoluteUrl(url),
            mimeType: file.type || 'application/octet-stream',
            kind,
          })
        }
        setAttachments(current => [...current, ...uploaded].slice(0, 4))
      } catch (error) {
        setAttachmentError(
          error instanceof Error ? error.message : 'Файл не загрузился'
        )
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [attachments.length]
  )

  return (
    <div className="chat-page">
      <Header />
      {/* Бренд (знак + Trinity S³AI) уже стоит в Header выше — здесь его
          не повторяем, иначе название дублируется на экране дважды. */}
      {/* The greeting lives in the list as the agent's first message and
          scrolls away with it; the toolbar keeps only the two controls. */}
      <div className="chat-toolbar">
        {/* Переписка теперь переживает уход со страницы — значит нужен и
          способ её закончить. Без этой кнопки старый разговор оставался
          бы на экране навсегда. */}
        {messages.length > 1 && (
          <button
            className="chat-reset"
            onClick={() => {
              /*
               * «Начать заново» ТЕПЕРЬ ЧИСТИТ И СЕРВЕР.
               *
               * Раньше кнопка стирала только память браузера, а общий
               * разговор оставался на сервере — человек нажимал «новый», а
               * агент продолжал помнить всё прошлое. Обещание, которого
               * интерфейс не выполнял; с появлением общей памяти оно стало
               * ещё заметнее: разговор возвращался при следующем открытии.
               *
               * Экран очищаем СРАЗУ, не дожидаясь сети: нажатие должно
               * ощущаться мгновенно. Отказ сервера при этом не молчаливый —
               * он виден в консоли, а следующий заход покажет, что история
               * вернулась, и это честнее, чем ложное «очищено».
               */
              setMessages([WELCOME])
              setInput('')
              setAttachments([])
              fetch(`${API_BASE}/api/agent/history`, {
                method: 'DELETE',
                headers: authHeaders(),
              }).catch(e => console.error('[chat] очистка на сервере:', e))
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
      <div className="chat-container" ref={scrollRef}>
        <div className="chat-messages">
          {messages.map(m => (
            <div
              key={m.id}
              className={`message ${m.role === 'user' ? 'user' : 'agent'}`}
            >
              {/*
               * WHERE THIS TURN CAME FROM, when it was not here.
               *
               * One conversation spans the bot, this app and the phone, so a
               * reply can answer a question that was never typed on this
               * screen. Without the caption the transcript looks like the
               * agent answering itself.
               *
               * Only OTHER surfaces are named: labelling every local bubble
               * "from the mini app" is noise, and noise is what stops people
               * reading the captions that matter.
               */}
              {surfaceLabel(m.surface) ? (
                <span className="message-surface">
                  {surfaceLabel(m.surface)}
                </span>
              ) : null}
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
              {m.text || (m.attachments?.length ?? 0) > 0 ? (
                <div className="message-content">
                  {m.text ? <ChatAssets text={m.text} /> : null}
                  {m.attachments && m.attachments.length > 0 ? (
                    <div className="message-attachments">
                      {m.attachments.map(attachment => (
                        <div className="message-attachment" key={attachment.id}>
                          <ChatAssets text={attachment.url} />
                          <span>{attachment.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
        {attachments.length > 0 || attachmentError ? (
          <div className="chat-attachment-tray">
            {attachments.map(attachment => (
              <span className="chat-attachment-chip" key={attachment.id}>
                {attachment.kind === 'image'
                  ? '🖼'
                  : attachment.kind === 'video'
                    ? '🎬'
                    : attachment.kind === 'audio'
                      ? '🎧'
                      : '📎'}{' '}
                {attachment.name}
                <button
                  type="button"
                  aria-label={`Убрать ${attachment.name}`}
                  onClick={() =>
                    setAttachments(current =>
                      current.filter(item => item.id !== attachment.id)
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {attachmentError ? (
              <span className="chat-attachment-error">{attachmentError}</span>
            ) : null}
          </div>
        ) : null}
        <div className="chat-input-container">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,audio/*"
            multiple
            className="chat-file-input"
            aria-hidden="true"
            tabIndex={-1}
            onChange={event => void uploadAttachments(event.target.files)}
          />
          <button
            type="button"
            className="attach-btn"
            aria-label="Добавить фото, видео или аудио"
            title="Добавить фото, видео или аудио"
            disabled={busy || uploading || attachments.length >= 4}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? '…' : '+'}
          </button>
          <input
            type="text"
            className="chat-input"
            placeholder={t('chat.messagePlaceholder')}
            value={input}
            disabled={busy}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send(input)}
            onFocus={() => {
              // The keyboard shrinks the list; keep the latest message in view.
              window.setTimeout(() => {
                if (scrollRef.current)
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight
              }, 350)
            }}
          />
          <button
            className="send-btn"
            onClick={() => send(input)}
            disabled={
              busy || uploading || (!input.trim() && attachments.length === 0)
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

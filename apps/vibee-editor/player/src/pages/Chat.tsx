import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAtom, useAtomValue } from 'jotai'
import { agentMessagesAtomFor, agentDraftAtom } from '@/atoms/agentChat'
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
import { useTokenTopUp } from '@/hooks/useTokenTopUp'
import { Header } from '@/components/Header'
import { ChatAssets } from '@/components/Chat/ChatAssets'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { uploadToS3 } from '@/lib/s3Upload'
import { toAbsoluteUrl } from '@/lib/mediaUrl'
import { reportPayOutcome } from '@/lib/payOutcome'
import { parseCards, cardStates, answerFor } from '@/lib/agentCards'
import { AgentCards } from '@/components/Chat/AgentCards'
import { ChatThreads } from '@/components/Chat/ChatThreads'
import { liveMarketplaceAgentById } from '../../../packages/vibee-atoms/src/agent-marketplace'
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

/**
 * WHICH THREAD THIS SCREEN SHOWS.
 *
 * `/chat` is the person's own thread and behaves exactly as before. On
 * `/crm/:clientId/chat` the same screen shows the thread ABOUT one client:
 * its own storage key, `?client=` on history reads and clears, `client` in
 * the chat request. The owner asked for this in one sentence -- every client
 * was landing in one place -- and the split is the whole feature.
 *
 * The thread is a `key` on the inner component, so moving from one client to
 * another remounts it: the mount-once effects below (history fetch, greeting)
 * then run for the new thread instead of keeping the old one on screen.
 */
/**
 * First questions ABOUT a client. They point at the client's data -- profile,
 * plan, last DMs -- not at the agent's general abilities.
 */
const CLIENT_SUGGESTIONS = [
  'Что мы знаем об этом клиенте?',
  'Где он в контент-плане и что снять дальше?',
  'Что ответить ему следующим сообщением?',
]

const BLOGGER_WELCOME: Message = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Я Блогер T27 — первый рабочий агент на бирже. Найду подтверждённую работу, ' +
    'о которой ещё не писал блог, соберу полные EN/RU версии, триптих, ' +
    'хештеги, офер и адаптации для X, LinkedIn и Telegram.\n\n' +
    'Сначала покажу доказательства и пробел в публикациях. Внешние публикации ' +
    'делаю только после явного подтверждения, а в конце возвращаю живые ссылки.',
}

const BLOGGER_SUGGESTIONS = [
  'Что сильного уже сделано, но ещё не опубликовано?',
  'Собери следующий пост EN/RU с хештегами и офером',
  'Проверь блог: где нет триптиха или полного текста?',
  'Подготовь контент-план для X, LinkedIn и Telegram',
]

function ChatPage() {
  const { clientId, agentId } = useParams<{
    clientId?: string
    agentId?: string
  }>()
  const client = clientId && /^\d{5,15}$/.test(clientId) ? clientId : null
  const marketplaceAgent = agentId
    ? (liveMarketplaceAgentById(agentId)?.id ?? null)
    : null
  if (agentId && !marketplaceAgent) return <Navigate to="/agents" replace />
  return (
    <ChatThread
      key={client ?? marketplaceAgent ?? 'self'}
      client={client}
      marketplaceAgent={marketplaceAgent}
    />
  )
}

/** The query-string suffix that names one isolated thread, or nothing for self. */
const threadQuery = (
  client: string | null,
  marketplaceAgent: string | null,
  first: boolean
) => {
  const key = client ? 'client' : marketplaceAgent ? 'agent' : null
  const value = client || marketplaceAgent
  return key && value
    ? `${first ? '?' : '&'}${key}=${encodeURIComponent(value)}`
    : ''
}

function ChatThread({
  client,
  marketplaceAgent,
}: {
  client: string | null
  marketplaceAgent: string | null
}) {
  const { t } = useLanguage()
  // Переписка и черновик — в атомах с хранилищем, а не в useState: страница
  // размонтируется при переключении вкладки, и разговор пропадал вместе с ней.
  const messagesAtom = useMemo(
    () => agentMessagesAtomFor(client, marketplaceAgent),
    [client, marketplaceAgent]
  )
  const [messages, setMessages] = useAtom(messagesAtom)
  const [input, setInput] = useAtom(agentDraftAtom)
  // The greeting of a client thread is short and names the client: the long
  // self greeting sells the agent, which the owner has already bought.
  const welcome: Message = useMemo(
    () =>
      client
        ? {
            id: 'welcome',
            role: 'assistant',
            text: t('crm.client.chat.welcome', { id: client }),
          }
        : marketplaceAgent === 'blogger'
          ? BLOGGER_WELCOME
          : WELCOME,
    [client, marketplaceAgent, t]
  )
  // Занятость — в атоме: она принадлежит разговору, а не странице.
  const busy = useAtomValue(agentBusyAtom)
  const [openThinking, setOpenThinking] = useState<Record<string, boolean>>({})
  const [topUp, setTopUp] = useState(false)
  /*
   * The balance and the buy flow moved to useTokenTopUp so the PROFILE can use
   * the same one. A second copy is how one of the two quietly stops verifying.
   */
  const { tokens, note: topUpNote, buy } = useTokenTopUp()
  const [attachments, setAttachments] = useState<AgentAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      fetch(
        `${API_BASE}/api/agent/history?limit=100${threadQuery(client, marketplaceAgent, false)}`,
        {
          headers: authHeaders(),
        }
      )
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
    setMessages([welcome])
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
      void sendToAgent(text, attachments, {
        client,
        agent: marketplaceAgent,
      })
      setInput('')
      setAttachments([])
      setAttachmentError(null)
    },
    [attachments, client, marketplaceAgent, setInput, uploading]
  )

  /*
   * THE AGENT'S PROPOSALS AS CARDS (lib/agentCards.ts). Only the latest
   * answer's cards can be pressed, and not while the agent is still
   * answering; a press is sent as the person's own message.
   */
  let lastAnswer = -1
  messages.forEach((m, i) => {
    if (m.role === 'assistant') lastAnswer = i
  })
  const cardsOf = (text: string, idx: number) => {
    const { cards } = parseCards(text)
    if (cards.length === 0) return null
    const later = messages
      .slice(idx + 1)
      .filter(x => x.role === 'user')
      .map(x => x.text || '')
    return (
      <AgentCards
        cards={cards}
        states={cardStates(cards, later)}
        actionable={idx === lastAnswer && !busy}
        onAnswer={(chosen, approve) => send(answerFor(chosen, approve))}
      />
    )
  }

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
      <ChatThreads current={client} />
      {/* Бренд (знак + Trinity S³AI) уже стоит в Header выше — здесь его
          не повторяем, иначе название дублируется на экране дважды. */}
      {/* The greeting lives in the list as the agent's first message and
          scrolls away with it; the toolbar keeps only the two controls. */}
      {client ? (
        <nav
          className="chat-client"
          aria-label={t('crm.client.chat.title', { id: client })}
        >
          <Link to={`/crm/${client}`} className="chat-client__back">
            ← {t('crm.client.chat.back')}
          </Link>
          <span className="chat-client__title">
            {t('crm.client.chat.title', { id: client })}
          </span>
        </nav>
      ) : null}
      {marketplaceAgent ? (
        <nav className="chat-specialist" aria-label="Блогер T27">
          <Link to="/agents" className="chat-specialist__back">
            {'← Биржа агентов'}
          </Link>
          <span>
            <i /> {'Блогер · работает'}
          </span>
        </nav>
      ) : null}
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
              // In a client thread this clears THAT thread only: the
              // `?client=` names it, and the server never touches the self
              // thread on a scoped delete.
              setMessages([welcome])
              setInput('')
              setAttachments([])
              fetch(
                `${API_BASE}/api/agent/history${threadQuery(client, marketplaceAgent, true)}`,
                {
                  method: 'DELETE',
                  headers: authHeaders(),
                }
              ).catch(e => console.error('[chat] очистка на сервере:', e))
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
          {messages.map((m, idx) => (
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
                  {m.text ? (
                    <ChatAssets
                      text={
                        m.role === 'assistant'
                          ? parseCards(m.text).text
                          : m.text
                      }
                    />
                  ) : null}
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
              {m.role === 'assistant' ? cardsOf(m.text || '', idx) : null}
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
              {(client
                ? CLIENT_SUGGESTIONS
                : marketplaceAgent === 'blogger'
                  ? BLOGGER_SUGGESTIONS
                  : SUGGESTIONS
              ).map((s, i) => (
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
          {/*
           * ANY FILE, NOT ONLY MEDIA (2026-09-22). The picker used to accept
           * image/*, video/* and audio/* alone, so a PDF, a spreadsheet or a
           * .txt could not even be chosen here while the bot read them. The
           * server reads what it can and names what it cannot
           * (render media-inline.ts), so the picker no longer decides.
           */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="chat-file-input"
            aria-hidden="true"
            tabIndex={-1}
            onChange={event => void uploadAttachments(event.target.files)}
          />
          <button
            type="button"
            className="attach-btn"
            aria-label={t('chat.attachAny')}
            title={t('chat.attachAny')}
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

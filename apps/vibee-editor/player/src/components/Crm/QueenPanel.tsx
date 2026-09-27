import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { useIsKeeper } from '@/hooks/useIsKeeper'
import { useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import { MARKETPLACE_AGENTS } from '../../../../packages/vibee-atoms/src/agent-marketplace'
import { helpersFor } from '@/lib/clientHelpers'
import { queenMessagesAtomFor } from '@/atoms/agentChat'
import {
  askQueen,
  clearQueen,
  loadQueenHistory,
  queenBusyAtom,
  queenTasksIn,
  taskTarget,
  withoutTasks,
  type QueenTask,
} from '@/lib/queen'
import { sendOrQueue } from '@/lib/agentStream'
import './QueenPanel.css'

const AUTO_KEY = 'vibee:queen:autoTasks'
const readAuto = (): boolean => {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off'
  } catch {
    return true
  }
}

/**
 * THE QUEEN, SUPERVISING ONE CLIENT (lib/queen.ts).
 *
 * The owner asks her "where is this stuck, what now?"; she answers from the
 * client's card, SOUL, plan, history and the agent's own recent work, and
 * sets the agent tasks. Each task is a press ("give to the agent") -- or, with
 * "hand tasks to the agent at once" on (the default: the owner asked for the
 * Queen to write to the agent directly), it goes by itself the moment her
 * answer ends. Either way it lands in the CENTRE chat through its queue, so it
 * never interrupts the agent mid-answer, and anything meant for the client
 * still comes back as a send card for the owner's press.
 */
export function QueenPanel({
  client,
  agent = null,
  open = false,
  onClose,
}: {
  client: string
  /** The specialist chosen in this client's thread; her tasks go to it. */
  agent?: string | null
  open?: boolean
  onClose?: () => void
}) {
  const { t, lang } = useLanguage()
  // Who she may name (crm-client-workspace v4): the agents this owner may
  // call into the thread, by the picker's own rule; the server checks again.
  const keeper = useIsKeeper(true)
  const verdicts = useAgentAcceptance()
  const callable = helpersFor(MARKETPLACE_AGENTS, keeper, verdicts)
  const callableIds = callable.map(a => a.id)
  const nameOf = (id: string) => {
    const a = callable.find(x => x.id === id)
    return a ? `${a.icon} ${a.name[lang === 'ru' ? 'ru' : 'en']}` : null
  }
  const messages = useAtomValue(queenMessagesAtomFor(client))
  const busy = useAtomValue(queenBusyAtom)[client] === true
  const [input, setInput] = useState('')
  const [auto, setAuto] = useState(readAuto)
  const [given, setGiven] = useState<Record<string, boolean>>({})
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [messages])

  // Her thread is kept on the server; this browser's copy may be gone.
  useEffect(() => {
    void loadQueenHistory(client)
  }, [client])

  const give = (task: QueenTask, key: string) => {
    sendOrQueue(
      task.text,
      [],
      taskTarget(client, agent, task.agent, callableIds)
    )
    setGiven(g => ({ ...g, [key]: true }))
  }

  const ask = async (text: string) => {
    if (!text.trim() || busy) return
    setInput('')
    const answer = await askQueen(client, text)
    if (auto)
      queenTasksIn(answer.text).forEach(task =>
        give(task, `${answer.id}:${task.text}`)
      )
  }

  const suggestions = [
    t('queen.ask.stuck'),
    t('queen.ask.next'),
    t('queen.ask.review'),
  ]

  return (
    <aside
      className={`queen${open ? ' is-open' : ''}`}
      aria-label={t('queen.title')}
      data-ai="off"
    >
      <header className="queen__head">
        <span className="queen__crown" aria-hidden="true">
          ♛
        </span>
        <div className="queen__who">
          <b>{t('queen.title')}</b>
          <small>{t('queen.subtitle')}</small>
        </div>
        {messages.length > 0 ? (
          <button
            type="button"
            className="queen__icon"
            title={t('queen.reset')}
            onClick={() => void clearQueen(client)}
          >
            ↺
          </button>
        ) : null}
        {onClose ? (
          <button
            type="button"
            className="queen__icon queen__close"
            aria-label={t('crm.aside.close')}
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </header>

      <label className="queen__auto">
        <input
          type="checkbox"
          checked={auto}
          onChange={e => {
            setAuto(e.target.checked)
            try {
              localStorage.setItem(AUTO_KEY, e.target.checked ? 'on' : 'off')
            } catch {
              // A private window: the choice lasts for this page.
            }
          }}
        />
        <span>{t('queen.auto')}</span>
      </label>

      <div className="queen__list" ref={list}>
        {messages.length === 0 ? (
          <div className="queen__empty">
            <p>{t('queen.empty')}</p>
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                className="queen__suggest"
                onClick={() => void ask(s)}
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map(m => {
            const tasks = m.role === 'assistant' ? queenTasksIn(m.text) : []
            return (
              <div key={m.id} className={`queen__msg queen__msg--${m.role}`}>
                <div className="queen__text">
                  {m.role === 'assistant' ? withoutTasks(m.text) : m.text}
                  {m.role === 'assistant' && !m.text && busy ? '…' : null}
                </div>
                {tasks.length > 0 ? (
                  <ul className="queen__tasks">
                    {tasks.map(task => {
                      const key = `${m.id}:${task.text}`
                      const done = given[key]
                      // The agent she named, shown only when it will get it.
                      const to = task.agent ? nameOf(task.agent) : null
                      return (
                        <li key={key}>
                          <span>
                            {to ? (
                              <em
                                className="queen__to"
                                data-testid="queen-task-to"
                              >
                                → {to}
                              </em>
                            ) : null}
                            {task.text}
                          </span>
                          <button
                            type="button"
                            disabled={done}
                            onClick={() => give(task, key)}
                          >
                            {done ? t('queen.given') : t('queen.give')}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <form
        className="queen__composer"
        onSubmit={e => {
          e.preventDefault()
          void ask(input)
        }}
      >
        <input
          type="text"
          value={input}
          placeholder={t('queen.placeholder')}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy || !input.trim()}>
          {busy ? '…' : '↑'}
        </button>
      </form>
    </aside>
  )
}

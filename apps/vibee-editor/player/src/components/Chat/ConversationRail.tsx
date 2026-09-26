import { useCallback, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { agentBusyThreadsAtom } from '@/lib/agentStream'
import {
  dayGroup,
  deleteConversation,
  loadConversations,
  railRows,
  renameConversation,
  rowThreadKey,
  type Conversation,
  type DayGroup,
} from '@/lib/conversations'
import './ConversationRail.css'

/**
 * SEVERAL CHATS WITH ONE AGENT (owner, 2026-09-26: "so I can keep several
 * chats going").
 *
 * The rail lists the conversations of the own thread or of one specialist:
 * new, open, rename, delete, search, and a live dot for the ones answering
 * now. A client's thread is one conversation about one person, so this is
 * not shown there. The list is read from the server (lib/conversations); a
 * failure says so and never hides the chat itself.
 *
 * On a wide screen it is a column; on a phone a sheet over the conversation.
 * The pure rules it draws by (which day, which rows, the thread key) are in
 * lib/conversations so they are tested without a DOM.
 */
export function ConversationRail({
  agent,
  current,
  open,
  onClose,
  onOpen,
  onNew,
}: {
  agent: string | null
  current: string | null
  open: boolean
  onClose: () => void
  onOpen: (conversation: string | null) => void
  onNew: () => void
}) {
  const { t } = useLanguage()
  const [listed, setListed] = useState<Conversation[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const busy = useAtomValue(agentBusyThreadsAtom)

  const refresh = useCallback(() => {
    let live = true
    void loadConversations(agent).then(rows => {
      if (!live) return
      setFailed(rows === null)
      setListed(rows ?? [])
    })
    return () => {
      live = false
    }
  }, [agent])

  // Reloaded when the sheet opens and after the open conversation changes:
  // a new chat's first answer gives it a title the rail should then show.
  useEffect(() => {
    if (open) return refresh()
  }, [open, current, refresh])

  const rows = railRows(listed ?? [], current, query)
  const groups: { key: DayGroup; label: string; rows: Conversation[] }[] = [
    { key: 'today', label: t('chat.conv.today'), rows: [] },
    { key: 'yesterday', label: t('chat.conv.yesterday'), rows: [] },
    { key: 'earlier', label: t('chat.conv.earlier'), rows: [] },
  ]
  for (const row of rows)
    groups.find(g => g.key === dayGroup(row.lastAt))?.rows.push(row)

  const remove = async (conversation: string | null) => {
    if (!window.confirm(t('chat.conv.deleteConfirm'))) return
    await deleteConversation(agent, conversation)
    if (conversation === current) onNew()
    refresh()
  }

  const saveName = async (conversation: string) => {
    await renameConversation(agent, conversation, draft)
    setRenaming(null)
    refresh()
  }

  return (
    <>
      {open ? (
        <div
          className="conv-rail-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={`conv-rail${open ? ' conv-rail--open' : ''}`}
        aria-label={t('chat.conv.title')}
        data-testid="conversation-rail"
      >
        <div className="conv-rail__top">
          <button
            type="button"
            className="conv-rail__new"
            data-testid="conv-new"
            onClick={() => {
              onNew()
              onClose()
            }}
          >
            + {t('chat.conv.new')}
          </button>
          <button
            type="button"
            className="conv-rail__close"
            aria-label={t('chat.conv.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <input
          className="conv-rail__search"
          value={query}
          placeholder={t('chat.conv.search')}
          onChange={e => setQuery(e.target.value)}
        />
        {failed ? (
          <p className="conv-rail__note">{t('chat.conv.unavailable')}</p>
        ) : null}
        {!rows.length && !failed ? (
          <p className="conv-rail__note">
            {query ? t('chat.conv.nothingFound') : t('chat.conv.empty')}
          </p>
        ) : null}
        {groups.map(group =>
          group.rows.length ? (
            <div key={group.key} className="conv-rail__group">
              <p className="conv-rail__day">{group.label}</p>
              {group.rows.map(row => {
                const answering = busy.includes(
                  rowThreadKey(agent, row.conversation)
                )
                const active = row.conversation === current
                const id = row.conversation
                return (
                  <div
                    key={id ?? 'base'}
                    className={`conv-row${active ? ' conv-row--active' : ''}`}
                    data-testid="conv-row"
                  >
                    {renaming === id && id ? (
                      <input
                        className="conv-row__rename"
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={() => void saveName(id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') void saveName(id)
                          if (e.key === 'Escape') setRenaming(null)
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="conv-row__open"
                        onClick={() => {
                          onOpen(id)
                          onClose()
                        }}
                      >
                        {answering ? (
                          <span
                            className="conv-row__dot"
                            aria-label={t('chat.conv.running')}
                          />
                        ) : null}
                        <span className="conv-row__title">
                          {row.title || t('chat.conv.untitled')}
                        </span>
                        {row.preview ? (
                          <span className="conv-row__preview">
                            {row.preview}
                          </span>
                        ) : null}
                      </button>
                    )}
                    {id ? (
                      <span className="conv-row__actions">
                        <button
                          type="button"
                          aria-label={t('chat.conv.rename')}
                          onClick={() => {
                            setRenaming(id)
                            setDraft(row.title ?? '')
                          }}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          aria-label={t('chat.conv.delete')}
                          onClick={() => void remove(id)}
                        >
                          🗑
                        </button>
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null
        )}
      </aside>
    </>
  )
}

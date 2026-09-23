import { useCallback, useEffect, useState, Suspense } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { PlugZap, Send, X } from 'lucide-react'
import { AccountSelector } from '@/components/Leads/AccountSelector'
import { EventStream } from '@/components/Leads/EventStream'
import { LeadFeed } from '@/components/Leads/LeadFeed'
import {
  activeSessionAtom,
  leadsBackendAtom,
  replyModalAtom,
  sendReplyMessage,
} from '@/atoms/leads'
import { useLeadsWebSocket } from '@/hooks/useLeadsWebSocket'
import { useLanguage } from '@/hooks/useLanguage'
import '@/pages/Search.css'

/**
 * THE LEADS SECTIONS, INSIDE THE SCREEN THEY BELONG TO.
 *
 * They were a screen of their own at /search, with their own row of five tabs
 * at the BOTTOM -- directly on top of the app's tab bar. Owner, 2026-09-23,
 * with a screenshot: "what are these tabs inside a tab?". Measured the same
 * day at 390px: the row's 57px sat entirely behind the app's bar, so not one
 * of its five items could be pressed, and /search matched none of the six
 * destinations of the bar, so nothing was lit there either -- the screen said
 * nowhere-in-particular.
 *
 * The owner's decision: leads are client work, so they are sections of the
 * CRM. Three of the five were "coming soon" placeholders with nothing behind
 * them and are gone; a section appears again the day something fills it.
 *
 * Nothing here is offered while the server has no leads endpoints -- CrmPage
 * asks before it draws the row. This component still carries the honest
 * message for the case where the server goes away while the screen is open.
 */

export const LEADS_SECTIONS = ['events', 'leads'] as const
export type LeadsSectionId = (typeof LEADS_SECTIONS)[number]

export function LeadsSections({ section }: { section: LeadsSectionId }) {
  const { lang } = useLanguage()
  const [replyModal, setReplyModal] = useAtom(replyModalAtom)
  const activeSession = useAtomValue(activeSessionAtom)
  const backendOk = useAtomValue(leadsBackendAtom)
  const { isConnected } = useLeadsWebSocket()

  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)

  const handleReplySubmit = useCallback(async () => {
    if (!replyModal || !replyText.trim() || !activeSession) return
    setReplySending(true)
    try {
      const sent = await sendReplyMessage(
        activeSession,
        replyModal.chatId,
        replyText,
        replyModal.messageId
      )
      if (sent) {
        setReplyText('')
        setReplyModal(null)
      }
    } finally {
      setReplySending(false)
    }
  }, [replyModal, replyText, activeSession, setReplyModal])

  useEffect(() => {
    if (!replyModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReplyModal(null)
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReplySubmit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replyModal, setReplyModal, handleReplySubmit])

  return (
    <div className="leads-sections">
      <div className="leads-account-bar">
        <AccountSelector />
        <div className="leads-ws-indicator">
          <span
            className={`leads-ws-dot ${isConnected ? 'connected' : 'disconnected'}`}
          />
          <span className="leads-ws-text">
            {isConnected
              ? lang === 'ru'
                ? 'Подключено'
                : 'Connected'
              : lang === 'ru'
                ? 'Отключено'
                : 'Disconnected'}
          </span>
        </div>
      </div>

      {backendOk === false ? (
        /*
         * THE HONEST STATE. Every leads request ends in `catch -> return []`,
         * so without this the screen showed EMPTY LISTS -- which a person
         * reads as "no leads yet", a wrong explanation that leaves them
         * waiting for something that cannot arrive.
         */
        <div className="leads-unavailable">
          <PlugZap size={40} />
          <h2>
            {lang === 'ru'
              ? 'Раздел лидов не подключён к серверу'
              : 'Leads are not connected to the server'}
          </h2>
          <p>
            {lang === 'ru'
              ? 'Это не значит, что лидов нет — их просто негде взять: ' +
                'нужных ручек на сервере пока не существует.'
              : 'It does not mean you have no leads — there is simply ' +
                'nowhere to get them from: the server endpoints do not ' +
                'exist yet.'}
          </p>
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="leads-loading">
              {lang === 'ru' ? 'Грузим…' : 'Loading…'}
            </div>
          }
        >
          {section === 'events' ? (
            <EventStream maxHeight={600} />
          ) : (
            <LeadFeed />
          )}
        </Suspense>
      )}

      {replyModal && (
        <div
          className="leads-reply-overlay"
          onClick={() => setReplyModal(null)}
        >
          <div className="leads-reply-modal" onClick={e => e.stopPropagation()}>
            <div className="leads-reply-header">
              <span>{lang === 'ru' ? 'Ответить' : 'Reply'}</span>
              <button
                className="leads-reply-close"
                onClick={() => setReplyModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              className="leads-reply-input"
              placeholder={
                lang === 'ru' ? 'Введите сообщение...' : 'Type your message...'
              }
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              autoFocus
              rows={4}
            />
            <div className="leads-reply-actions">
              <button
                className="leads-reply-cancel"
                onClick={() => setReplyModal(null)}
              >
                {lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                className="leads-reply-send"
                onClick={handleReplySubmit}
                disabled={!replyText.trim() || replySending}
              >
                <Send size={16} />
                <span>
                  {replySending ? '...' : lang === 'ru' ? 'Отправить' : 'Send'}
                </span>
              </button>
            </div>
            <div className="leads-reply-hint">
              <span>⌘+Enter {lang === 'ru' ? 'для отправки' : 'to send'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

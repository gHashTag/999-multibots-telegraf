import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './Crm.css'
import { useLanguage } from '@/hooks/useLanguage'
import { Panel } from '@/components/Crm/Panel'
import {
  GROUP_CHAT_ID,
  loadGroupContext,
  type GroupContext,
  type Reached,
} from '@/lib/crm'

/**
 * ONE GROUP, READ-ONLY (#2950).
 *
 * The owner asked why there were no groups. A group is not a client: it is
 * a place where clients speak. So this screen shows what was said there and
 * WHO said it, and every active member is one press from their own client
 * chat. There is no send box on purpose -- posting into a group waits for
 * the owner's decision (#2951), and a box that does nothing would be a lie.
 */
export default function CrmGroupPage() {
  const { t } = useLanguage()
  const { chatId } = useParams<{ chatId?: string }>()
  const chat = chatId && GROUP_CHAT_ID.test(chatId) ? chatId : null
  const [ctx, setCtx] = useState<Reached<GroupContext> | null>(null)

  useEffect(() => {
    if (!chat) return
    let live = true
    void loadGroupContext(chat).then(r => {
      if (live) setCtx(r)
    })
    return () => {
      live = false
    }
  }, [chat])

  if (!chat) {
    return (
      <div className="crm">
        <p className="crm__empty">{t('crm.group.badId')}</p>
        <Link to="/crm">{t('crm.group.back')}</Link>
      </div>
    )
  }
  const g = ctx?.data?.group ?? null
  const title = g?.title || (g?.username ? `@${g.username}` : chat)

  return (
    <div className="crm">
      <header className="crm__top">
        <h2>{title}</h2>
        <Link to="/crm">{t('crm.group.back')}</Link>
      </header>
      <p className="crm__counts">{t('crm.group.readOnly')}</p>
      {ctx === null ? (
        <p className="crm__muted">{t('crm.refreshing')}</p>
      ) : (
        <>
          <Panel title={t('crm.group.members')} state={ctx}>
            {!g ? (
              <p className="crm__empty">{t('crm.group.notFound')}</p>
            ) : ctx.data!.members.length === 0 ? (
              <p className="crm__empty">{t('crm.group.noMembers')}</p>
            ) : (
              <ul className="crm__list">
                {ctx.data!.members.map(m => (
                  <li key={m.id} className="crm__row">
                    <Link to={`/crm/${m.id}/chat`}>{m.name || m.id}</Link>{' '}
                    <span className="crm__muted">
                      {t('crm.group.memberMessages', { n: m.messages })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {g ? (
            <Panel title={t('crm.group.messages')} state={ctx}>
              {ctx.data!.signals.length ? (
                <p className="crm__counts">
                  {t('crm.group.signals', {
                    list: ctx.data!.signals.join(', '),
                  })}
                </p>
              ) : null}
              <ul className="crm__list">
                {ctx.data!.messages.map(m => (
                  <li key={m.msgId} className="crm__row">
                    <span className="crm__muted">
                      {m.out
                        ? t('crm.group.you')
                        : m.senderId
                          ? m.senderId
                          : '—'}
                    </span>{' '}
                    {m.text}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      )}
    </div>
  )
}

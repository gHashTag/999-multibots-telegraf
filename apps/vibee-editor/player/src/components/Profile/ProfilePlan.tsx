/**
 * КОНТЕНТ-ПЛАН — цели и то, что под них снимается.
 *
 * ЗАЧЕМ ЦЕЛЬ ВЕРХНИМ УРОВНЕМ, А НЕ ДАТА. У одиночного автора сроки плывут, а
 * цель («Продать курс») держится месяцами. Календарь на такой работе быстро
 * становится кладбищем просроченных дат, и человек перестаёт его открывать.
 *
 * ЧТО ДЕЛАЕТ ЭТО НЕ БЛОКНОТОМ. Тот же план видит и правит агент — теми же
 * инструментами (`plan_list`, `plan_item_add`, `plan_item_update`). Поэтому
 * «набросай десять тем под эту цель» работает, а вышедший ролик проставляется
 * в карточку сам. Подсказка про это стоит прямо в пустом состоянии: без неё
 * человек не догадается, что список общий.
 *
 * СТИЛЬ. Переиспользуем классы `.profile-skills__*` там, где вид совпадает
 * (карточка, шапка, модалка) — дублировать канон в третий раз незачем. Свои
 * классы только на том, чего в скиллах нет: папка цели и статус карточки.
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Target, Trash2, X } from 'lucide-react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

type Status = 'замысел' | 'в работе' | 'вышло'

interface PlanItem {
  id: number
  название: string
  заметка?: string
  статус: Status | string
  ролик?: string
}

interface PlanGoal {
  id: number
  цель: string
  зачем?: string
  карточки: PlanItem[]
}

/** Русский статус из ответа → машинный код для plan_item_update. */
const CODE: Record<string, 'idea' | 'doing' | 'done'> = {
  замысел: 'idea',
  'в работе': 'doing',
  вышло: 'done',
}

/** По кругу: замысел → в работе → вышло → замысел. */
const NEXT: Record<string, 'idea' | 'doing' | 'done'> = {
  замысел: 'doing',
  'в работе': 'done',
  вышло: 'idea',
}

type GoalDraft = { title: string; intent: string }
type ItemDraft = { id: number | null; goalId: number; title: string; note: string }

export function ProfilePlan() {
  const [goals, setGoals] = useState<PlanGoal[] | null>(null)
  /**
   * null = человек ещё ничего не сворачивал руками.
   *
   * Раскрытие единственной цели могло бы стоять в загрузке (`setOpen` после
   * ответа), но это setState внутри эффекта — лишний каскад рендеров, и линтер
   * прав, что ругается. Значение выводится при отрисовке: пока набор пуст,
   * единственная папка открыта, а первый же клик фиксирует явный выбор.
   */
  const [open, setOpen] = useState<Set<number> | null>(null)
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null)
  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const call = useCallback(
    async (name: string, args: Record<string, unknown> = {}) => {
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
          params: { name, arguments: args },
        }),
      })
      const d = await res.json()
      return (d?.result?.structuredContent ?? {}) as Record<string, unknown>
    },
    []
  )

  const load = useCallback(async () => {
    const r = await call('plan_list')
    const list = Array.isArray(r['цели']) ? (r['цели'] as PlanGoal[]) : []
    setGoals(list)
  }, [call])

  useEffect(() => {
    load().catch(() => setGoals([]))
  }, [load])

  /** Общая обёртка: занятость, разбор отказа, перезагрузка. */
  const run = async (
    name: string,
    args: Record<string, unknown>,
    okKey: string
  ) => {
    setBusy(true)
    setNote(null)
    try {
      const r = await call(name, args)
      if (r[okKey] === false) {
        setNote(String(r['причина'] ?? 'не получилось'))
        return false
      }
      await load()
      return true
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'сеть не ответила')
      return false
    } finally {
      setBusy(false)
    }
  }

  /** Открыта ли папка, пока выбор не сделан явно. */
  const isOpen = (id: number, total: number) =>
    open ? open.has(id) : total === 1

  const toggle = (id: number, total: number) =>
    setOpen(prev => {
      const next = new Set(prev ?? (total === 1 ? [id] : []))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const saveGoal = async () => {
    if (!goalDraft?.title.trim()) return
    const ok = await run(
      'plan_goal_create',
      { title: goalDraft.title.trim(), intent: goalDraft.intent.trim() },
      'создано'
    )
    if (ok) setGoalDraft(null)
  }

  const saveItem = async () => {
    if (!itemDraft?.title.trim()) return
    const ok = itemDraft.id
      ? await run(
          'plan_item_update',
          { id: itemDraft.id, title: itemDraft.title.trim(), note: itemDraft.note.trim() },
          'изменено'
        )
      : await run(
          'plan_item_add',
          {
            goal_id: itemDraft.goalId,
            title: itemDraft.title.trim(),
            note: itemDraft.note.trim(),
          },
          'добавлено'
        )
    if (ok) setItemDraft(null)
  }

  const advance = (item: PlanItem) =>
    run('plan_item_update', { id: item.id, status: NEXT[item.статус] ?? 'idea' }, 'изменено')

  const removeGoal = (g: PlanGoal) => {
    const n = g.карточки.length
    const tail = n ? ` вместе с ${n} карточками` : ''
    if (!window.confirm(`Удалить цель «${g.цель}»${tail}? Это необратимо.`)) return
    run('plan_goal_delete', { id: g.id }, 'удалено')
  }

  const removeItem = (item: PlanItem) => {
    if (!window.confirm(`Удалить карточку «${item.название}»?`)) return
    run('plan_item_delete', { id: item.id }, 'удалено')
  }

  return (
    <div className="profile-skills profile-plan">
      <div className="profile-skills__head">
        <p className="profile-skills__hint">
          Цели и то, что под них снимается. Агент видит этот список и правит его вместе с тобой
        </p>
        <button
          className="profile-skills__add"
          onClick={() => setGoalDraft({ title: '', intent: '' })}
        >
          <Plus size={16} /> Цель
        </button>
      </div>

      {goals === null ? (
        <div className="profile-skills__list">
          {[1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 92, borderRadius: 12 }} />
          ))}
        </div>
      ) : goals.length === 0 && !goalDraft ? (
        <div className="profile-files__empty">
          <Target size={32} />
          <p>
            Плана пока нет. Цель — это не тема ролика, а то, ради чего ты их
            снимаешь: «продать курс», «набрать 1000 подписчиков».
          </p>
          <p className="profile-plan__aside">
            Завёл цель — скажи агенту «набросай план под неё». Он пишет в этот
            же список, и вышедшие ролики отмечает сам.
          </p>
          <button
            className="profile-files__cta"
            onClick={() =>
              setGoalDraft({
                title: 'Набрать первую тысячу',
                intent: 'Чтобы было кому продавать. Пока меньше сотни.',
              })
            }
          >
            Завести первую цель
          </button>
        </div>
      ) : (
        <div className="profile-skills__list">
          {goals.map(g => {
            const done = g.карточки.filter(i => i.статус === 'вышло').length
            const expanded = isOpen(g.id, goals.length)
            return (
              <div key={g.id} className="profile-skills__card profile-plan__goal">
                <div className="profile-skills__card-head">
                  <button
                    className="profile-plan__goal-title"
                    onClick={() => toggle(g.id, goals.length)}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="profile-skills__name">{g.цель}</span>
                    <span className="profile-plan__count">
                      {done}/{g.карточки.length}
                    </span>
                  </button>
                  <span className="profile-skills__actions">
                    <button
                      title="Добавить карточку"
                      onClick={() => {
                        setOpen(prev => new Set(prev ?? []).add(g.id))
                        setItemDraft({ id: null, goalId: g.id, title: '', note: '' })
                      }}
                    >
                      <Plus size={14} />
                    </button>
                    <button title="Удалить цель" onClick={() => removeGoal(g)}>
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>

                {g.зачем && <p className="profile-skills__content">{g.зачем}</p>}

                {expanded && (
                  <div className="profile-plan__items">
                    {g.карточки.length === 0 ? (
                      <p className="profile-plan__aside">
                        Пусто. Добавь карточку или попроси агента набросать темы.
                      </p>
                    ) : (
                      g.карточки.map(item => (
                        <div key={item.id} className="profile-plan__item">
                          <button
                            className={`profile-plan__status profile-plan__status--${CODE[item.статус] ?? 'idea'}`}
                            title="Сменить статус"
                            disabled={busy}
                            onClick={() => advance(item)}
                          >
                            {item.статус}
                          </button>
                          <div className="profile-plan__item-body">
                            <span className="profile-plan__item-title">
                              {item.название}
                            </span>
                            {item.заметка && (
                              <span className="profile-plan__item-note">
                                {item.заметка}
                              </span>
                            )}
                          </div>
                          <span className="profile-skills__actions">
                            <button
                              title="Изменить"
                              onClick={() =>
                                setItemDraft({
                                  id: item.id,
                                  goalId: g.id,
                                  title: item.название,
                                  note: item.заметка ?? '',
                                })
                              }
                            >
                              <Pencil size={14} />
                            </button>
                            <button title="Удалить" onClick={() => removeItem(item)}>
                              <Trash2 size={14} />
                            </button>
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {note && <p className="profile-skills__note">{note}</p>}

      {goalDraft && (
        <div className="profile-skills__modal">
          <div className="profile-skills__editor">
            <div className="profile-skills__editor-head">
              <span>Новая цель</span>
              <button onClick={() => setGoalDraft(null)} title="Закрыть">
                <X size={16} />
              </button>
            </div>
            <input
              className="profile-skills__input"
              placeholder="Цель: продать курс / набрать 1000 подписчиков"
              value={goalDraft.title}
              maxLength={200}
              onChange={e => setGoalDraft({ ...goalDraft, title: e.target.value })}
            />
            <textarea
              className="profile-skills__textarea"
              placeholder="Зачем она тебе — своими словами. Агент прочитает это, когда будет придумывать темы"
              value={goalDraft.intent}
              maxLength={4096}
              onChange={e => setGoalDraft({ ...goalDraft, intent: e.target.value })}
            />
            {note && <p className="profile-skills__note">{note}</p>}
            <button
              className="profile-skills__save"
              disabled={busy || !goalDraft.title.trim()}
              onClick={saveGoal}
            >
              {busy ? 'Сохраняю…' : 'Завести цель'}
            </button>
          </div>
        </div>
      )}

      {itemDraft && (
        <div className="profile-skills__modal">
          <div className="profile-skills__editor">
            <div className="profile-skills__editor-head">
              <span>{itemDraft.id ? 'Изменить карточку' : 'Новая карточка'}</span>
              <button onClick={() => setItemDraft(null)} title="Закрыть">
                <X size={16} />
              </button>
            </div>
            <input
              className="profile-skills__input"
              placeholder="О чём ролик — одной строкой"
              value={itemDraft.title}
              maxLength={200}
              onChange={e => setItemDraft({ ...itemDraft, title: e.target.value })}
            />
            <textarea
              className="profile-skills__textarea"
              placeholder="Тезисы, референсы, что показать. Это увидит агент, когда возьмётся делать"
              value={itemDraft.note}
              maxLength={4096}
              onChange={e => setItemDraft({ ...itemDraft, note: e.target.value })}
            />
            {note && <p className="profile-skills__note">{note}</p>}
            <button
              className="profile-skills__save"
              disabled={busy || !itemDraft.title.trim()}
              onClick={saveItem}
            >
              {busy ? 'Сохраняю…' : itemDraft.id ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

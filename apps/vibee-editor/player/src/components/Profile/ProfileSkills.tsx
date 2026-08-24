/**
 * МЕНЕДЖЕР СКИЛЛОВ — папка правил человека с полным CRUD.
 *
 * Скилл — именованное правило для агента («Тон рилсов», «Запрещённое»).
 * Создал здесь — агент видит его через skills_list и применяет к текстам
 * и генерациям. UI в каноне Trinity: тёмные карточки, кремовый текст,
 * золото — только на главном действии.
 */
import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

interface Skill {
  id: number
  name: string
  content: string
  updated_at?: string
}

type Draft = { id: number | null; name: string; content: string }

export function ProfileSkills() {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
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
      return d?.result?.structuredContent ?? {}
    },
    []
  )

  const load = useCallback(async () => {
    const r = await call('skills_list')
    setSkills(Array.isArray(r['скиллы']) ? r['скиллы'] : [])
  }, [call])

  useEffect(() => {
    load().catch(() => setSkills([]))
  }, [load])

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setNote(null)
    try {
      const r = draft.id
        ? await call('skills_update', {
            id: draft.id,
            name: draft.name,
            content: draft.content,
          })
        : await call('skills_create', { name: draft.name, content: draft.content })
      const okKey = draft.id ? 'обновлено' : 'создано'
      if (r[okKey]) {
        setDraft(null)
        await load()
      } else {
        setNote(String(r['причина'] ?? 'не сохранилось'))
      }
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number, name: string) => {
    if (!window.confirm(`Удалить скилл «${name}»?`)) return
    setBusy(true)
    try {
      await call('skills_delete', { id })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="profile-skills">
      <div className="profile-skills__head">
        <p className="profile-skills__hint">
          Правила, которые агент применяет к твоим рилсам и постам
        </p>
        <button
          className="profile-skills__add"
          onClick={() => setDraft({ id: null, name: '', content: '' })}
        >
          <Plus size={16} /> Новый скилл
        </button>
      </div>

      {skills === null ? (
        <div className="profile-skills__list">
          {[1, 2].map(i => (
            <div key={i} className="skeleton" style={{ height: 92, borderRadius: 12 }} />
          ))}
        </div>
      ) : skills.length === 0 && !draft ? (
        <div className="profile-files__empty">
          <Sparkles size={32} />
          <p>Скиллов пока нет. Одно-два правила — и агент пишет твоим голосом.</p>
          <button
            className="profile-files__cta"
            onClick={() =>
              setDraft({
                id: null,
                name: 'Тон рилсов',
                content:
                  'Пишу коротко. Каждое утверждение — с числом и единицей. Без жаргона: термин только вместе с человеческим объяснением.',
              })
            }
          >
            Создать первый скилл
          </button>
        </div>
      ) : (
        <div className="profile-skills__list">
          {skills.map(sk => (
            <div key={sk.id} className="profile-skills__card">
              <div className="profile-skills__card-head">
                <span className="profile-skills__name">{sk.name}</span>
                <span className="profile-skills__actions">
                  <button
                    title="Изменить"
                    onClick={() =>
                      setDraft({ id: sk.id, name: sk.name, content: sk.content })
                    }
                  >
                    <Pencil size={14} />
                  </button>
                  <button title="Удалить" onClick={() => remove(sk.id, sk.name)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              <p className="profile-skills__content">{sk.content}</p>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="profile-skills__modal">
          <div className="profile-skills__editor">
            <div className="profile-skills__editor-head">
              <span>{draft.id ? 'Изменить скилл' : 'Новый скилл'}</span>
              <button onClick={() => setDraft(null)} title="Закрыть">
                <X size={16} />
              </button>
            </div>
            <input
              className="profile-skills__input"
              placeholder="Имя: Тон рилсов / Запрещённое / Хештеги"
              value={draft.name}
              maxLength={100}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />
            <textarea
              className="profile-skills__textarea"
              placeholder="Правило: как агент должен писать и что делать нельзя"
              value={draft.content}
              maxLength={8192}
              onChange={e => setDraft({ ...draft, content: e.target.value })}
            />
            {note && <p className="profile-skills__note">{note}</p>}
            <button
              className="profile-skills__save"
              disabled={busy || !draft.name.trim() || !draft.content.trim()}
              onClick={save}
            >
              {busy ? 'Сохраняю…' : draft.id ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { API_BASE } from '../../config'
import { authHeaders } from '@/lib/apiFetch'

/**
 * ЖДУТ ОДОБРЕНИЯ — единственное место, где видно свой НЕОДОБРЕННЫЙ пост.
 *
 * Агент публикует ролики сам, без спроса, и владелец просил обратного: в
 * ленте только одобренное. Просто «публиковать скрыто» было нельзя — все
 * чтения фильтруют `is_public = TRUE`, и такой пост стал бы невидим И
 * АВТОРУ: одобрять негде, работа автопилота исчезает молча.
 *
 * Поэтому пара: скрытая публикация и этот раздел. Одно нажатие — и пост в
 * ленте; ничего не нажали — он лежит и ждёт, а не пропадает.
 */
interface Ожидающий {
  id: number
  name: string
  description: string | null
  thumbnail_url: string | null
  video_url: string
  created_at: string
}

export function ProfilePending() {
  const [список, setСписок] = useState<Ожидающий[] | null>(null)
  const [занят, setЗанят] = useState<number | null>(null)
  const [ошибка, setОшибка] = useState<string | null>(null)

  useEffect(() => {
    let живо = true
    fetch(`${API_BASE}/api/feed/pending`, { headers: authHeaders() })
      .then(о => (о.ok ? о.json() : { templates: [] }))
      .then(д => {
        if (живо) setСписок(д.templates ?? [])
      })
      .catch(() => {
        // Молчим НАМЕРЕННО: раздел не обязан работать, чтобы работал профиль.
        if (живо) setСписок([])
      })
    return () => {
      живо = false
    }
  }, [])

  const одобрить = async (id: number) => {
    setЗанят(id)
    setОшибка(null)
    try {
      const о = await fetch(`${API_BASE}/api/feed/approve`, {
        method: 'POST',
        /*
         * НЕ СПРЕД: `Headers` не разворачивается.
         *
         * `{...new Headers({'X-A':'b'})}` даёт `{}` — данные лежат
         * внутри объекта, а не в собственных свойствах. Поэтому
         * запрос уходил РОВНО с `Content-Type` и без единого
         * удостоверения, а сервер отвечал 401. Кнопка нажималась,
         * ничего не происходило, причины не было видно.
         *
         * `authHeaders` принимает дополнительные заголовки сама —
         * ей и передаём.
         */
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id }),
      })
      if (!о.ok) throw new Error(String(о.status))
      // Убираем из списка ТОЛЬКО после успеха: исчезнувшая карточка при
      // неудавшемся одобрении означала бы «опубликовано», когда нет.
      setСписок(с => (с ?? []).filter(п => п.id !== id))
    } catch (e) {
      setОшибка(`Не опубликовалось: ${e instanceof Error ? e.message : e}`)
    } finally {
      setЗанят(null)
    }
  }

  if (список === null) return <div className="profile-empty">Загрузка…</div>
  if (список.length === 0) {
    // Пустота ОБЪЯСНЕНА: пустой раздел читается как поломка.
    return (
      <div className="profile-empty">
        Нечего одобрять. Ролики, сделанные агентом, появятся здесь и попадут в
        ленту только после вашего нажатия.
      </div>
    )
  }

  return (
    <div className="profile-pending">
      {ошибка && <div className="profile-empty">{ошибка}</div>}
      {список.map(п => (
        <div key={п.id} className="profile-pending__item" data-pending-id={п.id}>
          {п.thumbnail_url && (
            <img src={п.thumbnail_url} alt="" className="profile-pending__cover" />
          )}
          <div className="profile-pending__text">
            <div className="profile-pending__name">{п.name}</div>
            {п.description && (
              <div className="profile-pending__desc">{п.description}</div>
            )}
          </div>
          <button
            className="profile-pending__approve"
            disabled={занят === п.id}
            onClick={() => одобрить(п.id)}
          >
            {занят === п.id ? 'Публикую…' : 'Опубликовать'}
          </button>
        </div>
      ))}
    </div>
  )
}

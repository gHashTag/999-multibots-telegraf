/**
 * БЛОГ КАНАЛА В ПРОФИЛЕ — те же посты t27.ai, что и в табе 📜 Blog,
 * но не уходя из профиля: одна точка, где видна вся жизнь канала —
 * рилсы, файлы, скиллы и теперь тексты. Данные — публичный прокси
 * /api/blog (RSS), дизайн — канон Trinity.
 */
import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'

interface BlogItem {
  title: string
  link: string
  pubDate: string
  description: string
}

const MONTHS_RU = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

function formatDate(pubDate: string): string {
  const d = new Date(pubDate)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`
}

export function ProfileBlog() {
  const [items, setItems] = useState<BlogItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/blog`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json()
        setItems(Array.isArray(d.items) ? d.items : [])
      } catch {
        setError('блог не прочитался')
      }
    })()
  }, [])

  if (error) return <div className="profile-files__empty">{error}</div>

  if (!items) {
    return (
      <div className="profile-blog">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 76, borderRadius: 12 }} />
        ))}
      </div>
    )
  }

  return (
    <div className="profile-blog">
      {items.map(it => (
        <a
          key={it.link}
          className="profile-blog__item"
          href={it.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="profile-blog__date">{formatDate(it.pubDate)}</span>
          <span className="profile-blog__title">{it.title}</span>
          <span className="profile-blog__desc">{it.description}</span>
        </a>
      ))}
    </div>
  )
}

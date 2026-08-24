/**
 * БЛОГ t27.ai В МИНИ-АППЕ.
 *
 * Канон дизайна Trinity: матовый чёрный фон, кремовый текст, золото —
 * ТОЛЬКО на заголовке (как в рилсах: одно золотое пятно на экран).
 * Данные — RSS сайта через прокси GET /api/blog рендер-сервера: браузер
 * не имеет права читать чужой домейн из-за CORS, а сервер — имеет.
 */
import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { API_BASE } from '@/config'
import './Blog.css'

interface BlogItem {
  title: string
  link: string
  pubDate: string
  description: string
}
interface BlogData {
  ok: boolean
  title?: string
  description?: string
  items: BlogItem[]
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

export function BlogPage() {
  const [data, setData] = useState<BlogData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/blog`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: BlogData = await res.json()
      if (!json.ok || !Array.isArray(json.items)) {
        throw new Error('пустой ответ')
      }
      setData(json)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="blog-page">
      <Header />
      <main className="blog-main">
        <header className="blog-header">
          <h1 className="blog-title">Блог</h1>
          <p className="blog-subtitle">
            {data?.description || 'Measured results and the methods behind them'}
          </p>
        </header>

        {loading && <div className="blog-loading">Читаем RSS…</div>}

        {error && (
          <div className="blog-error">
            <p>Лента блога не прочиталась: {error}</p>
            <button onClick={load} className="blog-retry">
              Повторить
            </button>
          </div>
        )}

        {data && (
          <ol className="blog-list">
            {data.items.map((item, i) => (
              <li key={item.link || i} className="blog-item">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="blog-item-link"
                >
                  <span className="blog-item-date">{formatDate(item.pubDate)}</span>
                  <span className="blog-item-title">{item.title}</span>
                  {item.description && (
                    <span className="blog-item-description">
                      {item.description}
                    </span>
                  )}
                  <span className="blog-item-read">Читать на t27.ai →</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  )
}

export default BlogPage

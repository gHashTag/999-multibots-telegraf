/**
 * ФАЙЛЫ ПРОФИЛЯ — галерея сгенерированного: картинки, видео, озвучка.
 *
 * Раньше генерации агента жили в «моих файлах» только внутри чата —
 * профиль о них не знал, и контент человека был «не связан»: посты в
 * одном месте, файлы в никуда. Этот таб связывает: один экран — вся
 * работа человека. Данные — тот же my_balance/my_assets-путь: MCP с
 * подписью мини-аппа (в DEV — ключом агента), только для СВОЕГО профиля.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Film, ImageIcon, Mic, Sparkles } from 'lucide-react'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

interface AssetItem {
  id: number
  type: string
  public_url?: string
  storage_path?: string
  created_at?: string
}

export function ProfileFilesGrid() {
  const [items, setItems] = useState<AssetItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
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
            params: { name: 'my_assets', arguments: { limit: 50 } },
          }),
        })
        const d = await res.json()
        const files = d?.result?.structuredContent?.['файлы']
        if (Array.isArray(files)) setItems(files)
        else setError('нет ответа')
      } catch {
        setError('не загрузилось')
      }
    })()
  }, [])

  if (error) {
    return (
      <div className="profile-files__empty">Файлы не загрузились: {error}</div>
    )
  }

  if (!items) {
    return (
      <div className="profile-files">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="skeleton"
            style={{ aspectRatio: '1', borderRadius: 12 }}
          />
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="profile-files__empty">
        <Sparkles size={32} />
        <p>Здесь появятся твои картинки, видео и озвучка.</p>
        {/*
          The price was typed here as "1 токен" and the server charges twice
          that: the owner's markup reached the charge and never reached this
          call to action. A static link cannot know a price -- the agent
          names it from my_balance when asked.
        */}
        <Link to="/chat" className="profile-files__cta">
          {'Попроси агента — он сделает первую и назовёт цену'}
        </Link>
      </div>
    )
  }

  return (
    <div className="profile-files">
      {items.map(f => {
        const url = f.public_url || ''
        const isImage =
          /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) ||
          f.type === 'generated_image'
        const isVideo =
          /\.(mp4|webm|mov)(\?|$)/i.test(url) || f.type === 'generated_video'
        return (
          <div
            key={f.id}
            className="profile-files__item"
            title={`${f.type} · ${f.created_at?.slice(0, 10) ?? ''}`}
          >
            {isImage && url ? (
              <a href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt="" loading="lazy" />
              </a>
            ) : isVideo && url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="profile-files__media"
              >
                <Film size={28} />
              </a>
            ) : (
              <div className="profile-files__media">
                <Mic size={28} />
              </div>
            )}
            <span className="profile-files__type">
              {isImage ? (
                <ImageIcon size={12} />
              ) : isVideo ? (
                <Film size={12} />
              ) : (
                <Mic size={12} />
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

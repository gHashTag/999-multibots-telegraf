import { useCallback, useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Loader2, Save, Sparkles } from 'lucide-react'
import {
  soulAtom,
  soulLoadedAtom,
  soulSavingAtom,
  soulErrorAtom,
  loadSoulAtom,
  saveSoulAtom,
} from '@/atoms/soul'
import { useLanguage } from '@/hooks/useLanguage'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import './SoulEditor.css'

/**
 * «Мой SOUL» + скиллы агента — раздел профиля для ВЛАДЕЛЬЦА аккаунта.
 *
 * SOUL — личная карточка голоса: агент читает её перед ответом и пишет
 * посты под человека, а не под среднюю температуру. Редактирует и сам
 * человек (здесь), и агент по просьбе (инструмент soul_edit) — это
 * его скилл наравне с остальными.
 */

const SOUL_TEMPLATE = `# Мой SOUL

## Кто я
(одной строкой: чем занимаешься и за что тебя могут узнать)

## Чем зарабатываю
(услуга / продукт / партнёрки — что именно продаёт твой контент)

## Голос
(как звучать: «просто, без жаргона, по-дружески»)

## Что запрещено
(что НИКОГДА не писать: темы, слова, обещания)
`

export function SoulEditor() {
  const { t } = useLanguage()
  const soul = useAtomValue(soulAtom)
  const loaded = useAtomValue(soulLoadedAtom)
  const saving = useAtomValue(soulSavingAtom)
  const error = useAtomValue(soulErrorAtom)
  const loadSoul = useSetAtom(loadSoulAtom)
  const saveSoul = useSetAtom(saveSoulAtom)

  const [draft, setDraft] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [tools, setTools] = useState<{ name: string; description: string }[] | null>(
    null
  )

  /**
   * Список возможностей читается С СЕРВЕРА, а не пишется здесь руками.
   *
   * Раньше он был литералом из девяти строк, а в реестре инструментов их
   * больше двух десятков — и расхождение было неизбежным: ничто их не
   * связывало. Ровно на этом в этом же репозитории уже обожглись: GET
   * /compositions отдавал шесть шаблонов, а в бандле существовал ОДИН.
   *
   * `tools/list` по MCP — тот же вход, которым пользуются внешние клиенты,
   * и отвечает он ровно тем массивом, по которому агент и работает.
   */
  const loadTools = useCallback(async () => {
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
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    const d = await res.json()
    const list = d?.result?.tools
    setTools(Array.isArray(list) ? list : [])
  }, [])

  useEffect(() => {
    loadTools().catch(() => setTools([]))
  }, [loadTools])

  useEffect(() => {
    void loadSoul()
  }, [loadSoul])

  useEffect(() => {
    if (loaded) setDraft(soul ?? '')
  }, [loaded, soul])

  const handleSave = async () => {
    const ok = await saveSoul(draft)
    if (ok) {
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    }
  }

  return (
    <section className="soul-editor">
      <h2>
        <Sparkles size={16} /> {t('soul.title')}
      </h2>
      <p className="soul-editor__hint">{t('soul.hint')}</p>

      {error && <div className="soul-editor__error">{error}</div>}

      <textarea
        className="soul-editor__area"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={SOUL_TEMPLATE}
        spellCheck={false}
        rows={12}
      />

      <div className="soul-editor__actions">
        <button
          type="button"
          className="soul-editor__save"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          <span>{savedFlash ? t('soul.saved') : t('soul.save')}</span>
        </button>
        {!soul && (
          <button
            type="button"
            className="soul-editor__template"
            onClick={() => setDraft(SOUL_TEMPLATE)}
          >
            {t('soul.fillTemplate')}
          </button>
        )}
        <span className="soul-editor__counter">{draft.length}/32768</span>
      </div>

      <div className="soul-editor__skills">
        <h3>{t('soul.skillsTitle')}</h3>
        <p className="soul-editor__hint">
          {tools === null
            ? t('soul.skillsHint')
            : `Что агент умеет прямо сейчас — ${tools.length} инструментов, список читается с сервера`}
        </p>
        {tools === null ? (
          <p className="soul-editor__hint">Спрашиваю сервер…</p>
        ) : tools.length === 0 ? (
          <p className="soul-editor__hint">
            Сервер не ответил списком. Он есть, просто сейчас недоступен.
          </p>
        ) : (
          <ul>
            {tools.map(tool => (
              <li key={tool.name}>
                <code>{tool.name}</code> — {tool.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default SoulEditor

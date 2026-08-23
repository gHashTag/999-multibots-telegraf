import { useEffect, useState } from 'react'
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
        <p className="soul-editor__hint">{t('soul.skillsHint')}</p>
        <ul>
          {[
            ['whoami', t('soul.skill.whoami')],
            ['feed_stats', t('soul.skill.feed_stats')],
            ['feed_list', t('soul.skill.feed_list')],
            ['feed_get', t('soul.skill.feed_get')],
            ['templates_list', t('soul.skill.templates_list')],
            ['my_assets', t('soul.skill.my_assets')],
            ['feed_publish', t('soul.skill.feed_publish')],
            ['soul_get', t('soul.skill.soul_get')],
            ['soul_edit', t('soul.skill.soul_edit')],
          ].map(([name, desc]) => (
            <li key={name}>
              <code>{name}</code> — {desc}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default SoulEditor

/**
 * THE LEVEL SWITCH: SEE THE APP AS AN ADMIN, A MANAGER, A BLOGGER, A DEVELOPER.
 *
 * Owner, 2026-10-02: "a button in the menu to switch the user level, to test
 * the UI". Offered to admins and dev builds only; it changes what the screens
 * draw and nothing the server allows (hooks/useUserLevel.ts).
 *
 * Three faces of one control: a compact select for the header, where space
 * is short, a row of chips where there is room (the CRM, the admin badge),
 * and on a phone's CRM the label and the select on one line (`row`): the
 * chips took two lines there, about 100 px of a first screen that has room
 * for one person to answer (P31, `tri shot crm`, 07.10.2026). The phone's
 * own picker is the idiom for one of four when the width is short.
 */
import { USER_LEVELS, USER_LEVEL_LABEL, type UserLevel } from '@vibee/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { canSwitchLevel, useUserLevel } from '@/hooks/useUserLevel'
import './Level.css'

const COPY = {
  en: { label: 'View as', real: 'My own' },
  ru: { label: 'Смотреть как', real: 'Мой' },
} as const

export function LevelSwitch(props: { variant?: 'select' | 'chips' | 'row' }) {
  const { lang } = useLanguage()
  const l = lang === 'ru' ? 'ru' : 'en'
  const { level, switched, setLevel } = useUserLevel()
  if (!canSwitchLevel()) return null
  const copy = COPY[l]

  if (props.variant === 'select' || props.variant === 'row') {
    const select = (
      <select
        className="level-switch-select"
        data-testid={props.variant === 'row' ? undefined : 'level-switch'}
        aria-label={copy.label}
        title={copy.label}
        value={switched && level ? level : ''}
        onChange={e => setLevel((e.target.value || null) as UserLevel | null)}
      >
        <option value="">
          {copy.real}
          {!switched && level ? ` · ${USER_LEVEL_LABEL[level][l]}` : ''}
        </option>
        {USER_LEVELS.map(id => (
          <option key={id} value={id}>
            {USER_LEVEL_LABEL[id][l]}
          </option>
        ))}
      </select>
    )
    if (props.variant === 'select') return select
    return (
      <label
        className="level-switch level-switch--row"
        data-testid="level-switch"
      >
        <span className="level-switch__label">{copy.label}</span>
        {select}
      </label>
    )
  }

  return (
    <div
      className="level-switch"
      role="group"
      aria-label={copy.label}
      data-testid="level-switch"
    >
      <span className="level-switch__label">{copy.label}</span>
      {USER_LEVELS.map(id => (
        <button
          key={id}
          type="button"
          className={`level-switch__chip${level === id ? ' is-on' : ''}`}
          aria-pressed={level === id}
          onClick={() => setLevel(id)}
        >
          {USER_LEVEL_LABEL[id][l]}
        </button>
      ))}
      {switched ? (
        <button
          type="button"
          className="level-switch__chip level-switch__reset"
          onClick={() => setLevel(null)}
        >
          {copy.real}
        </button>
      ) : null}
    </div>
  )
}

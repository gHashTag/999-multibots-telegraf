/**
 * "FILL WITH AI" FOR EVERY FIELD WHERE IT MAKES SENSE.
 *
 * Owner, 2026-09-24: every input gets a button that writes its text with AI
 * -- except logins, passwords and the like. Editing every form in the app to
 * add a button would leave the next form without one, so this is ONE layer
 * (components/AiFill/AiFillLayer.tsx) that watches focus and offers the
 * button beside whichever field qualifies. The rule of which fields qualify
 * lives here, as pure functions, and is tested.
 *
 * A FIELD QUALIFIES WHEN it is a textarea or a plain text input, editable,
 * wide enough to hold a sentence, and nothing about it -- type, autocomplete,
 * name, label, placeholder -- names a secret, an account, a contact, a code,
 * a number or a search. `data-ai="off"` on the field or any ancestor opts a
 * field out (the agent's own composer, the browser's type-into-the-site
 * sheet); `data-ai="on"` opts one in past the heuristics.
 *
 * The server repeats the secret check (render field-fill.ts): this one keeps
 * the button off the screen, that one keeps the model out of it.
 */
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'

const SECRET_WORDS =
  // cyrillic-ok-next-line
  /pass|парол|login|логин|user ?name|e-?mail|почт|phone|телеф|otp|one-time|\bcode\b|код|token|токен|secret|секрет|\bkey\b|ключ(?!ев)|card|карт[аы]|cvv|cvc|iban|\bpin\b|search|поиск|найти|url|link|ссылк|@|сумм|amount|price|цен[аы]\b|\bid\b/i

const BLOCKED_AUTOCOMPLETE =
  /username|password|one-time-code|email|tel|cc-|postal|address|name|bday|url|off-ai/i

const TEXT_TYPES = new Set(['', 'text'])

/** Narrower than this holds a word, not a sentence: no button. */
export const MIN_WIDTH = 140

type Field = HTMLInputElement | HTMLTextAreaElement

/** The words a person reads next to the field: its label, aria, placeholder. */
export function labelOf(el: Field): string {
  const aria = el.getAttribute('aria-label')?.trim()
  if (aria) return aria
  const byFor = el.id
    ? el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    : null
  const wrap = el.closest('label')
  const label = (byFor ?? wrap)?.textContent?.replace(/\s+/g, ' ').trim()
  return label ?? ''
}

export function isFillable(
  target: EventTarget | null,
  width?: number
): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const el = target as Field
  const isArea = el instanceof HTMLTextAreaElement
  const isInput = el instanceof HTMLInputElement
  if (!isArea && !isInput) return false
  if (el.disabled || el.readOnly) return false
  const optedOut = el.closest('[data-ai="off"]')
  if (optedOut) return false
  if (el.getAttribute('data-ai') === 'on') return true
  if (isInput && !TEXT_TYPES.has((el.getAttribute('type') ?? '').toLowerCase()))
    return false
  if (BLOCKED_AUTOCOMPLETE.test(el.getAttribute('autocomplete') ?? ''))
    return false
  if (el.getAttribute('inputmode') && el.getAttribute('inputmode') !== 'text')
    return false
  const words = [
    el.name,
    el.id,
    el.placeholder,
    labelOf(el),
    el.getAttribute('aria-label') ?? '',
  ].join(' ')
  if (SECRET_WORDS.test(words)) return false
  const w = width ?? el.getBoundingClientRect().width
  if (w > 0 && w < MIN_WIDTH) return false
  return true
}

export interface FillPayload {
  field: {
    label: string
    placeholder: string
    name: string
    multiline: boolean
    maxLength: number | null
    current: string
  }
  context: {
    page: string
    title: string
    siblings: Array<{ label: string; value: string }>
  }
  lang: 'ru' | 'en'
}

/** What the model is told about the field, and about the form around it. */
export function describeField(el: Field, lang: 'ru' | 'en'): FillPayload {
  const form = el.closest('form') ?? el.parentElement?.parentElement ?? null
  const siblings: FillPayload['context']['siblings'] = []
  if (form) {
    for (const other of form.querySelectorAll<Field>('input, textarea')) {
      if (other === el || siblings.length >= 8) continue
      // Only what this layer would itself fill: a neighbour that is a
      // password or an e-mail never leaves the page.
      if (!isFillable(other, MIN_WIDTH)) continue
      const value = other.value.trim()
      const label = labelOf(other) || other.placeholder || other.name
      if (value && label) siblings.push({ label, value: value.slice(0, 400) })
    }
  }
  const heading =
    el.ownerDocument.querySelector('h1, h2')?.textContent?.trim() ?? ''
  const max = el.maxLength
  return {
    field: {
      label: labelOf(el),
      placeholder: el.placeholder ?? '',
      name: el.name ?? '',
      multiline: el instanceof HTMLTextAreaElement,
      maxLength: max && max > 0 ? max : null,
      current: el.value ?? '',
    },
    context: {
      page: el.ownerDocument.location?.pathname ?? '',
      title: heading || el.ownerDocument.title || '',
      siblings,
    },
    lang,
  }
}

/**
 * Put text into a field so that React SEES it. Assigning `.value` directly
 * is swallowed by React's value tracker; the prototype's setter plus an
 * `input` event is what a keystroke looks like to a controlled component.
 */
export function setFieldValue(el: Field, text: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (setter) setter.call(el, text)
  else el.value = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export async function requestFill(
  payload: FillPayload,
  doFetch: typeof fetch = fetch
): Promise<{ text: string } | { error: string }> {
  try {
    const r = await doFetch(`${API_BASE}/api/agent/fill`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
    const j = (await r.json().catch(() => ({}))) as {
      text?: string
      error?: string
    }
    if (r.ok && j.text) return { text: j.text }
    return { error: j.error || `HTTP ${r.status}` }
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) }
  }
}

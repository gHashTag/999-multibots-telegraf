/**
 * THE PERSON TYPES ON THEIR OWN PHONE, AND IT LANDS IN THEIR BROWSER.
 *
 * Owner, 2026-09-22, photographed on a phone: "I cannot enter data in the
 * browser -- signing in is hard, it glitches". Typing through the video
 * stream means a remote keyboard over a WebRTC picture: the phone's own
 * keyboard, autocorrect, paste and the password manager all work poorly or
 * not at all. So the app offers a plain field of its own; what the person
 * types there is put into whatever field has focus in THEIR browser.
 *
 * ── WHY THIS IS STILL "THE PERSON TYPES IT THEMSELVES" ───────────────────
 *
 * The rule (CLAUDE.md, browser rule 1) is that a password never reaches the
 * agent and is never kept by us. This door keeps both:
 *   - ONLY THE PERSON'S DOOR. A Mini App signature or an app session. An
 *     agent key is refused (403), exactly like the logins import -- this is
 *     not a tool, it is not in TOOLS, the agent cannot name it.
 *   - NOTHING IS KEPT. The text lives in this request and nowhere else: not
 *     in the journal (which records agent tool calls only), not in a log,
 *     not in an error. Every error here is a fixed sentence of our own.
 *   - IT GOES WHERE THE PERSON CAN SEE. GET answers which SITE and what kind
 *     of field has focus, so the app says "into the password field on
 *     accounts.google.com" before anything is sent. Nothing focused: 409,
 *     and nothing is typed anywhere.
 * The keystrokes of the stream already pass through this server (live
 * proxy); this path is no wider than that one, and far easier to use.
 *
 * Typing takes the wheel: the agent stands still while the person signs in.
 */
import { onPage, frontPage } from './cdp'

/** A password is rarely longer; a pasted token can be. The cap is the body's. */
export const MAX_TYPED_CHARS = 4000
export const MAX_TYPE_BODY_BYTES = 16 * 1024

export interface Focus {
  /** The site, e.g. accounts.google.com; '' when unknown. */
  host: string
  /** password | email | text | number | tel | search | url | textarea | editable | none */
  field: string
  /** What the field calls itself (label, placeholder, aria-label) -- never its value. */
  label: string
}

/*
 * Runs in the page. Reads the focused element's TYPE and NAME, never its
 * value. Walks into same-origin iframes, where sign-in forms often live.
 */
export const FOCUS_PROBE = `(() => {
  let el = document.activeElement;
  let doc = document;
  for (let i = 0; i < 5 && el && el.tagName === 'IFRAME'; i++) {
    try { doc = el.contentDocument; el = doc && doc.activeElement; } catch (e) { break; }
  }
  const host = location.host;
  if (!el || el === doc.body || el === doc.documentElement) return { host, field: 'none', label: '' };
  const tag = el.tagName;
  let field = 'none';
  if (tag === 'INPUT') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    field = ['button','submit','checkbox','radio','file','hidden','image','reset','range','color'].includes(t) ? 'none' : t;
  } else if (tag === 'TEXTAREA') field = 'textarea';
  else if (el.isContentEditable) field = 'editable';
  let label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
  if (!label && el.id) { const l = doc.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) label = l.textContent || ''; }
  if (!label && el.labels && el.labels[0]) label = el.labels[0].textContent || '';
  return { host, field, label: String(label).trim().slice(0, 60) };
})()`

export function focusOf(raw: unknown): Focus {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    host: typeof r.host === 'string' ? r.host.slice(0, 120) : '',
    field: typeof r.field === 'string' ? r.field.slice(0, 20) : 'none',
    label: typeof r.label === 'string' ? r.label.slice(0, 60) : '',
  }
}

/*
 * THE KEYS A PHONE CANNOT SEND THROUGH A VIDEO (owner, 2026-09-22: the
 * buttons were below the page's edge and a swipe on the stream moves the
 * mouse, it does not scroll). Tab moves to the next field, Escape closes a
 * dialog, and scrolling is a real mouse wheel in the middle of the page.
 */
export const KEYS = ['Tab', 'Escape', 'Enter'] as const
export type Key = (typeof KEYS)[number]
export type Scroll = 'up' | 'down'
export const SCROLL_PX = 420

const KEY_CODES: Record<Key, number> = { Tab: 9, Escape: 27, Enter: 13 }

export interface TypeIo {
  focus: (cdp: string) => Promise<Focus>
  insert: (cdp: string, text: string, enter: boolean) => Promise<void>
  press?: (cdp: string, key: Key | null, scroll: Scroll | null) => Promise<void>
}

/** The real pod, over CDP: the front page, the element that has focus. */
export const cdpTypeIo: TypeIo = {
  async focus(cdp) {
    const page = await frontPage(cdp)
    return await onPage(cdp, page.id, async call => {
      const out = await call('Runtime.evaluate', {
        expression: FOCUS_PROBE,
        returnByValue: true,
      })
      return focusOf((out.result as { value?: unknown } | undefined)?.value)
    })
  },
  async press(cdp, key, scroll) {
    const page = await frontPage(cdp)
    await onPage(cdp, page.id, async call => {
      if (key) {
        const code = KEY_CODES[key]
        const base = {
          key,
          code: key,
          windowsVirtualKeyCode: code,
          nativeVirtualKeyCode: code,
        }
        await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base })
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
      }
      if (scroll) {
        const size = await call('Runtime.evaluate', {
          expression: '({ w: innerWidth, h: innerHeight })',
          returnByValue: true,
        })
        const v = ((size.result as { value?: { w?: number; h?: number } })
          ?.value ?? {}) as { w?: number; h?: number }
        await call('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: Math.round((v.w ?? 800) / 2),
          y: Math.round((v.h ?? 600) / 2),
          deltaX: 0,
          deltaY: scroll === 'down' ? SCROLL_PX : -SCROLL_PX,
        })
      }
    })
  },
  async insert(cdp, text, enter) {
    const page = await frontPage(cdp)
    await onPage(cdp, page.id, async call => {
      /* One trusted insertion: a page's own listeners see real input. */
      if (text) await call('Input.insertText', { text })
      if (enter) {
        const key = {
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        }
        await call('Input.dispatchKeyEvent', {
          type: 'keyDown',
          text: '\r',
          ...key,
        })
        await call('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
      }
    })
  },
}

/** The body of POST /api/browser/type. Throws a fixed sentence, never the text. */
export function parseTypeBody(raw: string): {
  text: string
  enter: boolean
  key: Key | null
  scroll: Scroll | null
} {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error('the body is not JSON')
  }
  const b = (body ?? {}) as Record<string, unknown>
  const text = typeof b.text === 'string' ? b.text : ''
  const enter = b.enter === true
  const key = (KEYS as readonly unknown[]).includes(b.key)
    ? (b.key as Key)
    : null
  const scroll = b.scroll === 'up' || b.scroll === 'down' ? b.scroll : null
  if (!text && !enter && !key && !scroll) throw new Error('nothing to type')
  if (text.length > MAX_TYPED_CHARS) throw new Error('too long')
  return { text, enter, key, scroll }
}

/** A field worth typing into. */
export function canTypeInto(f: Focus): boolean {
  return f.field !== 'none'
}

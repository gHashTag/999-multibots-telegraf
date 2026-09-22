/**
 * "JUST PRESS THE BUTTON": FIND IT BY WHAT IT SAYS.
 *
 * Owner, 2026-09-22, watching the agent spend a minute of scripts on
 * LinkedIn's "Sign in with Google": "we are stuck on a simple task -- pull
 * the button and get in". Coordinates from a picture are guesswork, and the
 * Google button is not even in the page: Google Identity Services draws it
 * inside its own iframe (accounts.google.com/gsi/button), so the page's DOM
 * shows a zero-size placeholder. So browser_click can take TEXT: the visible
 * element that says it -- or, for "google", Google's own button frame -- is
 * scrolled into view and pressed with a real mouse click at its centre,
 * which Chromium routes into the frame like a person's tap.
 *
 * Shortest matching label wins ("Save" beats "Save and continue later"),
 * an exact match beats both. Invisible elements never match.
 *
 * A BUTTON THAT SAYS IT COMES BEFORE GOOGLE'S FRAME. 2026-09-22, X's new
 * sign-in dialog: "Continue with Google" is an ordinary button there, and a
 * leftover GIS frame elsewhere on the page took the press instead -- nothing
 * happened. So buttons that say the words are tried first, then the frame,
 * then links and labels (a "Google Privacy Policy" link must not beat the
 * frame on LinkedIn).
 */

/** Runs in the page; returns {x, y, how, label} or null. */
export function findProbe(text: string): string {
  const want = JSON.stringify(text.trim().toLowerCase().replace(/\s+/g, ' '))
  return `(() => {
  const want = ${want};
  if (!want) return null;
  const vis = el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0;
  };
  const centre = el => {
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  const pick = selector => {
    let best = null, bestScore = -1, bestLabel = '';
    for (const el of document.querySelectorAll(selector)) {
      if (!vis(el)) continue;
      const t = [el.innerText || el.textContent || el.value || '', el.getAttribute('aria-label') || '', el.getAttribute('title') || '']
        .join(' ').trim().toLowerCase().replace(/\\s+/g, ' ');
      if (!t.includes(want)) continue;
      const score = (t === want ? 100000 : 0) + 10000 - Math.min(t.length, 9999);
      if (score > bestScore) { best = el; bestScore = score; bestLabel = t; }
    }
    return best ? { el: best, label: bestLabel } : null;
  };
  const button = pick('button, [role="button"], input[type="submit"], input[type="button"]');
  if (button) return Object.assign(centre(button.el), { how: 'text', label: button.label.slice(0, 80) });
  if (want.includes('google')) {
    for (const f of document.querySelectorAll('iframe[src*="accounts.google.com/gsi"]')) {
      if (vis(f)) return Object.assign(centre(f), { how: 'google-frame', label: 'Sign in with Google' });
    }
  }
  /*
   * A FIELD BY WHAT IT IS CALLED (2026-09-22, Apple's "Email or Phone
   * Number"): its words are a placeholder, an aria-label or a <label for>,
   * none of which is the field's own text. Pressing it focuses it, so
   * browser_type goes where the words said.
   */
  const fieldName = el => {
    const own = [el.getAttribute('placeholder') || '', el.getAttribute('aria-label') || ''];
    if (el.id) {
      for (const l of document.querySelectorAll('label[for]'))
        if (l.getAttribute('for') === el.id) own.push(l.innerText || l.textContent || '');
    }
    return own.join(' ').trim().toLowerCase().replace(/\\s+/g, ' ');
  };
  let field = null, fieldScore = -1, fieldLabel = '';
  for (const el of document.querySelectorAll('input, textarea, [contenteditable="true"]')) {
    if (!vis(el) || el.type === 'hidden') continue;
    const t = fieldName(el);
    if (!t.includes(want)) continue;
    const score = (t === want ? 100000 : 0) + 10000 - Math.min(t.length, 9999);
    if (score > fieldScore) { field = el; fieldScore = score; fieldLabel = t; }
  }
  if (field) return Object.assign(centre(field), { how: 'field', label: fieldLabel.slice(0, 80) });
  const other = pick('a, [role="link"], [role="menuitem"], label, [onclick]');
  const best = other ? other.el : null;
  const bestLabel = other ? other.label : '';
  if (!best) return null;
  return Object.assign(centre(best), { how: 'text', label: bestLabel.slice(0, 80) });
})()`
}

export interface Found {
  x: number
  y: number
  how: string
  label: string
}

/** The probe's answer, checked; null when nothing usable came back. */
export function foundOf(raw: unknown): Found | null {
  const r = (raw ?? null) as Partial<Found> | null
  if (!r || typeof r.x !== 'number' || typeof r.y !== 'number') return null
  if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) return null
  return {
    x: r.x,
    y: r.y,
    how: typeof r.how === 'string' ? r.how : 'text',
    label: typeof r.label === 'string' ? r.label : '',
  }
}

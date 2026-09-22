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
  if (want.includes('google')) {
    for (const f of document.querySelectorAll('iframe[src*="accounts.google.com/gsi"]')) {
      if (vis(f)) return Object.assign(centre(f), { how: 'google-frame', label: 'Sign in with Google' });
    }
  }
  const pool = document.querySelectorAll('button, a, [role="button"], [role="link"], [role="menuitem"], input[type="submit"], input[type="button"], label, [onclick]');
  let best = null, bestScore = -1, bestLabel = '';
  for (const el of pool) {
    if (!vis(el)) continue;
    const t = [el.innerText || el.value || '', el.getAttribute('aria-label') || '', el.getAttribute('title') || '']
      .join(' ').trim().toLowerCase().replace(/\\s+/g, ' ');
    if (!t.includes(want)) continue;
    const score = (t === want ? 100000 : 0) + 10000 - Math.min(t.length, 9999);
    if (score > bestScore) { best = el; bestScore = score; bestLabel = t; }
  }
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

/**
 * WHAT IS ON THE PAGE, AS ROWS -- NOT AS A PARAGRAPH.
 *
 * The round reads a page and sends the person the first 90 characters of its
 * text. That answers "is anything new" and nothing else: which invitation,
 * from whom, for what. Every competitor in this space (Stagehand's extract,
 * Skyvern's workflows) returns STRUCTURE, and it is the difference between
 * "hh.ru: 13 new" and "hh.ru: an interview invitation from a company, for an
 * FPGA engineer".
 *
 * No model is needed for that, and using one would be worse: a model reading
 * a page costs money, takes seconds, and invents. This is a probe that runs
 * in the page and returns what the page's own markup already says: the items
 * a person would point at -- articles, list rows, cards -- each with its
 * heading, its first line, its time and its link.
 *
 * Deliberately shallow: no per-site rules, nothing that ages with a
 * redesign. When a page has no items in its markup, it returns none and the
 * round falls back to the text it always sent.
 */

/** One thing on the page a person would point at. */
export interface Item {
  title: string
  text: string
  when: string
  href: string
}

/** How many items are worth carrying into a message. */
export const MAX_ITEMS = 5
/** Below this, a block is furniture rather than an item. */
export const MIN_ITEM_CHARS = 24

/** Runs in the page; returns Item[] as JSON. */
export function itemsProbe(limit = MAX_ITEMS): string {
  return `(() => {
  const seen = new Set();
  const out = [];
  const clean = s => (s || '').replace(/\\s+/g, ' ').trim();
  const vis = el => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 80 && r.height > 24 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const blocks = document.querySelectorAll(
    'article, [role="article"], [role="listitem"], li[data-testid], [data-testid*="cell"], [class*="card"], [class*="item"]'
  );
  for (const el of blocks) {
    if (out.length >= ${limit}) break;
    if (!vis(el)) continue;
    const text = clean(el.innerText).slice(0, 400);
    if (text.length < ${MIN_ITEM_CHARS}) continue;
    /* A block inside a block already counted is the same item twice. */
    let nested = false;
    for (const had of seen) if (had.contains && had.contains(el)) { nested = true; break; }
    if (nested) continue;
    seen.add(el);
    const head = el.querySelector('h1, h2, h3, h4, [role="heading"], a[href]');
    const time = el.querySelector('time');
    const link = el.querySelector('a[href]');
    out.push({
      title: clean(head && head.innerText).slice(0, 120),
      text: text.slice(0, 200),
      when: clean(time && (time.getAttribute('datetime') || time.innerText)).slice(0, 40),
      href: (link && link.getAttribute('href')) || ''
    });
  }
  return JSON.stringify(out);
})()`
}

/** The probe's answer, checked. Never throws. Pure. */
export function itemsOf(raw: unknown): Item[] {
  let rows: unknown = raw
  if (typeof raw === 'string') {
    try {
      rows = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(rows)) return []
  const out: Item[] = []
  for (const row of rows.slice(0, MAX_ITEMS)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const str = (v: unknown, max: number) =>
      typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
    const item = {
      title: str(r.title, 120),
      text: str(r.text, 200),
      when: str(r.when, 40),
      href: str(r.href, 400),
    }
    if (!item.title && !item.text) continue
    out.push(item)
  }
  return out
}

/**
 * One line about one item, in the person's words: the heading if there is
 * one, else the first words; with the time when the page gave one. Pure.
 */
export function itemLine(item: Item): string {
  const head = item.title || item.text
  const short = head.length > 80 ? `${head.slice(0, 79)}…` : head
  return item.when ? `${short} (${item.when})` : short
}

/**
 * WHAT THE LAST DAILY CHECK ACTUALLY CALLED, in words a buyer reads.
 *
 * The acceptance run records the tool names an agent called on a real
 * account (render agent-acceptance.ts, `tools`); a card that says "checked"
 * can show them. Competitor scan, 2026-10-01: marketplaces verify an agent
 * before listing it and observability products log runs after deployment,
 * but none of the listings found shows the calls of a real run on the card.
 *
 * Every key below is a tool the render server declares (pinned by
 * toolWords.test.ts). A name with no words here is shown as it is -- an
 * unexplained name is still true; a guessed description would not be.
 */
const WORDS: Record<string, { en: string; ru: string }> = {
  hive_pulse: {
    en: "Read the project's pulse for the last day",
    ru: 'Прочитал пульс проекта за сутки',
  },
  hive_events: {
    en: "Went through the project's latest events",
    ru: 'Просмотрел последние события проекта',
  },
  feed_list: {
    en: 'Looked through the published reels',
    ru: 'Просмотрел опубликованные ролики',
  },
  my_renders: {
    en: 'Checked the latest renders',
    ru: 'Проверил последние рендеры',
  },
  my_assets: {
    en: 'Looked through the account files',
    ru: 'Просмотрел файлы аккаунта',
  },
  web_search: { en: 'Searched the web', ru: 'Искал в интернете' },
  web_read: { en: 'Read a web page', ru: 'Прочитал страницу' },
  browser_open: {
    en: 'Opened a page in a real browser',
    ru: 'Открыл страницу в настоящем браузере',
  },
  browser_read: {
    en: 'Read a page in a real browser',
    ru: 'Прочитал страницу в настоящем браузере',
  },
  code_run: { en: 'Ran code', ru: 'Запустил код' },
  job_hunters: {
    en: 'Looked up job seekers',
    ru: 'Нашёл соискателей',
  },
}

/** The tool names this file has words for (toolWords.test.ts). */
export const WORDED_TOOLS = Object.keys(WORDS)

export interface CheckedTool {
  name: string
  label: string
  /** How many times the run called it. */
  times: number
}

/**
 * The run's calls, one line per tool in the order first called, with how
 * many times. Pure.
 */
export function checkedTools(
  tools: readonly string[],
  lang: 'en' | 'ru'
): CheckedTool[] {
  const out = new Map<string, CheckedTool>()
  for (const name of tools) {
    const seen = out.get(name)
    if (seen) seen.times += 1
    else out.set(name, { name, label: WORDS[name]?.[lang] ?? name, times: 1 })
  }
  return [...out.values()]
}

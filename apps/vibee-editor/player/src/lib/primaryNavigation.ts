export type PrimaryTabId =
  | 'feed'
  | 'chat'
  | 'browser'
  | 'ai'
  | 'hive'
  | 'profile'

export interface PrimaryNavigationItem {
  id: PrimaryTabId
  route: string
  labelKey: string
  match: RegExp
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavigationItem[] = [
  { id: 'feed', route: '/feed', labelKey: 'nav.feed', match: /^\/feed/ },
  { id: 'chat', route: '/chat', labelKey: 'nav.agent', match: /^\/chat/ },
  /*
   * The browser sits NEXT TO the agent, because that is what it is for:
   * watching the agent work, and taking the wheel from it. Owner's request,
   * 2026-09-20: the tab is there so the screen can be switched to it the
   * moment an agent starts working.
   *
   * It makes six, and the note below warned that the bar starts scrolling
   * past six. MEASURED at 375x812 before shipping: it does not. All six sit
   * in the row with their labels -- feed, agent, browser, AI, hive, profile
   * -- because those labels are short in both languages. A longer label is
   * what would break it, not the count.
   */
  {
    id: 'browser',
    route: '/browser',
    labelKey: 'nav.browser',
    match: /^\/browser/,
  },
  {
    id: 'ai',
    route: '/generate/script',
    labelKey: 'tabs.ai',
    match: /^\/generate/,
  },
  /*
   * The hive is the game. It sits BEFORE the profile, not after it.
   *
   * The last tab is the one a thumb reaches without looking, and the profile
   * has earned that place: people open it constantly. The hive is a
   * destination somebody goes to on purpose, so it goes where the eye lands
   * rather than where the thumb rests.
   *
   * Five tabs still fit a phone. Six were added later and also fit, measured
   * at 375px -- see the browser tab above. The limit is the total width of
   * the labels, not the number of tabs.
   */
  { id: 'hive', route: '/hive', labelKey: 'nav.hive', match: /^\/hive/ },
  {
    id: 'profile',
    route: '/profile',
    labelKey: 'nav.profile',
    match: /^\/profile/,
  },
] as const

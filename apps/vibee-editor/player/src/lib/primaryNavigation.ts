export type PrimaryTabId = 'feed' | 'chat' | 'ai' | 'hive' | 'profile'

export interface PrimaryNavigationItem {
  id: PrimaryTabId
  route: string
  labelKey: string
  match: RegExp
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavigationItem[] = [
  { id: 'feed', route: '/feed', labelKey: 'nav.feed', match: /^\/feed/ },
  { id: 'chat', route: '/chat', labelKey: 'nav.agent', match: /^\/chat/ },
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
   * Five tabs still fit a phone; the bar starts scrolling past six.
   */
  { id: 'hive', route: '/hive', labelKey: 'nav.hive', match: /^\/hive/ },
  {
    id: 'profile',
    route: '/profile',
    labelKey: 'nav.profile',
    match: /^\/profile/,
  },
] as const

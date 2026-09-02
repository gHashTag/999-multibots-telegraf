export type PrimaryTabId = 'feed' | 'chat' | 'ai' | 'profile'

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
  {
    id: 'profile',
    route: '/profile',
    labelKey: 'nav.profile',
    match: /^\/profile/,
  },
] as const

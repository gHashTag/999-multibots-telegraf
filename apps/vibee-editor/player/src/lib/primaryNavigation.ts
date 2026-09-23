import navigation from './navigation.json'

/**
 * THE WEB'S VIEW OF ONE SHARED LIST.
 *
 * Owner, 2026-09-23: the structure must be the same in the web and in the iOS
 * app, and it must come from the backend on .t27. So the list itself lives at
 * apps/vibee-editor/render/src/navigation.json, the render service serves it
 * at GET /api/navigation, and every client ships the same bytes as a fallback
 * for the moment before the first answer arrives -- this file is that copy
 * (scripts/sync-navigation.cjs writes it; a test proves nobody edited it by
 * hand).
 *
 * Why this was needed: a census on that day found the web declaring six
 * destinations here and the iOS app declaring five inline in the body of its
 * TabView, with a comment above it claiming they were the same list in the
 * same order. The web had gained `browser` three days earlier. Nothing
 * connected them, so nothing could say so.
 *
 * What stays HERE is the one thing only a browser has: the address pattern
 * that says "this page is that tab". A regex is not shippable data -- iOS
 * picks its screen by id -- so it lives beside the client that uses it, keyed
 * by the shared id, and a test fails if an id ever appears on one side only.
 */

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

/** Which addresses belong to which tab. Web-only, keyed by the shared id. */
export const TAB_ROUTE_PATTERNS: Record<PrimaryTabId, RegExp> = {
  feed: /^\/feed/,
  // The product tab is the labour market (#2896). The old /chat address
  // remains a working deep link and lights the same tab.
  chat: /^\/(agents|chat)/,
  browser: /^\/browser/,
  ai: /^\/generate/,
  hive: /^\/hive/,
  profile: /^\/profile/,
}

export const PRIMARY_NAV_ITEMS: readonly PrimaryNavigationItem[] =
  navigation.destinations
    .filter(d => d.platforms.includes('web'))
    .map(d => ({
      id: d.id as PrimaryTabId,
      route: d.route,
      labelKey: d.labelKey,
      match: TAB_ROUTE_PATTERNS[d.id as PrimaryTabId],
    }))

/** The version the served list must reach before a client prefers it. */
export const NAVIGATION_VERSION = navigation.version

// Ambient typings for the Telegram Mini Apps runtime injected by
// https://telegram.org/js/telegram-web-app.js
//
// This is the ONLY place window.Telegram is declared. Declaring it a second
// time in a module with a different shape is a TS2717 interface-merge conflict
// ("Subsequent property declarations must have the same type").
//
// No top-level import/export — that would turn this into a module and the
// global augmentation would stop applying.

interface TelegramThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
  header_bg_color?: string
  bottom_bar_bg_color?: string
  accent_text_color?: string
  section_bg_color?: string
  section_header_text_color?: string
  subtitle_text_color?: string
  destructive_text_color?: string
}

interface TelegramSafeAreaInset {
  top: number
  bottom: number
  left: number
  right: number
}

interface TelegramBackButton {
  isVisible: boolean
  show(): void
  hide(): void
  onClick(cb: () => void): void
  offClick(cb: () => void): void
}

interface TelegramHapticFeedback {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
  notificationOccurred(type: 'error' | 'success' | 'warning'): void
  selectionChanged(): void
}

interface TelegramWebAppUser {
  id: number
  is_bot?: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

interface TelegramWebAppInitData {
  query_id?: string
  user?: TelegramWebAppUser
  auth_date?: number
  hash?: string
  start_param?: string
}

interface TelegramWebApp {
  // Bot API 6.0+
  initData: string
  initDataUnsafe: TelegramWebAppInitData
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: TelegramThemeParams
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  headerColor?: string
  backgroundColor?: string
  BackButton: TelegramBackButton
  HapticFeedback: TelegramHapticFeedback

  ready(): void
  expand(): void
  close(): void
  isVersionAtLeast(version: string): boolean
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  onEvent(event: string, cb: (...args: unknown[]) => void): void
  offEvent(event: string, cb: (...args: unknown[]) => void): void
  openLink(url: string, options?: { try_instant_view?: boolean }): void
  openTelegramLink(url: string): void
  // Bot API 6.1+ — оплата инвойсов (в т.ч. Telegram Stars) внутри мини-аппа.
  openInvoice(
    url: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed') => void
  ): void

  // Bot API 7.10+ — the strip under the WebView on phones.
  setBottomBarColor?: (color: string) => void

  // Bot API 7.7+ — absent on older clients, hence optional.
  disableVerticalSwipes?: () => void
  enableVerticalSwipes?: () => void

  // Bot API 8.0+ — absent on older clients.
  safeAreaInset?: TelegramSafeAreaInset
  contentSafeAreaInset?: TelegramSafeAreaInset
  requestFullscreen?: () => void
  exitFullscreen?: () => void
  isFullscreen?: boolean
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}

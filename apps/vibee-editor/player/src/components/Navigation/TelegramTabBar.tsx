import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAtomValue } from 'jotai'
import { Home, PlusSquare, User, Bot, Sparkles } from 'lucide-react'
import { myProfileAtom } from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { haptic } from '@/lib/telegram'
import './TelegramTabBar.css'

// ===============================
// The single navigation surface for the app.
//
// Объединяет две прежние панели, VerticalTabs и BottomNavigation: ни одна
// из них не рендерилась нигде, обе удалены. Совпадающие маршруты слиты, и
// из 6 + 5 вкладок получилось 9 различимых — а затем 5, см. ниже.
// ===============================

interface TabItem {
  id: string
  route: string
  labelKey: string
  icon: React.ReactNode
  /** Extra path prefixes that should light this tab up. */
  match: RegExp
}

/**
 * ПЯТЬ вкладок, а не девять.
 *
 * Было: feed, search, learn, editor, avatar, video, image, audio, profile.
 * Четыре из них — avatar/video/image/audio — это ОДНА функция «генерация» с
 * разным типом результата, разложенная в плоский ряд. При девяти вкладках шаг
 * полосы 476px против экрана 375px: часть уезжала вправо, и человек их не
 * находил.
 *
 * Теперь генерация живёт под одной вкладкой «ИИ», а выбор типа — внутри
 * страницы. Ровно так уже сделано в шапке (NAV_TABS + AI_SUBMENU в
 * components/Header/Header.tsx), нижняя панель просто отставала.
 *
 * Вкладка «Агент» стоит ВТОРОЙ по прямому указанию владельца: это чат с
 * агентом, у которого есть доступ ко всем функциям приложения. Она заменила
 * «Обучение» — учить проще разговором, чем текстом, который никто не читает.
 */
const TABS: TabItem[] = [
  {
    id: 'feed',
    route: '/feed',
    labelKey: 'nav.feed',
    icon: <Home size={20} />,
    match: /^\/feed/,
  },
  {
    id: 'chat',
    route: '/chat',
    labelKey: 'nav.agent',
    icon: <Bot size={20} />,
    match: /^\/chat/,
  },
  {
    id: 'editor',
    route: '/editor',
    labelKey: 'nav.create',
    icon: <PlusSquare size={20} />,
    match: /^\/editor/,
  },
  {
    id: 'ai',
    route: '/generate/video',
    labelKey: 'tabs.ai',
    icon: <Sparkles size={20} />,
    match: /^\/generate/,
  },
  {
    id: 'profile',
    route: '/profile',
    labelKey: 'nav.profile',
    icon: <User size={20} />,
    match: /^\/profile/,
  },
]

/** Pages that own the full screen and must not be overlapped. */
const HIDDEN_EXACT = new Set([
  '/', // transient — redirects to /feed
  '/home', // marketing landing
  '/privacy-policy',
  '/terms-service',
  '/terms-of-service',
])
const HIDDEN_PREFIXES = ['/instagram/']

export function TelegramTabBar() {
  /**
   * Реальная высота нижней панели в CSS-переменную: константа --nav-height
   * (64px) расходится с фактическими 57px, и на этой разнице превью теряло
   * высоту, а нижние пиксели таймлайна уезжали под панель.
   */
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * Активная вкладка подтягивается в видимую часть.
   *
   * Вкладок девять, влезает шесть — три уезжают вправо. Полоса прокручивалась
   * и раньше, но об этом ничто не сообщало: человек видел шесть вкладок и
   * считал, что других нет. Если он оказался на «Профиле» (например по
   * прямой ссылке), активная вкладка была за краем — интерфейс выглядел так,
   * будто ничего не выбрано.
   */

  /** Подсказка «есть ещё»: тень у того края, за которым спрятаны вкладки. */
  const [edges, setEdges] = useState({ start: false, end: false })
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const update = () => {
      const max = sc.scrollWidth - sc.clientWidth
      setEdges({ start: sc.scrollLeft > 4, end: sc.scrollLeft < max - 4 })
    }
    update()
    sc.addEventListener('scroll', update, { passive: true })
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(sc)
    return () => {
      sc.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [])

  const tabbarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = tabbarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const publish = () => {
      document.documentElement.style.setProperty(
        '--tabbar-actual-h',
        `${Math.round(el.getBoundingClientRect().height)}px`
      )
    }
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.removeProperty('--tabbar-actual-h')
    }
  }, [])

  const { t } = useLanguage()
  const location = useLocation()
  const myProfile = useAtomValue(myProfileAtom)

  // Активная вкладка подтягивается в видимую часть: вкладок девять, влезает
  // шесть, и по прямой ссылке на «Профиль» активная оказывалась за краем —
  // интерфейс выглядел так, будто ничего не выбрано.
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const active = sc.querySelector<HTMLElement>(
      '.tma-tabbar__item.is-active, [aria-current]'
    )
    active?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [location.pathname])

  const hidden =
    HIDDEN_EXACT.has(location.pathname) ||
    HIDDEN_PREFIXES.some(p => location.pathname.startsWith(p))

  // Published on <body> so page layout can reserve space for the bar without
  // every page needing to know it exists.
  useEffect(() => {
    if (hidden) {
      document.body.removeAttribute('data-tabbar')
    } else {
      document.body.setAttribute('data-tabbar', 'visible')
    }
    return () => document.body.removeAttribute('data-tabbar')
  }, [hidden])

  if (hidden) return null

  const activeId =
    TABS.find(tab => tab.match.test(location.pathname))?.id ??
    // /:username is the profile route for a logged-in user
    (myProfile?.username && location.pathname === `/${myProfile.username}`
      ? 'profile'
      : undefined)

  return (
    <nav ref={tabbarRef} className="tma-tabbar" aria-label="Primary">
      <div
        ref={scrollRef}
        className={`tma-tabbar__scroll${edges.start ? ' has-start' : ''}${edges.end ? ' has-end' : ''}`}
      >
        {TABS.map(tab => {
          // ProfileRedirect resolves /profile to /:username, but linking
          // straight there avoids a redirect hop when the profile is loaded.
          const to =
            tab.id === 'profile' && myProfile?.username
              ? `/${myProfile.username}`
              : tab.route

          return (
            <Link
              key={tab.id}
              to={to}
              className={`tma-tabbar__item ${activeId === tab.id ? 'active' : ''}`}
              onClick={() => haptic.selection()}
              aria-current={activeId === tab.id ? 'page' : undefined}
            >
              <span className="tma-tabbar__icon">{tab.icon}</span>
              <span className="tma-tabbar__label">{t(tab.labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export { TABS as TAB_BAR_ITEMS }

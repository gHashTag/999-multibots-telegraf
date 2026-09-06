import { useSearchParams } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ProfileFilesGrid } from './ProfileFilesGrid'
import { ProfileSkills } from './ProfileSkills'
import { ProfilePlan } from './ProfilePlan'
import { ProfilePending } from './ProfilePending'
import { ConnectTelegram } from './ConnectTelegram'
import { useIsOwnProfile } from './useIsOwnProfile'
import { ProfileBlog } from './ProfileBlog'
import { SoulEditor } from './SoulEditor'
import { PairWithApp } from './PairWithApp'
import {
  Bot,
  Grid,
  Users,
  UserPlus,
  FolderOpen,
  Sparkles,
  Wand2,
  BookOpen,
  Target,
  Clock,
} from 'lucide-react'
import {
  viewedProfileAtom,
  followersAtom,
  followersLoadingAtom,
  followingAtom,
  followingLoadingAtom,
  loadFollowersAtom,
  loadFollowingAtom,
} from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { UserCard } from './UserCard'
import { ProfileTemplatesGrid } from './ProfileTemplatesGrid'
import { profileTabCount } from './profileTabCounts'

type TabId =
  | 'templates'
  | 'pending'
  | 'plan'
  | 'files'
  | 'skills'
  | 'soul'
  | 'agent'
  | 'blog'
  | 'followers'
  | 'following'

const OWNER_TAB_ORDER: TabId[] = [
  'templates',
  // Сразу за роликами: то, что ждёт решения, не должно лежать в конце ряда.
  // Раздела нет у чужого профиля — там нечего одобрять.
  'pending',
  'plan',
  'files',
  'skills',
  'soul',
  'agent',
  'blog',
  'followers',
  'following',
]
/** Все известные имена вкладок — для сверки того, что пришло из адреса. */
const ВСЕ_ВКЛАДКИ: TabId[] = [
  'templates',
  'pending',
  'plan',
  'files',
  'skills',
  'soul',
  'agent',
  'blog',
  'followers',
  'following',
]

const PUBLIC_TAB_ORDER: TabId[] = [
  'templates',
  'blog',
  'followers',
  'following',
]

export function ProfileTabs() {
  const { t } = useLanguage()
  const isOwn = useIsOwnProfile()
  const tabOrder = isOwn ? OWNER_TAB_ORDER : PUBLIC_TAB_ORDER
  /**
   * НАЧАЛЬНАЯ ВКЛАДКА — ИЗ АДРЕСА, ЕСЛИ ЕЁ ТАМ НАЗВАЛИ.
   *
   * Найдено 07.09.2026 разбором пути, который бот РЕКЛАМИРУЕТ.
   *
   * Команда `/app` пишет человеку: «Нажмите кнопку — откроется окно с кодом».
   * Кнопка открывала мини-апп на `/profile`, а `/profile` открывался на
   * вкладке «Шаблоны». Код входа живёт во вкладке «Агент», о которой в
   * сообщении нет ни слова. Человек, пришедший ЗА КОДОМ по единственному
   * рекламируемому пути, кода не видел.
   *
   * Имя вкладки сверяется со списком: чужая строка в адресе не должна
   * открывать несуществующий раздел или раздел чужого профиля (у чужого
   * профиля свой, короткий порядок вкладок, и `visibleActiveTab` ниже это
   * уже учитывает).
   */
  const [searchParams] = useSearchParams()
  const изАдреса = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<TabId>(
    ВСЕ_ВКЛАДКИ.includes(изАдреса as TabId) ? (изАдреса as TabId) : 'templates'
  )
  const visibleActiveTab = tabOrder.includes(activeTab)
    ? activeTab
    : 'templates'
  const contentRef = useRef<HTMLDivElement>(null)

  // Swipe navigation between tabs
  const goToNextTab = useCallback(() => {
    const currentIndex = tabOrder.indexOf(visibleActiveTab)
    if (currentIndex < tabOrder.length - 1) {
      setActiveTab(tabOrder[currentIndex + 1])
    }
  }, [tabOrder, visibleActiveTab])

  const goToPrevTab = useCallback(() => {
    const currentIndex = tabOrder.indexOf(visibleActiveTab)
    if (currentIndex > 0) {
      setActiveTab(tabOrder[currentIndex - 1])
    }
  }, [tabOrder, visibleActiveTab])

  useSwipeGesture({
    containerRef: contentRef,
    onSwipeLeft: goToNextTab,
    onSwipeRight: goToPrevTab,
    threshold: 50,
  })

  const profile = useAtomValue(viewedProfileAtom)

  const followers = useAtomValue(followersAtom)
  const followersLoading = useAtomValue(followersLoadingAtom)
  const loadFollowers = useSetAtom(loadFollowersAtom)

  const following = useAtomValue(followingAtom)
  const followingLoading = useAtomValue(followingLoadingAtom)
  const loadFollowing = useSetAtom(loadFollowingAtom)

  useEffect(() => {
    if (!profile) return

    if (visibleActiveTab === 'followers') {
      loadFollowers(profile.username)
    } else if (visibleActiveTab === 'following') {
      loadFollowing(profile.username)
    }
  }, [visibleActiveTab, profile?.username])

  if (!profile) return null

  // План, файлы и скиллы — только на СВОЁМ профиле: чужие замыслы и
  // генерации не публичный контент. Правило одно на весь экран профиля,
  // см. useIsOwnProfile: раньше их было два, и они расходились.
  const tabs = [
    {
      id: 'templates' as const,
      icon: <Grid size={18} />,
      label: t('profile.templates'),
      count: profileTabCount(profile, 'templates'),
    },
    ...(isOwn
      ? [
          {
            /*
             * ЖДУТ ОДОБРЕНИЯ — только на СВОЁМ профиле.
             *
             * Агент публикует сам, и владелец просил, чтобы в ленте было
             * только одобренное. Скрытый пост не виден нигде больше — все
             * чтения фильтруют `is_public = TRUE`, — поэтому без этого
             * раздела одобрять было бы негде.
             */
            id: 'pending' as const,
            icon: <Clock size={18} />,
            label: 'Ждут одобрения',
          },
          {
            id: 'plan' as const,
            icon: <Target size={18} />,
            label: 'План',
            count: profileTabCount(profile, 'plan'),
          },
          {
            id: 'files' as const,
            icon: <FolderOpen size={18} />,
            label: 'Файлы',
            count: profileTabCount(profile, 'files'),
          },
          {
            id: 'skills' as const,
            icon: <Wand2 size={18} />,
            label: 'Скиллы',
            count: profileTabCount(profile, 'skills'),
          },
          {
            id: 'soul' as const,
            icon: <Sparkles size={18} />,
            label: 'SOUL.md',
            count: null,
          },
          {
            id: 'agent' as const,
            icon: <Bot size={18} />,
            label: 'Агент',
            count: null,
          },
        ]
      : []),
    {
      id: 'blog' as const,
      icon: <BookOpen size={18} />,
      label: 'Блог',
      count: profileTabCount(profile, 'blog'),
    },
    {
      id: 'followers' as const,
      icon: <Users size={18} />,
      label: t('profile.followers'),
      count: profileTabCount(profile, 'followers'),
    },
    {
      id: 'following' as const,
      icon: <Users size={18} />,
      label: t('profile.following'),
      count: profileTabCount(profile, 'following'),
    },
  ].filter(Boolean)

  return (
    <div className="profile-tabs">
      <div className="profile-tabs__header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`profile-tabs__tab ${visibleActiveTab === tab.id ? 'profile-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== null && (
              <span className="profile-tabs__count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      <div
        className={`profile-tabs__content ${
          visibleActiveTab === 'agent' ? 'profile-tabs__content--agent' : ''
        }`}
        ref={contentRef}
      >
        {visibleActiveTab === 'templates' && (
          <ProfileTemplatesGrid username={profile.username} isOwn={isOwn} />
        )}

        {visibleActiveTab === 'pending' && <ProfilePending />}
        {visibleActiveTab === 'plan' && <ProfilePlan />}

        {visibleActiveTab === 'files' && <ProfileFilesGrid />}

        {visibleActiveTab === 'skills' && <ProfileSkills />}

        {visibleActiveTab === 'soul' && <SoulEditor />}

        {visibleActiveTab === 'agent' && (
          <>
            <PairWithApp />
            {/*
              Подключение Telegram живёт во вкладке «Агент», а не отдельной:
              это и есть то, ЧЕМ агент будет пользоваться. Рядом с ключом
              подключения оно читается как продолжение одной мысли, а не как
              отдельная настройка, до которой ещё надо додуматься.
            */}
            <ConnectTelegram />
          </>
        )}

        {visibleActiveTab === 'blog' && <ProfileBlog />}

        {visibleActiveTab === 'followers' && (
          <div className="profile-tabs__users">
            {followersLoading ? (
              <div className="profile-tabs__users">
                {[1, 2, 3].map(i => (
                  <div key={i} className="user-card">
                    <div
                      className="skeleton skeleton-avatar"
                      style={{ width: 48, height: 48 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="skeleton skeleton-text skeleton-text--md" />
                      <div className="skeleton skeleton-text skeleton-text--sm" />
                    </div>
                  </div>
                ))}
              </div>
            ) : followers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">
                  <Users size={48} />
                </div>
                <h3 className="empty-state__title">
                  {t('profile.no_followers')}
                </h3>
                <p className="empty-state__desc">
                  {t('profile.no_followers_desc')}
                </p>
              </div>
            ) : (
              followers.map(user => <UserCard key={user.id} user={user} />)
            )}
          </div>
        )}

        {visibleActiveTab === 'following' && (
          <div className="profile-tabs__users">
            {followingLoading ? (
              <div className="profile-tabs__users">
                {[1, 2, 3].map(i => (
                  <div key={i} className="user-card">
                    <div
                      className="skeleton skeleton-avatar"
                      style={{ width: 48, height: 48 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="skeleton skeleton-text skeleton-text--md" />
                      <div className="skeleton skeleton-text skeleton-text--sm" />
                    </div>
                  </div>
                ))}
              </div>
            ) : following.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">
                  <UserPlus size={48} />
                </div>
                <h3 className="empty-state__title">
                  {t('profile.no_following')}
                </h3>
                <p className="empty-state__desc">
                  {t('profile.no_following_desc')}
                </p>
              </div>
            ) : (
              following.map(user => <UserCard key={user.id} user={user} />)
            )}
          </div>
        )}
      </div>
    </div>
  )
}

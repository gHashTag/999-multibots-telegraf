import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAtomValue, useSetAtom } from 'jotai'
import { UserX } from 'lucide-react'
import {
  viewedProfileAtom,
  profileLoadingAtom,
  profileErrorAtom,
  loadProfileAtom,
} from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { Header } from '@/components/Header'
import { ProfileHeader, ProfileTabs, ProfileEdit } from '@/components/Profile'
import { SoulCard } from '@/components/Profile/SoulCard'
import { useIsOwnProfile } from '@/components/Profile/useIsOwnProfile'
import { ProfileConnectGate } from '@/components/Profile/ProfileConnectGate'
import { profileScreen } from '@/components/Profile/profileGate'
import {
  agentTelegramConnectedAtom,
  loadAgentTelegramStatusAtom,
} from '@/atoms/agentTelegram'
import '@/components/Profile/Profile.css'

export function ProfilePage() {
  const { t } = useLanguage()
  const { username } = useParams<{ username: string }>()

  const profile = useAtomValue(viewedProfileAtom)
  const своя = useIsOwnProfile()
  const isOwn = своя // cyrillic-ok: the existing identifier of this file
  const loading = useAtomValue(profileLoadingAtom)
  const error = useAtomValue(profileErrorAtom)
  const loadProfile = useSetAtom(loadProfileAtom)
  const [showEdit, setShowEdit] = useState(false)
  const connected = useAtomValue(agentTelegramConnectedAtom)
  const loadConnected = useSetAtom(loadAgentTelegramStatusAtom)

  useEffect(() => {
    if (username) {
      loadProfile(username)
    }
  }, [username, loadProfile])

  /*
   * CONNECT FIRST, THEN THE PROFILE.
   *
   * Owner, 2026-09-09: "the profile must not show until the person signed in
   * by phone — a mandatory step, otherwise the agent does not work". The status
   * is asked once per session, only for your own profile; ConnectTelegram
   * flips the same atom when the person finishes or disconnects. Which screen
   * that yields is decided in profileGate.ts, with its reasons.
   */
  useEffect(() => {
    if (isOwn && connected === null) void loadConnected()
  }, [isOwn, connected, loadConnected])

  const screen = profileScreen({
    loading,
    own: isOwn,
    connected,
    devBypass:
      import.meta.env.DEV &&
      new URLSearchParams(window.location.search).has('свой'),
  })

  if (screen === 'skeleton') {
    return (
      <>
        <Header />
        <div className="profile-page">
          <div className="profile-page__container">
            {/* Skeleton Cover */}
            <div
              className="skeleton"
              style={{ height: 200, borderRadius: '1rem 1rem 0 0' }}
            />

            {/* Skeleton Header */}
            <div className="profile-header" style={{ marginTop: -60 }}>
              <div className="profile-header__top">
                <div
                  className="skeleton skeleton-avatar"
                  style={{ width: 130, height: 130 }}
                />
                <div className="profile-header__info" style={{ flex: 1 }}>
                  <div
                    className="skeleton skeleton-text skeleton-text--lg"
                    style={{ marginBottom: 8 }}
                  />
                  <div
                    className="skeleton skeleton-text skeleton-text--sm"
                    style={{ marginBottom: 16 }}
                  />
                  <div className="skeleton skeleton-text skeleton-text--md" />
                </div>
              </div>

              {/* Skeleton Stats */}
              <div className="profile-stats">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="skeleton"
                    style={{ height: 80, borderRadius: 12 }}
                  />
                ))}
              </div>
            </div>

            {/* Skeleton Tabs */}
            <div className="profile-tabs" style={{ marginTop: 24 }}>
              <div className="profile-tabs__header">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="skeleton"
                    style={{ flex: 1, height: 48 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (error || !profile) {
    return (
      <>
        <Header />
        <div className="profile-page">
          <div className="profile-page__container">
            <div className="profile-page__error">
              <UserX size={64} />
              <h2>{t('profile.not_found')}</h2>
              <p>{error || t('profile.not_found_desc')}</p>
              <Link to="/" className="profile-page__error-home">
                {t('common.go_home')}
              </Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (screen === 'connect') {
    return (
      <>
        <Header />
        <div className="profile-page">
          <div className="profile-page__container">
            <ProfileConnectGate />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="profile-page">
        <div className="profile-page__container">
          {/*
            ФЛАГ РАЗРАБОТЧИКА ОБЪЯВЛЯЕТ СЕБЯ.

            `?свой=1` принудительно включает режим «это мой профиль», чтобы
            разделы владельца можно было ПОСМОТРЕТЬ без подписи Telegram.
            Молчащий флаг стоил владельцу времени: он увидел у себя кнопки
            правки и решил, что их видят все. Кнопки и правда только у
            хозяина — хозяином его сделал мой флаг.
            
            Полоса видна только в сборке разработчика: в рабочей ветки нет.
          */}
          {import.meta.env.DEV &&
            new URLSearchParams(location.search).has('свой') && (
              <div className="profile-devflag">
                Режим разработчика: профиль показан как СВОЙ (
                <code>?свой=1</code>). Уберите метку из адреса — увидите
                гостевой вид.
              </div>
            )}
          <ProfileHeader onEditClick={() => setShowEdit(true)} />
          {/*
            SOUL СРАЗУ ПОД ШАПКОЙ, ДО ВКЛАДОК.

            Он был седьмой вкладкой и только у себя. Но SOUL.md — это то, по
            чему людей находят: по нему знакомятся люди и агенты a2a.
            Спрятанный на седьмой вкладке открытый файл почти не отличается
            от закрытого.
          */}
          {profile?.username && (
            <SoulCard
              username={profile.username}
              isOwn={своя}
              onEdit={() => setShowEdit(true)}
            />
          )}
          <ProfileTabs />

          <ProfileEdit isOpen={showEdit} onClose={() => setShowEdit(false)} />
        </div>
      </div>
    </>
  )
}

export default ProfilePage

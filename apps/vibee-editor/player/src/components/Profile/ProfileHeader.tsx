import { useEffect, useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  User,
  Users,
  Video,
  Eye,
  Heart,
  Settings,
  CheckCircle,
  Camera,
  Sparkles,
} from 'lucide-react'
import {
  viewedProfileAtom,
  userAtom,
  followUserAtom,
  unfollowUserAtom,
  showLoginModalAtom,
} from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { FollowButton } from './FollowButton'
import { SocialLinks } from './SocialLinks'
import { useIsOwnProfile } from './useIsOwnProfile'

interface ProfileHeaderProps {
  onEditClick?: () => void
}

export function ProfileHeader({ onEditClick }: ProfileHeaderProps) {
  const { t } = useLanguage()
  const profile = useAtomValue(viewedProfileAtom)
  const isOwn = useIsOwnProfile()
  const user = useAtomValue(userAtom)
  const follow = useSetAtom(followUserAtom)
  const unfollow = useSetAtom(unfollowUserAtom)
  const [, setShowLogin] = useAtom(showLoginModalAtom)

  if (!profile) return null

  const [avatarError, setAvatarError] = useState(false)

  // Use Telegram data as fallback when profile has no avatar/name
  const rawAvatarUrl = profile.avatar_url || (isOwn && user?.photo_url) || null
  const avatarUrl =
    rawAvatarUrl && rawAvatarUrl !== 'null' && rawAvatarUrl !== 'undefined'
      ? rawAvatarUrl
      : null
  const displayName =
    profile.display_name || (isOwn && user?.first_name) || profile.username

  const handleFollowClick = async () => {
    console.log(
      '[Follow] Clicked, user:',
      user?.id,
      'target:',
      profile.username
    )
    if (!user) {
      console.log('[Follow] No user, showing login modal')
      setShowLogin(true)
      return
    }

    if (profile.is_following) {
      console.log('[Follow] Unfollowing...')
      await unfollow(profile.username)
    } else {
      console.log('[Follow] Following...')
      const result = await follow(profile.username)
      console.log('[Follow] Result:', result)
    }
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const stats = [
    {
      icon: <Users size={18} />,
      value: profile.followers_count,
      label: t('profile.followers'),
    },
    {
      icon: <Users size={18} />,
      value: profile.following_count,
      label: t('profile.following'),
    },
    {
      icon: <Video size={18} />,
      value: profile.templates_count,
      label: t('profile.videos'),
    },
    {
      icon: <Eye size={18} />,
      value: profile.total_views,
      label: t('profile.views'),
    },
    {
      icon: <Heart size={18} />,
      value: profile.total_likes,
      label: t('profile.likes'),
    },
  ]

  /**
   * Сделать обложку из аватарки и SOUL. Платит платформа, поэтому только по
   * нажатию и не чаще раза в сутки — ограничитель держит сервер, здесь мы
   * лишь показываем его ответ словами.
   */
  const [делаю, setДелаю] = useState(false)
  const [ошибкаОбложки, setОшибкаОбложки] = useState<string | null>(null)
  const [свежаяОбложка, setСвежаяОбложка] = useState<string | null>(null)
  const сделатьОбложку = async () => {
    setДелаю(true)
    setОшибкаОбложки(null)
    try {
      const о = await fetch(`${API_BASE}/api/profile/cover`, {
        method: 'POST',
        headers: authHeaders(),
      })
      const д = await о.json().catch(() => null)
      if (!о.ok || !д?.coverUrl) throw new Error(д?.error || `HTTP ${о.status}`)
      // Показываем сразу: человек нажал и должен увидеть результат, а не
      // гадать, получилось ли.
      setСвежаяОбложка(д.coverUrl as string)
    } catch (e) {
      setОшибкаОбложки(
        `Не получилось: ${e instanceof Error ? e.message : String(e)}`
      )
    } finally {
      setДелаю(false)
    }
  }

  return (
    <>
      {/* Cover Image */}
      <div className="profile-cover">
        {свежаяОбложка || profile.cover_url ? (
          <img
            src={свежаяОбложка || profile.cover_url || ''}
            alt=""
            className="profile-cover__image"
          />
        ) : null}
        <div className="profile-cover__gradient" />
        {isOwn && (
          <div className="profile-cover__actions">
            <button className="profile-cover__edit" onClick={onEditClick}>
              <Camera size={16} />
              <span>{t('profile.edit_cover')}</span>
            </button>
            {/*
              ОБЛОЖКА ПО НАЖАТИЮ, А НЕ КАЖДОМУ ПРИ ВХОДЕ.
              Рисуем за свой счёт, поэтому тратим только на того, кто
              попросил: генерация каждому при входе — расход на всех сразу,
              включая тех, кто обложку никогда не откроет.
            */}
            <button
              className="profile-cover__edit"
              disabled={делаю}
              onClick={сделатьОбложку}
            >
              <Sparkles size={16} />
              <span>{делаю ? 'Рисую…' : 'Сделать обложку'}</span>
            </button>
          </div>
        )}
        {ошибкаОбложки && (
          <p className="profile-cover__error">{ошибкаОбложки}</p>
        )}
      </div>

      <div className="profile-header">
        <div className="profile-header__top">
          {/* Animated Avatar */}
          <div className="profile-header__avatar">
            <div className="profile-header__avatar-inner">
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt={profile.display_name || profile.username}
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <div className="profile-header__avatar-placeholder">
                  <User size={48} />
                </div>
              )}
            </div>
          </div>

          <div className="profile-header__info">
            <h1 className="profile-header__name">
              {displayName}
              {profile.is_verified && (
                <span className="verified-badge" title="Verified">
                  <CheckCircle size={20} />
                </span>
              )}
            </h1>
            <p className="profile-header__username">@{profile.username}</p>

            {profile.bio && (
              <p className="profile-header__bio">{profile.bio}</p>
            )}

            <SocialLinks links={profile.social_links} />
          </div>

          <div className="profile-header__actions">
            {isOwn ? (
              <button
                className="profile-header__edit-btn"
                onClick={onEditClick}
              >
                <Settings size={18} />
                <span>{t('profile.edit')}</span>
              </button>
            ) : (
              <FollowButton
                isFollowing={profile.is_following}
                onClick={handleFollowClick}
              />
            )}
          </div>
        </div>

        {/* Stats Cards with Glassmorphism */}
        <ProfileTokens isOwn={isOwn} />
        <div className="profile-stats">
          {stats.map((stat, index) => (
            <div key={index} className="profile-stat-card">
              <div className="profile-stat-card__icon">{stat.icon}</div>
              <span className="profile-stat-card__value">
                {formatNumber(stat.value)}
              </span>
              <span className="profile-stat-card__label">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Токены в шапке СВОЕГО профиля: цена генераций видна там же, где
 * человек решает, что делать дальше. Бесплатный my_balance.
 * Показываем и чужим профилям только если баланс запросился — он
 * и запросится только у подписанного (своего), для чужих fetch
 * вернёт чужой баланс только по своей подписи, поэтому скрыто.
 */
function ProfileTokens({ isOwn }: { isOwn: boolean }) {
  const [tokens, setTokens] = useState<number | null>(null)
  /**
   * PRICES COME FROM THE SAME RESPONSE AS THE BALANCE.
   *
   * This header used to spell three prices out by hand -- 1 / 1 / 20 --
   * half of what the server charges: the owner's markup reached the charge
   * and never reached the header. `my_balance` returns a price map in the
   * very same response as the balance; a second copy of the table drifts
   * from the first silently, and it had.
   */
  const [prices, setPrices] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    ;(async () => {
      try {
        const headers = authHeaders()
        const devKey = import.meta.env.DEV
          ? (import.meta.env.VITE_AGENT_KEY as string | undefined)
          : undefined
        if (devKey && !headers.has('X-Telegram-Init-Data')) {
          headers.set('X-Agent-Key', devKey)
        }
        const res = await fetch(`${API_BASE}/mcp`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'my_balance', arguments: {} },
          }),
        })
        const d = await res.json()
        const bal = d?.result?.structuredContent?.['баланс_токенов']
        if (typeof bal === 'number') setTokens(bal)
        const p = d?.result?.structuredContent?.['прайс']
        if (p && typeof p === 'object') setPrices(p as Record<string, number>)
      } catch {
        /* баланс — не блокировщик профиля */
      }
    })()
  }, [])
  if (tokens === null || !isOwn) return null
  // Quote a price ONLY when the server named it: a caption without prices
  // beats a caption with invented ones.
  const priceCaption = (
    [
      ['image_generate', 'картинка'], // cyrillic-ok: user-facing label
      ['reel_render', 'рилс'], // cyrillic-ok: user-facing label
      ['video_generate', 'видео'], // cyrillic-ok: user-facing label
    ] as Array<[string, string]>
  )
    .map(([op, label]) => (prices?.[op] ? ` · ${label} ${prices[op]}` : ''))
    .join('')
  return (
    <div className="profile-tokens">
      💰 {tokens} токенов{priceCaption}
    </div>
  )
}

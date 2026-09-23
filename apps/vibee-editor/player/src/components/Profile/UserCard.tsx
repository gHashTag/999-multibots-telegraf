import { useState } from 'react'
import { Link } from 'react-router-dom'
import { User } from 'lucide-react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  userAtom,
  followUserAtom,
  unfollowUserAtom,
  openLoginAtom,
} from '@/atoms'
import type { FollowUser } from '@/atoms'
import { FollowButton } from './FollowButton'
import { useToast } from '@/hooks/useToast'

interface UserCardProps {
  user: FollowUser
}

export function UserCard({ user }: UserCardProps) {
  const currentUser = useAtomValue(userAtom)
  const follow = useSetAtom(followUserAtom)
  const unfollow = useSetAtom(unfollowUserAtom)
  const openLogin = useSetAtom(openLoginAtom)
  const toast = useToast()

  /*
   * "Is this card me" used to compare the viewer's telegram_id with an `id`
   * field on the row. The list route is public, so that field was the person's
   * telegram_id handed to anyone who asked; the server now marks the viewer's
   * own row instead and sends no ids at all.
   */
  const isOwnProfile = user.is_self

  const handleFollowClick = async () => {
    if (!currentUser) {
      openLogin('follow')
      return
    }

    const result = user.is_following
      ? await unfollow(user.username)
      : await follow(user.username)
    // A refusal used to revert the button and say nothing at all.
    if (!result.ok && result.reason && result.reason !== 'not_signed_in') {
      toast.error(result.reason)
    }
  }

  const [imgError, setImgError] = useState(false)
  const avatarUrl =
    user.avatar_url &&
    user.avatar_url !== 'null' &&
    user.avatar_url !== 'undefined'
      ? user.avatar_url
      : undefined

  return (
    <div className="user-card">
      <Link to={`/${user.username}`} className="user-card__link">
        <div className="user-card__avatar">
          {avatarUrl && !imgError ? (
            <img
              src={avatarUrl}
              alt={user.display_name || user.username}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="user-card__avatar-placeholder">
              <User size={24} />
            </div>
          )}
        </div>

        <div className="user-card__info">
          <span className="user-card__name">
            {user.display_name || user.username}
          </span>
          <span className="user-card__username">@{user.username}</span>
        </div>
      </Link>

      {!isOwnProfile && (
        <FollowButton
          isFollowing={user.is_following}
          onClick={handleFollowClick}
          size="small"
        />
      )}
    </div>
  )
}

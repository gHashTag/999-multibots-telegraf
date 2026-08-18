import { useState } from 'react';
import { UserPlus, UserMinus } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

interface FollowButtonProps {
  isFollowing: boolean;
  onClick: () => Promise<void>;
  size?: 'small' | 'medium' | 'large';
}

export function FollowButton({ isFollowing, onClick, size = 'medium' }: FollowButtonProps) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await onClick();
    } finally {
      setIsLoading(false);
    }
  };

  const showUnfollow = isFollowing && isHovered;

  return (
    <button
      className={`follow-button follow-button--${size} ${isFollowing ? 'follow-button--following' : ''} ${showUnfollow ? 'follow-button--unfollow' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isLoading}
    >
      {isLoading ? (
        <span className="follow-button__loader" />
      ) : showUnfollow ? (
        <>
          <UserMinus size={size === 'small' ? 14 : 18} />
          <span>{t('profile.unfollow')}</span>
        </>
      ) : isFollowing ? (
        <>
          <span>{t('profile.following_btn')}</span>
        </>
      ) : (
        <>
          <UserPlus size={size === 'small' ? 14 : 18} />
          <span>{t('profile.follow')}</span>
        </>
      )}
    </button>
  );
}

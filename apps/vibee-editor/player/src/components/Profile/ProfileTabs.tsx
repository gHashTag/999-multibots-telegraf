import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { Grid, Users, Video, UserPlus } from 'lucide-react';
import {
  viewedProfileAtom,
  userAtom,
  followersAtom,
  followersLoadingAtom,
  followingAtom,
  followingLoadingAtom,
  loadFollowersAtom,
  loadFollowingAtom,
} from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { UserCard } from './UserCard';
import { ProfileTemplatesGrid } from './ProfileTemplatesGrid';

type TabId = 'templates' | 'followers' | 'following';
const TAB_ORDER: TabId[] = ['templates', 'followers', 'following'];

export function ProfileTabs() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabId>('templates');
  const contentRef = useRef<HTMLDivElement>(null);

  // Swipe navigation between tabs
  const goToNextTab = useCallback(() => {
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    if (currentIndex < TAB_ORDER.length - 1) {
      setActiveTab(TAB_ORDER[currentIndex + 1]);
    }
  }, [activeTab]);

  const goToPrevTab = useCallback(() => {
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(TAB_ORDER[currentIndex - 1]);
    }
  }, [activeTab]);

  useSwipeGesture({
    containerRef: contentRef,
    onSwipeLeft: goToNextTab,
    onSwipeRight: goToPrevTab,
    threshold: 50,
  });

  const profile = useAtomValue(viewedProfileAtom);
  const currentUser = useAtomValue(userAtom);

  const followers = useAtomValue(followersAtom);
  const followersLoading = useAtomValue(followersLoadingAtom);
  const loadFollowers = useSetAtom(loadFollowersAtom);

  const following = useAtomValue(followingAtom);
  const followingLoading = useAtomValue(followingLoadingAtom);
  const loadFollowing = useSetAtom(loadFollowingAtom);

  useEffect(() => {
    if (!profile) return;

    if (activeTab === 'followers') {
      loadFollowers(profile.username);
    } else if (activeTab === 'following') {
      loadFollowing(profile.username);
    }
  }, [activeTab, profile?.username]);

  if (!profile) return null;

  const tabs = [
    { id: 'templates' as const, icon: <Grid size={18} />, label: t('profile.templates'), count: profile.templates_count },
    { id: 'followers' as const, icon: <Users size={18} />, label: t('profile.followers'), count: profile.followers_count },
    { id: 'following' as const, icon: <Users size={18} />, label: t('profile.following'), count: profile.following_count },
  ];

  return (
    <div className="profile-tabs">
      <div className="profile-tabs__header">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`profile-tabs__tab ${activeTab === tab.id ? 'profile-tabs__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            <span className="profile-tabs__count">{tab.count ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="profile-tabs__content" ref={contentRef}>
        {activeTab === 'templates' && (
          <ProfileTemplatesGrid username={profile.username} />
        )}

        {activeTab === 'followers' && (
          <div className="profile-tabs__users">
            {followersLoading ? (
              <div className="profile-tabs__users">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="user-card">
                    <div className="skeleton skeleton-avatar" style={{ width: 48, height: 48 }} />
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
                <h3 className="empty-state__title">{t('profile.no_followers')}</h3>
                <p className="empty-state__desc">{t('profile.no_followers_desc')}</p>
              </div>
            ) : (
              followers.map((user) => (
                <UserCard key={user.id} user={user} />
              ))
            )}
          </div>
        )}

        {activeTab === 'following' && (
          <div className="profile-tabs__users">
            {followingLoading ? (
              <div className="profile-tabs__users">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="user-card">
                    <div className="skeleton skeleton-avatar" style={{ width: 48, height: 48 }} />
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
                <h3 className="empty-state__title">{t('profile.no_following')}</h3>
                <p className="empty-state__desc">{t('profile.no_following_desc')}</p>
              </div>
            ) : (
              following.map((user) => (
                <UserCard key={user.id} user={user} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

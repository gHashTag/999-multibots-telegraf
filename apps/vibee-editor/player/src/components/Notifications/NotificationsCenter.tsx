// ===============================
// Notifications Center
// ===============================

import { useState, useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { Bell, Heart, MessageCircle, UserPlus, Video, X, Check, CheckCheck } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { formatDistanceToNow } from '@/lib/dateUtils';
import './NotificationsCenter.css';

// Notification types
export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'video_ready' | 'system';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  avatar?: string;
  username?: string;
  videoThumbnail?: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

// Atoms
export const notificationsAtom = atomWithStorage<Notification[]>('vibee-notifications', []);
export const unreadCountAtom = atom((get) => {
  const notifications = get(notificationsAtom);
  return notifications.filter(n => !n.isRead).length;
});

// Mark notification as read
export const markReadAtom = atom(
  null,
  (get, set, notificationId: string) => {
    const notifications = get(notificationsAtom);
    set(notificationsAtom, notifications.map(n =>
      n.id === notificationId ? { ...n, isRead: true } : n
    ));
  }
);

// Mark all as read
export const markAllReadAtom = atom(
  null,
  (get, set) => {
    const notifications = get(notificationsAtom);
    set(notificationsAtom, notifications.map(n => ({ ...n, isRead: true })));
  }
);

// Clear all notifications
export const clearNotificationsAtom = atom(
  null,
  (_get, set) => {
    set(notificationsAtom, []);
  }
);

// Add notification
export const addNotificationAtom = atom(
  null,
  (get, set, notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) => {
    const notifications = get(notificationsAtom);
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    set(notificationsAtom, [newNotification, ...notifications]);
  }
);

interface NotificationsCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationsCenter({ isOpen, onClose }: NotificationsCenterProps) {
  const { t } = useLanguage();
  const [notifications, setNotifications] = useAtom(notificationsAtom);
  const unreadCount = useAtomValue(unreadCountAtom);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const handleMarkRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, isRead: true } : n
    ));
  }, [setNotifications]);

  const handleMarkAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  }, [setNotifications]);

  const handleClear = useCallback(() => {
    setNotifications([]);
  }, [setNotifications]);

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'like': return <Heart size={20} className="notification-icon notification-icon--like" />;
      case 'comment': return <MessageCircle size={20} className="notification-icon notification-icon--comment" />;
      case 'follow': return <UserPlus size={20} className="notification-icon notification-icon--follow" />;
      case 'video_ready': return <Video size={20} className="notification-icon notification-icon--video" />;
      default: return <Bell size={20} className="notification-icon" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="notifications-overlay" onClick={onClose}>
      <div className="notifications-center" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="notifications-header">
          <h2 className="notifications-title">
            {t('notifications.title')}
            {unreadCount > 0 && (
              <span className="notifications-badge">{unreadCount}</span>
            )}
          </h2>
          <div className="notifications-actions">
            {unreadCount > 0 && (
              <button
                className="notifications-action"
                onClick={handleMarkAllRead}
                title={t('notifications.mark_all_read')}
              >
                <CheckCheck size={18} />
              </button>
            )}
            <button className="notifications-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="notifications-tabs">
          <button
            className={`notifications-tab ${filter === 'all' ? 'notifications-tab--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('notifications.all')}
          </button>
          <button
            className={`notifications-tab ${filter === 'unread' ? 'notifications-tab--active' : ''}`}
            onClick={() => setFilter('unread')}
          >
            {t('notifications.unread')}
            {unreadCount > 0 && <span className="notifications-tab-badge">{unreadCount}</span>}
          </button>
        </div>

        {/* Notifications list */}
        <div className="notifications-list">
          {filteredNotifications.length === 0 ? (
            <div className="notifications-empty">
              <Bell size={48} strokeWidth={1} />
              <p>{t('notifications.empty')}</p>
            </div>
          ) : (
            filteredNotifications.map(notification => (
              <div
                key={notification.id}
                className={`notification-item ${!notification.isRead ? 'notification-item--unread' : ''}`}
                onClick={() => handleMarkRead(notification.id)}
              >
                <div className="notification-item__icon">
                  {notification.avatar ? (
                    <img src={notification.avatar} alt="" className="notification-item__avatar" />
                  ) : (
                    getNotificationIcon(notification.type)
                  )}
                </div>

                <div className="notification-item__content">
                  <p className="notification-item__text">
                    {notification.username && (
                      <span className="notification-item__username">@{notification.username}</span>
                    )}{' '}
                    {notification.message}
                  </p>
                  <span className="notification-item__time">
                    {formatDistanceToNow(notification.createdAt)}
                  </span>
                </div>

                {notification.videoThumbnail && (
                  <img
                    src={notification.videoThumbnail}
                    alt=""
                    className="notification-item__thumbnail"
                  />
                )}

                {!notification.isRead && (
                  <button
                    className="notification-item__mark-read"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkRead(notification.id);
                    }}
                    title={t('notifications.mark_read')}
                  >
                    <Check size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="notifications-footer">
            <button className="notifications-clear" onClick={handleClear}>
              {t('notifications.clear_all')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Bell button with badge
interface NotificationBellProps {
  onClick: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const unreadCount = useAtomValue(unreadCountAtom);

  return (
    <button className="notification-bell" onClick={onClick}>
      <Bell size={24} />
      {unreadCount > 0 && (
        <span className="notification-bell__badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

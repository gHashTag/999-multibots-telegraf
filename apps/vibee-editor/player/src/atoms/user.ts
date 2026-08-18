// ===============================
// User Atom - Telegram Auth State
// Freemium model: 3 free renders
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEYS } from '@vibee/atoms';
import { API_BASE } from '../config';

// Import shared types from @vibee/atoms
import type {
  TelegramUser,
  RenderQuota,
  SubscriptionInfo,
  InstagramStatus,
} from '@vibee/atoms';

// Re-export types for backward compatibility
export type { TelegramUser, RenderQuota, SubscriptionInfo, InstagramStatus };

// Persisted user state
export const userAtom = atomWithStorage<TelegramUser | null>(
  STORAGE_KEYS.user,
  null
);

// Render quota (not persisted - fetched from API)
export const renderQuotaAtom = atom<RenderQuota | null>(null);

// Loading state
export const quotaLoadingAtom = atom<boolean>(false);

// Paywall modal visibility
export const showPaywallAtom = atom<boolean>(false);

// Login modal visibility
export const showLoginModalAtom = atom<boolean>(false);

// Fetch render quota from API (also updates is_admin status)
export const fetchQuotaAtom = atom(
  null,
  async (get, set) => {
    const user = get(userAtom);

    if (!user) {
      set(renderQuotaAtom, null);
      return;
    }

    console.log('[fetchQuota] Fetching quota for user:', { id: user.id, is_admin: user.is_admin });

    set(quotaLoadingAtom, true);
    try {
      const response = await fetch(`${API_BASE}/api/render-quota?telegram_id=${user.id}`);

      if (response.ok) {
        const data = await response.json();
        console.log('[fetchQuota] API response:', data);
        set(renderQuotaAtom, data);

        // Only sync is_admin if it actually changed (prevents infinite loop!)
        if (data.is_admin !== undefined && data.is_admin !== user.is_admin) {
          console.log('[fetchQuota] Updating is_admin:', { from: user.is_admin, to: data.is_admin });
          set(userAtom, { ...user, is_admin: data.is_admin });
        } else {
          console.log('[fetchQuota] is_admin unchanged:', { current: user.is_admin, api: data.is_admin });
        }
      }
    } catch (error) {
      console.error('[fetchQuota] Failed to fetch render quota:', error);
    } finally {
      set(quotaLoadingAtom, false);
    }
  }
);

// Log a render to the API
export const logRenderAtom = atom(
  null,
  async (get, set) => {
    const user = get(userAtom);
    if (!user) return false;

    try {
      const response = await fetch(`${API_BASE}/api/render-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: user.id }),
      });

      if (response.ok) {
        // Refresh quota after logging
        const quota = get(renderQuotaAtom);
        if (quota) {
          set(renderQuotaAtom, {
            ...quota,
            total_renders: quota.total_renders + 1,
            free_remaining: Math.max(0, quota.free_remaining - 1),
          });
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to log render:', error);
      return false;
    }
  }
);

// Check if running in development mode
// Supports: localhost, Replit, Gitpod, CodeSandbox, StackBlitz, Vercel preview
const isDev = typeof window !== 'undefined' && (
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.endsWith('.replit.dev') ||
  window.location.hostname.endsWith('.repl.co') ||
  window.location.hostname.endsWith('.gitpod.io') ||
  window.location.hostname.endsWith('.csb.app') ||       // CodeSandbox
  window.location.hostname.endsWith('.stackblitz.io') ||
  window.location.hostname.endsWith('.webcontainer.io') ||
  window.location.hostname.includes('-preview') ||        // Vercel/Fly preview
  import.meta.env.DEV === true                            // Vite dev mode
);

// Check if user can render (has quota)
// DEV MODE: Unlimited renders for local development
// ADMIN MODE: Unlimited renders for admins in production
export const canRenderAtom = atom((get) => {
  const user = get(userAtom);
  const quota = get(renderQuotaAtom);

  console.log('[canRender] Checking render permission:', {
    isDev,
    user: user ? { id: user.id, is_admin: user.is_admin } : null,
    quota: quota,
  });

  // DEV MODE: Always allow renders on localhost
  if (isDev) {
    console.log('[canRender] ALLOWED: dev mode');
    return true;
  }

  // ADMIN MODE: Always allow renders for admins
  if (user?.is_admin) {
    console.log('[canRender] ALLOWED: admin mode');
    return true;
  }

  // Not logged in - can try for free
  if (!user) {
    console.log('[canRender] ALLOWED: not logged in (free try)');
    return true;
  }

  // No quota loaded yet - allow
  if (!quota) {
    console.log('[canRender] ALLOWED: no quota loaded yet');
    return true;
  }

  // Has free renders remaining
  if (quota.free_remaining > 0) {
    console.log('[canRender] ALLOWED: free renders remaining:', quota.free_remaining);
    return true;
  }

  // Has subscription with remaining renders
  if (quota.subscription) {
    if (quota.subscription.remaining === null) {
      console.log('[canRender] ALLOWED: unlimited subscription');
      return true; // Unlimited
    }
    if (quota.subscription.remaining > 0) {
      console.log('[canRender] ALLOWED: subscription remaining:', quota.subscription.remaining);
      return quota.subscription.remaining > 0;
    }
  }

  console.log('[canRender] DENIED: no quota, not admin, not dev');
  return false;
});

// Export isDev for use in other components
export const isDevModeAtom = atom(isDev);

// Check if user has unlimited renders (dev or admin)
export const hasUnlimitedRendersAtom = atom((get) => {
  if (isDev) return true;
  const user = get(userAtom);
  return user?.is_admin === true;
});

// Logout action
export const logoutAtom = atom(
  null,
  (_get, set) => {
    set(userAtom, null);
    set(renderQuotaAtom, null);
    set(showPaywallAtom, false);
    set(instagramStatusAtom, null);
  }
);

// ===============================
// Instagram Connection State
// ===============================

// Instagram connection status (not persisted - fetched from API)
export const instagramStatusAtom = atom<InstagramStatus | null>(null);
export const instagramLoadingAtom = atom<boolean>(false);

// Fetch Instagram connection status
export const fetchInstagramStatusAtom = atom(
  null,
  async (get, set) => {
    const user = get(userAtom);
    if (!user) {
      set(instagramStatusAtom, null);
      return;
    }

    set(instagramLoadingAtom, true);
    try {
      const response = await fetch(
        `${API_BASE}/api/instagram/status?telegram_id=${user.id}`
      );
      if (response.ok) {
        const data = await response.json();
        set(instagramStatusAtom, data);
      }
    } catch (error) {
      console.error('Failed to fetch Instagram status:', error);
    } finally {
      set(instagramLoadingAtom, false);
    }
  }
);

// Get Instagram OAuth URL and redirect
export const connectInstagramAtom = atom(
  null,
  async (get) => {
    const user = get(userAtom);
    if (!user) return null;

    try {
      const response = await fetch(
        `${API_BASE}/api/instagram/auth-url?telegram_id=${user.id}`
      );
      if (response.ok) {
        const data = await response.json();
        // Open Instagram OAuth in new window
        window.open(data.auth_url, '_blank', 'width=600,height=700');
        return data.auth_url;
      }
    } catch (error) {
      console.error('Failed to get Instagram auth URL:', error);
    }
    return null;
  }
);

// Disconnect Instagram account
export const disconnectInstagramAtom = atom(
  null,
  async (get, set) => {
    const user = get(userAtom);
    if (!user) return false;

    try {
      const response = await fetch(`${API_BASE}/api/instagram/disconnect`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_id: user.id }),
      });

      if (response.ok) {
        set(instagramStatusAtom, { connected: false });
        return true;
      }
    } catch (error) {
      console.error('Failed to disconnect Instagram:', error);
    }
    return false;
  }
);

// Post to user's Instagram account
export const postToInstagramAtom = atom(
  null,
  async (get, _set, { videoUrl, caption }: { videoUrl: string; caption?: string }) => {
    const user = get(userAtom);
    if (!user) return { success: false, error: 'Not logged in' };

    try {
      const response = await fetch(`${API_BASE}/api/instagram/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_id: user.id,
          video_url: videoUrl,
          caption: caption || '',
        }),
      });

      const data = await response.json();
      if (response.ok) {
        return { success: true, media_id: data.media_id };
      }
      return { success: false, error: data.error || 'Failed to post' };
    } catch (error) {
      console.error('Failed to post to Instagram:', error);
      return { success: false, error: 'Network error' };
    }
  }
);

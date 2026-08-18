import { useCallback } from 'react';

interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

/**
 * Hook for native Web Share API with fallback
 */
export function useShare() {
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const share = useCallback(async (data: ShareData): Promise<boolean> => {
    if (canShare) {
      try {
        await navigator.share(data);
        // Haptic feedback on success
        if ('vibrate' in navigator) {
          navigator.vibrate(50);
        }
        return true;
      } catch (err) {
        // User cancelled or share failed
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
        return false;
      }
    } else {
      // Fallback: copy URL to clipboard
      if (data.url) {
        try {
          await navigator.clipboard.writeText(data.url);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, [canShare]);

  const shareVideo = useCallback(async (
    videoUrl: string,
    title: string,
    creatorName?: string
  ): Promise<boolean> => {
    const text = creatorName
      ? `Check out "${title}" by ${creatorName} on VIBEE!`
      : `Check out "${title}" on VIBEE!`;

    return share({
      title,
      text,
      url: videoUrl,
    });
  }, [share]);

  const shareProfile = useCallback(async (
    username: string,
    displayName?: string
  ): Promise<boolean> => {
    const url = `${window.location.origin}/${username}`;
    const text = displayName
      ? `Check out ${displayName} (@${username}) on VIBEE!`
      : `Check out @${username} on VIBEE!`;

    return share({
      title: `${displayName || username} on VIBEE`,
      text,
      url,
    });
  }, [share]);

  return {
    canShare,
    share,
    shareVideo,
    shareProfile,
  };
}

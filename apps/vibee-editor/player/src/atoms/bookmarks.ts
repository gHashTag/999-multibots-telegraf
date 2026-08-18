// ===============================
// Bookmarks/Favorites Atoms
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEYS } from '@vibee/atoms';
import type { FeedTemplate } from './feed';

// Bookmarked template IDs (stored locally) - uses number since FeedTemplate.id is number
export const bookmarkedIdsAtom = atomWithStorage<number[]>(
  STORAGE_KEYS.bookmarks,
  []
);

// Full bookmarked templates (fetched from server)
export const bookmarkedTemplatesAtom = atom<FeedTemplate[]>([]);

// Loading state
export const bookmarksLoadingAtom = atom(false);

// Check if template is bookmarked
export const isBookmarkedAtom = atom((get) => {
  const bookmarkedIds = get(bookmarkedIdsAtom);
  return (templateId: number) => bookmarkedIds.includes(templateId);
});

// Toggle bookmark action
export const toggleBookmarkAtom = atom(
  null,
  (get, set, templateId: number) => {
    const bookmarkedIds = get(bookmarkedIdsAtom);
    const isBookmarked = bookmarkedIds.includes(templateId);

    if (isBookmarked) {
      // Remove from bookmarks
      set(bookmarkedIdsAtom, bookmarkedIds.filter(id => id !== templateId));
      set(bookmarkedTemplatesAtom, get(bookmarkedTemplatesAtom).filter(t => t.id !== templateId));
    } else {
      // Add to bookmarks
      set(bookmarkedIdsAtom, [...bookmarkedIds, templateId]);
    }

    // Haptic feedback
    if ('vibrate' in navigator) {
      navigator.vibrate(isBookmarked ? 10 : [10, 50, 10]);
    }

    return !isBookmarked;
  }
);

// Add template to bookmarks with full data
export const addBookmarkWithDataAtom = atom(
  null,
  (get, set, template: FeedTemplate) => {
    const bookmarkedIds = get(bookmarkedIdsAtom);

    if (!bookmarkedIds.includes(template.id)) {
      set(bookmarkedIdsAtom, [...bookmarkedIds, template.id]);
      set(bookmarkedTemplatesAtom, [...get(bookmarkedTemplatesAtom), template]);
    }
  }
);

// Clear all bookmarks
export const clearBookmarksAtom = atom(
  null,
  (_get, set) => {
    set(bookmarkedIdsAtom, []);
    set(bookmarkedTemplatesAtom, []);
  }
);

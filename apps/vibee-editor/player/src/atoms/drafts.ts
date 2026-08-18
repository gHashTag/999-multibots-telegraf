// ===============================
// Video Drafts System
// Auto-save and restore unfinished videos
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { Asset, Track } from '@vibee/atoms';
import { MAX_DRAFTS } from '@vibee/atoms';
import type { TemplateSettings } from './templates';
import { STORAGE_KEYS } from '@vibee/atoms';

// Draft structure
export interface VideoDraft {
  id: string;
  name: string;
  description?: string;
  thumbnailUrl?: string;
  lipSyncVideo?: string;
  templateSettings: TemplateSettings;
  assets: Asset[];
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
  autoSaved?: boolean;
}

// Drafts list (using STORAGE_KEYS - single source of truth)
export const draftsAtom = atomWithStorage<VideoDraft[]>(STORAGE_KEYS.drafts, []);

// Current draft being edited
export const currentDraftIdAtom = atom<string | null>(null);

// Draft loading state
export const draftLoadingAtom = atom(false);

// Get current draft
export const currentDraftAtom = atom((get) => {
  const drafts = get(draftsAtom);
  const currentId = get(currentDraftIdAtom);
  return currentId ? drafts.find(d => d.id === currentId) : null;
});

// Save draft action
export const saveDraftAtom = atom(
  null,
  (get, set, data: Omit<VideoDraft, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const drafts = get(draftsAtom);
    const now = new Date().toISOString();

    if (data.id) {
      // Update existing draft
      set(draftsAtom, drafts.map(d =>
        d.id === data.id
          ? { ...d, ...data, updatedAt: now }
          : d
      ));
      return data.id;
    } else {
      // Create new draft
      const newDraft: VideoDraft = {
        ...data,
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: now,
        updatedAt: now,
      };
      set(draftsAtom, [newDraft, ...drafts]);
      set(currentDraftIdAtom, newDraft.id);
      return newDraft.id;
    }
  }
);

// Delete draft action
export const deleteDraftAtom = atom(
  null,
  (get, set, draftId: string) => {
    const drafts = get(draftsAtom);
    set(draftsAtom, drafts.filter(d => d.id !== draftId));

    // Clear current if deleted
    if (get(currentDraftIdAtom) === draftId) {
      set(currentDraftIdAtom, null);
    }
  }
);

// Load draft into editor action
export const loadDraftAtom = atom(
  null,
  (get, set, draftId: string) => {
    const drafts = get(draftsAtom);
    const draft = drafts.find(d => d.id === draftId);

    if (draft) {
      set(currentDraftIdAtom, draftId);
      // The actual loading into editor atoms would be done by the component
      return draft;
    }
    return null;
  }
);

// Clear current draft
export const clearCurrentDraftAtom = atom(
  null,
  (_get, set) => {
    set(currentDraftIdAtom, null);
  }
);

// Auto-save interval (ms)
export const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

// MAX_DRAFTS imported from @vibee/atoms (single source of truth)

// Cleanup old drafts
export const cleanupDraftsAtom = atom(
  null,
  (get, set) => {
    const drafts = get(draftsAtom);

    if (drafts.length > MAX_DRAFTS) {
      // Keep only the most recent MAX_DRAFTS
      const sortedDrafts = [...drafts].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      set(draftsAtom, sortedDrafts.slice(0, MAX_DRAFTS));
    }
  }
);

// Get drafts count
export const draftsCountAtom = atom((get) => get(draftsAtom).length);

// Format draft date
export function formatDraftDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

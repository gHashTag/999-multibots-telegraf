// ===============================
// Voices Atom - ElevenLabs voice management
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEYS } from '@vibee/atoms';
import { API_BASE } from '../config';

export interface Voice {
  id: string;
  name: string;
  category: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

// Fallback voices in case API fails
const FALLBACK_VOICES: Voice[] = [
  { id: 'sarah', name: 'Sarah', category: 'premade' },
  { id: 'rachel', name: 'Rachel', category: 'premade' },
  { id: 'josh', name: 'Josh', category: 'premade' },
];

// Voices cached in localStorage (refreshed on fetch)
export const voicesAtom = atomWithStorage<Voice[]>(STORAGE_KEYS.voices, FALLBACK_VOICES);

// Loading state
export const voicesLoadingAtom = atom(false);

// Error state
export const voicesErrorAtom = atom<string | null>(null);

// Selected voice ID (persisted)
export const selectedVoiceAtom = atomWithStorage<string>(STORAGE_KEYS.selectedVoice, '');

// Fetch voices action atom
export const fetchVoicesAtom = atom(
  null,
  async (get, set) => {
    // Don't fetch if already loading
    if (get(voicesLoadingAtom)) return;

    set(voicesLoadingAtom, true);
    set(voicesErrorAtom, null);

    try {
      const response = await fetch(`${API_BASE}/api/voices`);
      const data = await response.json();

      if (data.success && data.voices && data.voices.length > 0) {
        set(voicesAtom, data.voices);

        // Set first voice as default if none selected
        const currentSelected = get(selectedVoiceAtom);
        if (!currentSelected) {
          set(selectedVoiceAtom, data.voices[0].id);
        }

        console.log(`[Voices] Loaded ${data.voices.length} voices from ElevenLabs`);
      } else {
        console.warn('[Voices] No voices returned, using fallback');
        set(voicesErrorAtom, data.error || 'No voices available');
      }
    } catch (err) {
      console.error('[Voices] Failed to load voices:', err);
      set(voicesErrorAtom, 'Failed to load voices');
    } finally {
      set(voicesLoadingAtom, false);
    }
  }
);

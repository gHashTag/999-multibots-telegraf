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

/**
 * Запасной список — ТОЛЬКО НАСТОЯЩИЕ идентификаторы голосов.
 *
 * Здесь стояли `sarah`, `rachel`, `josh` — имена, которых нет ни у одного
 * провайдера. И это был не редкий случай: `/api/voices` отвечал 500 ПОСТОЯННО
 * (ключ ElevenLabs в переменной хранит идентификатор, а не ключ), то есть
 * человек всегда выбирал из трёх выдуманных, платил и получал голос MiniMax
 * по умолчанию.
 *
 * Теперь сервер на отказе ElevenLabs отдаёт голоса той ноги, которая
 * действительно читает, — эти строки нужны только до первого ответа и при
 * обрыве сети. Они уходят провайдеру дословно, поэтому взяты из его же
 * списка (replicate.com/minimax/speech-02-turbo/readme, 06.09.2026).
 */
const FALLBACK_VOICES: Voice[] = [
  { id: 'Russian_ReliableMan', name: 'Максим — уверенный', category: 'ru' },
  { id: 'Russian_BrightHeroine', name: 'Алиса — звонкая', category: 'ru' },
  { id: 'English_Wiselady', name: 'Wise Lady', category: 'en' },
];

// Voices cached in localStorage (refreshed on fetch)
export const voicesAtom = atomWithStorage<Voice[]>(STORAGE_KEYS.voices, FALLBACK_VOICES);

// Loading state
export const voicesLoadingAtom = atom(false);

// Error state
export const voicesErrorAtom = atom<string | null>(null);

// Selected voice ID (persisted)
export const selectedVoiceAtom = atomWithStorage<string>(STORAGE_KEYS.selectedVoice, '');

/**
 * ЧЬИ это голоса. Сервер называет провайдера в ответе, а веб выбрасывал поле
 * и подписывал каждый голос «ElevenLabs voice» — включая голоса MiniMax,
 * которые он теперь и показывает.
 */
export const voiceProviderAtom = atom<string>('');

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
        if (data.provider) set(voiceProviderAtom, data.provider);

        /*
         * ВЫБОР СВЕРЯЕТСЯ СО СПИСКОМ, А НЕ ТОЛЬКО С ПУСТОТОЙ.
         *
         * Здесь стояло «поставить первый, если не выбрано ничего» — и этого
         * мало ровно тогда, когда список СМЕНИЛСЯ. У всех, кто заходил
         * раньше, в хранилище лежит `sarah` или идентификатор ElevenLabs;
         * список приезжает новый, выбор остаётся старый, и провайдер снова
         * получает строку, которой не знает. То есть починка выбора голоса
         * не подействовала бы ни на одного вернувшегося.
         *
         * Приложение так и делает с самого начала (GenerateScreen.swift):
         * нет выбранного в новом списке — берём первый.
         */
        const currentSelected = get(selectedVoiceAtom);
        const естьВСписке = data.voices.some(
          (v: Voice) => v.id === currentSelected
        );
        if (!currentSelected || !естьВСписке) {
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

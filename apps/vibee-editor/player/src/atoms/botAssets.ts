import { atom } from 'jotai';
import { userAtom } from './user';
import { RENDER_URL } from '../config';
import { getTelegramUser, getInitData } from '../lib/telegram';
import { getErrorMessage } from '../features/script/utils/errorMessages'
import { languageAtom } from './language'

// ===============================
// История генераций из бота.
//
// Бот пишет каждую генерацию в таблицу assets из 21 места, и до сих пор её не
// читал никто: все обращения к таблице во всём коде были .insert(). Человек
// генерировал в боте и не видел результат здесь — связи не существовало.
// Серверная половина — GET /api/assets/:telegram_id; это клиентская.
// ===============================

export interface BotAsset {
  id: number;
  /** Модель или провайдер: veo3_fast, fal_hummingbird, kling_lipsync, ... */
  type: string;
  url: string;
  prompt: string | null;
  botName: string | null;
  createdAt: string;
}

export const botAssetsAtom = atom<BotAsset[]>([]);
export const botAssetsLoadingAtom = atom(false);
export const botAssetsErrorAtom = atom<string | null>(null);

/**
 * telegram_id берётся из двух источников, потому что редактор живёт в двух
 * средах: внутри Telegram его даёт сам клиент, в вебе — только вход через
 * виджет. Без него запрашивать нечего.
 */
function resolveTelegramId(user: { id?: number } | null): string | null {
  const fromTelegram = getTelegramUser()?.id;
  if (fromTelegram) return String(fromTelegram);
  if (user?.id) return String(user.id);
  return null;
}

export const loadBotAssetsAtom = atom(null, async (get, set, kind?: string) => {
  const telegramId = resolveTelegramId(get(userAtom));
  if (!telegramId) {
    // Не ошибка: аноним в вебе просто не имеет истории. Показывать ему
    // «не удалось загрузить» было бы неправдой.
    set(botAssetsAtom, []);
    set(botAssetsErrorAtom, null);
    return;
  }

  set(botAssetsLoadingAtom, true);
  set(botAssetsErrorAtom, null);
  try {
    const url = new URL(`${RENDER_URL}/api/assets/${encodeURIComponent(telegramId)}`);
    url.searchParams.set('limit', '100');
    if (kind) url.searchParams.set('type', kind);

    // Эндпоинт закрыт намеренно — это личная история, а не общая лента.
    // Внутри Telegram подпись initData и есть доказательство личности.
    const initData = getInitData();
    const res = await fetch(url.toString(), {
      headers: initData ? { 'X-Telegram-Init-Data': initData } : {},
    });

    if (!res.ok) {
      // statusText пуст на HTTP/2, а Railway отдаёт всё по h2 — без кода и
      // тела сообщение получилось бы пустым ровно там, где нужна причина.
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} — ${body.slice(0, 160) || 'no body'}`);
    }

    const data = await res.json();
    set(botAssetsAtom, Array.isArray(data.assets) ? data.assets : []);
  } catch (e) {
    set(botAssetsErrorAtom, getErrorMessage(e, get(languageAtom)));
    set(botAssetsAtom, []);
  } finally {
    set(botAssetsLoadingAtom, false);
  }
});

/** Сгруппировано по дню — так историю читают глазами, а не сплошным списком. */
export const botAssetsByDayAtom = atom(get => {
  const groups = new Map<string, BotAsset[]>();
  for (const a of get(botAssetsAtom)) {
    const day = (a.createdAt || '').slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(a);
  }
  return [...groups.entries()].map(([day, assets]) => ({ day, assets }));
});

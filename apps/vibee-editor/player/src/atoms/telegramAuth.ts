// ===============================
// Авто-вход внутри Telegram Mini App
// ===============================

import { atom } from 'jotai'
import type { TelegramUser } from '@vibee/atoms'
import { userAtom } from './user'
import {
  getTelegramUser,
  hasVerifiableInitData,
  isTelegram,
} from '../lib/telegram'

/**
 * Внутри мини-аппа человек УЖЕ авторизован Telegram — отдельного входа не
 * существует и существовать не может.
 *
 * Раньше `userAtom` заполнялся ровно в одном месте: в колбэке веб-виджета
 * `window.onTelegramAuth`. Внутри Telegram этот виджет намеренно возвращает
 * null (iframe с oauth.telegram.org показывает «Bot domain invalid»), поэтому
 * колбэк не срабатывал никогда. Пользователь оставался «неавторизованным»,
 * любое действие открывало модалку «Login to Export», а единственная кнопка
 * в ней не рисовалась — тупик без выхода, из которого закрывала только
 * подложка.
 *
 * Здесь личность берётся из launch-данных Telegram. Подпись при этом НЕ
 * доверяется на клиенте: `initDataUnsafe` называется так не зря. Сервер всё
 * равно проверяет HMAC заголовка X-Telegram-Init-Data на каждом защищённом
 * запросе (render/auth.ts) — клиентское состояние отвечает только за то, что
 * показывать, а не за доступ.
 */
export const telegramAutoLoginAtom = atom(null, (get, set) => {
  if (!isTelegram()) return { applied: false, reason: 'не Telegram' as const }

  if (get(userAtom)) return { applied: false, reason: 'уже вошли' as const }

  const tgUser = getTelegramUser()
  if (!tgUser) {
    // Запуск с reply-кнопки не несёт ни подписи, ни пользователя. Это не
    // ошибка приложения, и врать «войдите» тут нечестно: войти неоткуда.
    return { applied: false, reason: 'запуск без данных пользователя' as const }
  }

  const user: TelegramUser = {
    id: tgUser.id,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name,
    username: tgUser.username,
    photo_url: tgUser.photo_url,
    auth_date: Math.floor(Date.now() / 1000),
    hash: '',
    is_admin: false,
  }

  set(userAtom, user)
  return { applied: true, reason: 'вход из launch-данных' as const }
})

/**
 * Можно ли вообще что-то подписать серверу.
 *
 * Запуск с reply-кнопки — это «внутри Telegram, но без подписи»: такие
 * запросы сервер отвергнет, и человеку нужно сказать не «войдите», а «откройте
 * приложение кнопкой меню», потому что кнопки входа для него не существует.
 */
export const canAuthorizeRequestsAtom = atom(() => hasVerifiableInitData())

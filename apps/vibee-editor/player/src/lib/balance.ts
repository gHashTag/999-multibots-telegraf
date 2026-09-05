import { API_BASE } from '../config'
import { authHeaders } from './apiFetch'

/**
 * ОСТАТОК И ЦЕНЫ ДЛЯ ВЕБА.
 *
 * Мини-приложение не спрашивало баланс НИ РАЗУ и цен не знало: человек жал
 * «Сгенерировать» и платил, ни разу не увидев суммы. В мобильном приложении
 * этот же дефект чинили всю ночь — здесь он оставался целиком.
 *
 * Цены берём с сервера, а не держим свою таблицу: вторая копия разошлась бы с
 * первой молча, и это уже случалось трижды в этом коде.
 */
export interface Баланс {
  balance: number
  prices: Record<string, number>
  modelPrices?: Record<string, number>
  perSecondModels?: string[]
  perThousandCharsModels?: string[]
  exempt?: boolean
}

export async function загрузитьБаланс(): Promise<Баланс | null> {
  try {
    const о = await fetch(`${API_BASE}/api/balance`, { headers: authHeaders() })
    if (!о.ok) return null
    const д = (await о.json()) as Баланс & { success?: boolean }
    return typeof д?.balance === 'number' ? д : null
  } catch {
    // Молчим НАМЕРЕННО: цена — не повод ломать экран генерации. Без баланса
    // кнопка просто не называет сумму, как было до этой правки.
    return null
  }
}

/**
 * Сколько спишут за одно нажатие.
 *
 * Цена МОДЕЛИ, а не вида работы: сервер списывает именно её, а вид — лишь
 * запасной вариант, когда у модели своей цены нет. Разошлись бы — человек
 * увидел бы одно, а заплатил другое.
 */
export function ценаНажатия(
  б: Баланс | null,
  операция: string,
  модель: string | undefined
): number | null {
  if (!б) return null
  if (модель && б.modelPrices?.[модель] != null) return б.modelPrices[модель]
  return б.prices?.[операция] ?? null
}

/** Чем меряется цена: «с», «1000 зн.» или ничем (за вызов). */
export function мераЦены(
  б: Баланс | null,
  модель: string | undefined
): string | null {
  if (!б || !модель) return null
  if (б.perThousandCharsModels?.includes(модель)) return '1000 зн.'
  if (б.perSecondModels?.includes(модель)) return 'с'
  return null
}

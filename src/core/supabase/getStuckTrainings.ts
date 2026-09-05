import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

/**
 * Обучения, которые начались и не закончились.
 *
 * ЗАЧЕМ. У @Ludmila (7007992081) две записи висят в `running` с 29 июля 2025 —
 * тринадцать месяцев. Она заплатила за обучение пять раз, 1210 звёзд, и не
 * получила ни одной модели: это единственный такой человек из 69 плативших
 * (docs/audit/training-money-truth.md).
 *
 * Что она видит в боте: «У вас нет обученных моделей» — потому что список
 * фильтруется по `status = SUCCESS`. Ни слова о том, что обучение шло и
 * застряло. Человек, заплативший 1210 звёзд, узнаёт, что моделей у него нет,
 * и не узнаёт, почему.
 *
 * The `checkStuckTrainings` watchdog (every 30 min) HAS since been registered
 * in `registerFunctions.ts`, where the reason it is safe is recorded too:
 * `handleModelTrainingCompleted` moves the row to a terminal status, so the
 * next run no longer selects it -- the cron is self-terminating, there is no
 * refund path, and it can neither loop nor pay twice. This function still
 * changes nothing: it only looks, so a human can be TOLD the truth.
 *
 * (The comment here previously claimed the watchdog was NOT registered, and
 * said so for as long as the owner queue's own summary table recorded it as
 * done -- corrected in it.193.)
 */
export interface StuckTraining {
  created_at: string
  model_name: string | null
  hoursStuck: number
}

/** Сколько часов ожидания считаем застреванием. Обучение идёт 1-2 часа. */
export const STUCK_AFTER_HOURS = 6

export async function getStuckTrainings(
  telegramId: string | number,
  nowMs: number = Date.now()
): Promise<StuckTraining[]> {
  try {
    const { data, error } = await supabase
      .from('model_trainings')
      .select('created_at,model_name,status')
      .eq('telegram_id', Number(telegramId))
      .in('status', ['running', 'starting', 'processing'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      logger.error('❌ [StuckTrainings] Не удалось получить обучения', {
        telegramId: String(telegramId),
        error: error.message,
      })
      return []
    }

    return (data ?? [])
      .map(r => ({
        created_at: String(r.created_at),
        model_name: (r.model_name as string | null) ?? null,
        hoursStuck: Math.floor(
          (nowMs - Date.parse(String(r.created_at))) / 3600000
        ),
      }))
      .filter(r => r.hoursStuck >= STUCK_AFTER_HOURS)
  } catch (e) {
    logger.error('❌ [StuckTrainings] Исключение', {
      telegramId: String(telegramId),
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

/** Текст для человека: что именно застряло и что делать. */
export function stuckTrainingsMessage(
  stuck: StuckTraining[],
  isRu: boolean
): string {
  const lines = stuck
    .slice(0, 3)
    .map(s => {
      const days = Math.floor(s.hoursStuck / 24)
      const when = days >= 1 ? `${days} дн` : `${s.hoursStuck} ч`
      const whenEn = days >= 1 ? `${days} d` : `${s.hoursStuck} h`
      return isRu
        ? `• ${s.model_name || 'без названия'} — начато ${when} назад`
        : `• ${s.model_name || 'unnamed'} — started ${whenEn} ago`
    })
    .join('\n')

  return isRu
    ? `⏳ Незавершённое обучение: ${stuck.length}\n${lines}\n\n` +
        'Обучение обычно занимает 1–2 часа. Если оно висит дольше — напишите в ' +
        'поддержку и приложите это сообщение: деньги за него списаны, и их вернут.'
    : `⏳ Unfinished trainings: ${stuck.length}\n${lines}\n\n` +
        'Training normally takes 1–2 hours. If it hangs longer, contact support ' +
        'and quote this message: it was paid for and will be refunded.'
}

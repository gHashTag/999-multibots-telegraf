import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export async function saveVideoUrlToSupabase(
  telegramId: string,
  videoUrl: string,
  videoPath: string,
  type: string
) {
  const { error } = await supabase.from('assets').insert({
    type: type,
    trigger_word: 'video',
    telegram_id: telegramId.toString(),
    storage_path: videoPath,
    public_url: videoUrl,
    text: 'Generated video',
  })

  if (error) {
    logger.error('Ошибка при сохранении URL видео в Supabase:', error)
  } else {
    logger.debug('URL видео успешно сохранен в Supabase')
  }
}

import { supabase } from './client'
import { logger } from '@/utils/logger'

export const saveVideoUrlToSupabase = async (
  telegram_id: string | number,
  video_url: string,
  local_path: string,
  model: string
) => {
  try {
    logger.info('💾 Сохранение информации о видео', {
      description: 'Saving video information',
      telegram_id,
      model,
    })

    const { data, error } = await supabase
      .from('assets')
      .insert([
        {
          telegram_id: telegram_id.toString(),
          type: 'video',
          url: video_url,
          local_path,
          model,
          created_at: new Date().toISOString(),
        },
      ])
      .select()

    if (error) {
      logger.error('❌ Ошибка при сохранении видео в БД', {
        description: 'Error saving video to database',
        error: error.message,
        telegram_id,
      })
      throw error
    }

    logger.info('✅ Информация о видео сохранена', {
      description: 'Video information saved',
      telegram_id,
      asset_id: data[0]?.id,
    })

    return data[0]
  } catch (error) {
    logger.error('❌ Ошибка при сохранении видео', {
      description: 'Error saving video',
      error: error instanceof Error ? error.message : 'Unknown error',
      telegram_id,
    })
    throw error
  }
}

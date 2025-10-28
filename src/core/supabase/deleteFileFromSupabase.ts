import { supabase } from '@/core/supabase'
import { logger } from '@/utils/enhancedLogger'

export async function deleteFileFromSupabase(
  bucketName: string,
  fileName: string
) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove([fileName])

    if (error) {
      logger.error('Ошибка при удалении файла из Supabase:', error.message)
    } else {
      logger.debug('Файл успешно удален из Supabase:', data)
    }
  } catch (error) {
    logger.error('Ошибка при удалении файла из Supabase:', error)
  }
}

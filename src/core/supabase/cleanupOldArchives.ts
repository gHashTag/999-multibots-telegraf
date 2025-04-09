import { supabase } from '.'
import { TelegramId } from '@/types/telegram.interface'

export async function cleanupOldArchives(userId: TelegramId) {
  try {
    // Получаем список всех файлов в папке пользователя
    const { data: files, error } = await supabase.storage
      .from('ai-training')
      .list(`training/${userId}`)

    if (error) {
      console.error('Error listing files:', error)
      return
    }

    // Оставляем только последний архив, удаляем остальные
    if (files && files.length > 1) {
      // Сортируем файлы по дате создания (самые новые первые)
      const sortedFiles = files.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      // Удаляем все кроме последнего
      for (const file of sortedFiles.slice(1)) {
        await supabase.storage
          .from('ai-training')
          .remove([`training/${userId}/${file.name}`])
      }
    }
  } catch (error) {
    console.error('Error cleaning up old archives:', error)
  }
}

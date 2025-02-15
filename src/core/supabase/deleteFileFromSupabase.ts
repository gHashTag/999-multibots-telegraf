import { supabase } from '.'

export async function deleteFileFromSupabase(
  bucketName: string,
  fileName: string
) {
  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .remove([fileName])

    if (error) {
      console.error('Ошибка при удалении файла из Supabase:', error.message)
    } else {
      console.log('Файл успешно удален из Supabase:', data)
    }
  } catch (error) {
    console.error('Ошибка при удалении файла из Supabase:', error)
  }
}

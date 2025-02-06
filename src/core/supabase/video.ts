import { supabase } from '.';
import fs from 'fs';

export async function uploadVideo(filePath: string, bucket: string, fileName: string) {
  try {
    const file = fs.readFileSync(filePath);
    const { data, error } = await supabase.storage.from(bucket).upload(fileName, file, {
      contentType: 'video/mp4',
      upsert: true,
    });

    if (error) {
      console.error('Ошибка при загрузке видео:', error.message);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Ошибка при загрузке видео:', error);
    throw error;
  }
}

export async function getVideoUrl(bucket: string, fileName: string) {
  try {
    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) {
    console.error('Ошибка при получении видео URL:', e);
    throw e;
  }
}

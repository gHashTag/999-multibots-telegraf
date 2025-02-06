import { supabase } from '.';

export const savePrompt = async (prompt: string, model_type: string, media_url?: string, telegram_id?: number): Promise<number | null> => {
  // Проверяем, существует ли уже такой промпт в таблице
  const { data: existingPrompt, error: selectError } = await supabase
    .from('prompts_history')
    .select('prompt_id')
    .eq('prompt', prompt)
    .eq('model_type', model_type)
    .eq('media_url', media_url)
    .eq('telegram_id', telegram_id)
    .maybeSingle();

  if (selectError) {
    console.error('Ошибка при проверке существующего промпта:', selectError);
    return null;
  }

  if (existingPrompt) {
    return existingPrompt.prompt_id;
  }

  // Если промпт не существует, добавляем его в таблицу
  const { data: newPrompt, error } = await supabase
    .from('prompts_history')
    .insert({
      prompt: prompt,
      model_type: model_type,
      media_url: media_url,
      telegram_id: telegram_id,
    })
    .select()
    .single();

  if (error) {
    console.error('Ошибка при сохранении промпта:', error);
    return null;
  }

  return newPrompt.prompt_id;
};

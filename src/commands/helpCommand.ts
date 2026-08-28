import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const handleHelpCommand = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)

  const helpText = isRu
    ? `🤖 <b>Справка по боту</b>

📸 <b>Нейрофото</b>
• Создание нейрофото с вашим лицом
• Используйте обученные модели

🎥 <b>Видео функции:</b>
• Image to Video — превращение фото в видео
• Text to Video — создание видео из текста
• Video Transcription — расшифровка видео

🎨 <b>AI Photoshop (ОБНОВЛЕНО!):</b>
• Отправьте <b>одно фото</b> — обычное редактирование
• Отправьте <b>несколько фото</b> (альбом) — серия обработки!
• Поддержка моделей: SeeDream-4, Nano Banana, FLUX Kontext, Seedance-1-Pro
• Несколько профессиональных моделей редактирования

🤖 <b>Основные функции:</b>
• Цифровое тело — создание AI модели вашего лица
• Чат с аватаром — общение с вашим AI
• Промпт из фото — анализ изображений

💡 <b>Совет:</b> Используйте альбомы в AI Photoshop для обработки серии фото!`
    : `🤖 <b>Bot Help</b>

📸 <b>NeuroPhoto</b>
• Create neurophotos with your face
• Use your trained models

🎥 <b>Video features:</b>
• Image to Video — turn photos into videos
• Text to Video — create videos from text
• Video Transcription — transcribe videos

🎨 <b>AI Photoshop (UPDATED!):</b>
• Send <b>one photo</b> — regular editing
• Send <b>multiple photos</b> (album) — batch processing!
• Supported models: SeeDream-4, Nano Banana, FLUX Kontext, Seedance-1-Pro
• Multiple professional editing models

🤖 <b>Main features:</b>
• Digital Body — create AI model of your face
• Chat with Avatar — talk to your AI
• Prompt from Photo — analyze images

💡 <b>Tip:</b> Use albums in AI Photoshop to process photo series!`

  await ctx.reply(helpText, { parse_mode: 'HTML' })
}

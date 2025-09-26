import { MyContext } from '@/interfaces'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

export const handleHelpCommand = async (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)

  const helpText = isRu
    ? `🤖 <b>Справка по боту</b>

📸 <b>Нейрофото (ОБНОВЛЕНО!)</b>
• Отправьте <b>одно фото</b> — создание обычного нейрофото
• Отправьте <b>несколько фото</b> (альбом) — создание серии нейрофото!
• Поддержка моделей: Flux-Kontext, Seedream4, Seedance-1-Pro

🎥 <b>Видео функции:</b>
• Image to Video — превращение фото в видео
• Text to Video — создание видео из текста
• Video Transcription — расшифровка видео

🎨 <b>AI Photoshop:</b>
• Редактирование изображений с помощью ИИ
• Несколько профессиональных моделей

🤖 <b>Основные функции:</b>
• Цифровое тело — создание AI модели вашего лица
• Чат с аватаром — общение с вашим AI
• Промпт из фото — анализ изображений

💡 <b>Совет:</b> Используйте альбомы для создания серий нейрофото — это новая функция!`
    : `🤖 <b>Bot Help</b>

📸 <b>NeuroPhoto (UPDATED!)</b>
• Send <b>one photo</b> — create regular neurophoto
• Send <b>multiple photos</b> (album) — create neurophoto series!
• Supported models: Flux-Kontext, Seedream4, Seedance-1-Pro

🎥 <b>Video features:</b>
• Image to Video — turn photos into videos
• Text to Video — create videos from text
• Video Transcription — transcribe videos

🎨 <b>AI Photoshop:</b>
• Edit images with AI
• Multiple professional models

🤖 <b>Main features:</b>
• Digital Body — create AI model of your face
• Chat with Avatar — talk to your AI
• Prompt from Photo — analyze images

💡 <b>Tip:</b> Use albums to create neurophoto series — this is a new feature!`

  await ctx.reply(helpText, { parse_mode: 'HTML' })
}
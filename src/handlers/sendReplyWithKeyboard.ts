export const sendReplyWithKeyboard = async ({
  ctx,
  message,
  inlineKeyboard,
  menu,
  photo_url,
  post_url,
}: SendReplyOptions) => {
  try {
    // Преобразуем inlineKeyboard в массив, если он не является массивом
    const keyboardArray = Array.isArray(inlineKeyboard)
      ? inlineKeyboard
      : inlineKeyboard
      ? [inlineKeyboard]
      : []

    // Создаем финальную клавиатуру
    const finalKeyboard = [...keyboardArray]

    // Если есть URL поста, добавляем кнопку
    if (post_url) {
      const isRu = isRussian(ctx)
      finalKeyboard.push([
        {
          text: isRu ? '🎬 Посмотреть видео-инструкцию' : '🎬 Watch tutorial',
          url: post_url,
        },
      ])
    }

    console.log('🛠️ Final keyboard structure:', finalKeyboard)

    if (photo_url) {
      await ctx.replyWithPhoto(photo_url, {
        caption: message,
        reply_markup: { inline_keyboard: finalKeyboard },
        parse_mode: 'HTML',
        ...menu,
      })
    } else {
      await ctx.reply(message, {
        reply_markup: { inline_keyboard: finalKeyboard },
        parse_mode: 'HTML',
        ...menu,
      })
    }

    console.log('✅ Сообщение успешно отправлено', {
      hasPhoto: !!photo_url,
      hasPostButton: !!post_url,
    })

    return ctx.wizard.next()
  } catch (error) {
    console.error('🔴 Ошибка при отправке сообщения:', error)
    await ctx.reply(
      isRussian(ctx)
        ? '❌ Произошла ошибка. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred. Please try again later.'
    )
    throw error
  }
}

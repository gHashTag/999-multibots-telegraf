import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'

import { isValidImage } from '../../helpers/images'
import { isRussian } from '@/helpers/language'
import { handleHelpCancel } from '@/handlers/handleHelpCancel'
import { getBotToken } from '@/handlers'
import { updateUserGender } from '@/core/supabase'

// Define gender options
const GENDER_MALE = 'male'
const GENDER_FEMALE = 'female'

export const trainFluxModelWizard = new Scenes.WizardScene<MyContext>(
  'trainFluxModelWizard',

  // Step 1: Ask for Gender
  async ctx => {
    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? '👤 Укажите пол вашего аватара:'
        : '👤 Specify the gender of your avatar:',
      Markup.inlineKeyboard([
        Markup.button.callback(
          isRu ? 'Мужской ♂️' : 'Male ♂️',
          `set_gender:${GENDER_MALE}`
        ),
        Markup.button.callback(
          isRu ? 'Женский ♀️' : 'Female ♀️',
          `set_gender:${GENDER_FEMALE}`
        ),
      ])
    )
    return ctx.wizard.next()
  },

  // Step 2: Handle Gender Selection & Ask for Images
  async ctx => {
    const isRu = isRussian(ctx)
    let gender: string | null = null
    let targetUserId: number | undefined = ctx.session.targetUserId
    let username: string | undefined = ctx.session.username

    if (!targetUserId) {
      if (ctx.from?.id) {
        targetUserId = ctx.from.id
        ctx.session.targetUserId = targetUserId
        console.log(
          `[trainFluxModelWizard] Fetched targetUserId from ctx.from: ${targetUserId}`
        )
      } else {
        console.error(
          '[trainFluxModelWizard] Missing targetUserId in session and ctx.from at step 2.'
        )
        await ctx.reply(
          isRu
            ? '❌ Ошибка сессии. Не могу определить пользователя.'
            : '❌ Session error. Cannot identify user.'
        )
        return ctx.scene.leave()
      }
    }

    if (!username) {
      if (ctx.from?.username) {
        username = ctx.from.username
        ctx.session.username = username
        console.log(
          `[trainFluxModelWizard] Fetched username from ctx.from: ${username}`
        )
      } else {
        username = `user${targetUserId}`
        ctx.session.username = username
        console.warn(
          `[trainFluxModelWizard] Username missing in ctx.from, using fallback: ${username}`
        )
      }
    }

    if (ctx.callbackQuery && 'data' in ctx.callbackQuery) {
      const data = ctx.callbackQuery.data
      if (data.startsWith('set_gender:')) {
        gender = data.split(':')[1]
        await ctx.answerCbQuery()
      } else {
        await ctx.answerCbQuery(
          isRu ? 'Неизвестное действие' : 'Unknown action'
        )
        console.warn('[trainFluxModelWizard] Unexpected callback data:', data)
        await ctx.reply(
          isRu
            ? '⚠️ Пожалуйста, используйте кнопки для выбора пола.'
            : '⚠️ Please use the buttons to select the gender.'
        )
        return
      }
    } else {
      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, используйте кнопки выше для выбора пола.'
          : '⚠️ Please use the buttons above to select the gender.'
      )
      return
    }

    if (!gender || (gender !== GENDER_MALE && gender !== GENDER_FEMALE)) {
      await ctx.reply(
        isRu ? '❌ Ошибка выбора пола.' : '❌ Error selecting gender.'
      )
      return ctx.scene.leave()
    }

    ctx.session.gender = gender
    console.log(`[trainFluxModelWizard] Gender set to session: ${gender}`)

    const genderUpdateSuccess = await updateUserGender(targetUserId, gender)
    if (!genderUpdateSuccess) {
      console.error(
        `[trainFluxModelWizard] Failed to update gender in DB for user ${targetUserId}`
      )
      await ctx.reply(
        isRu
          ? '⚠️ Не удалось сохранить выбор пола, но вы можете продолжить.'
          : '⚠️ Could not save gender selection, but you can proceed.'
      )
    } else {
      console.log(
        `[trainFluxModelWizard] Gender successfully saved to DB for user ${targetUserId}`
      )
    }

    if (!username) {
      console.error(
        '[trainFluxModelWizard] CRITICAL: Username is still missing after checks at step 2.'
      )
      await ctx.reply(
        isRu
          ? '❌ Ошибка сессии. Не найдено имя пользователя.'
          : '❌ Session error. Username not found.'
      )
      return ctx.scene.leave()
    }

    ctx.session.images = []
    ctx.session.modelName = `${username.toLowerCase()}`
    ctx.session.triggerWord = `${username.toLowerCase()}`

    const replyMessage = isRu
      ? `✅ Пол ${gender === GENDER_MALE ? 'Мужской' : 'Женский'} сохранен.\n\n📸 Теперь, пожалуйста, отправьте изображения для обучения модели (минимум 10). Отправьте /done когда закончите.\n\nВам потребуется минимум 10 фотографий, которые соответствуют следующим критериям:\n\n   - 📷 <b>Четкость и качество изображения:</b> Фотографии должны быть четкими и высококачественными.\n\n   - 🔄 <b>Разнообразие ракурсов:</b> Используйте фотографии, сделанные с разных ракурсов.\n\n   - 😊 <b>Разнообразие выражений лиц:</b> Включите фотографии с различными выражениями лиц.\n
   - 💡 <b>Разнообразие освещения:</b> Используйте фотографии, сделанные при разных условиях освещения.\n
   - 🏞️ <b>Фон и окружение:</b> Фон на фотографиях должен быть нейтральным.\n
   - 👗 <b>Разнообразие стилей одежды:</b> Включите фотографии в разных нарядах.\n
   - 🎯 <b>Лицо в центре кадра:</b> Убедитесь, что ваше лицо занимает центральное место на фотографии.\n
   - 🚫 <b>Минимум постобработки:</b> Избегайте фотографий с сильной постобработкой.\n
   - ⏳ <b>Разнообразие возрастных периодов:</b> Включите фотографии, сделанные в разные возрастные периоды.\n\n`
      : `✅ Gender ${gender === GENDER_MALE ? 'Male' : 'Female'} saved.\n\n📸 Now, please send images for model training (minimum 10 images). Send /done when finished.\n\nYou will need at least 10 photos that meet the following criteria:\n\n   - 📷 <b>Clear and high-quality image:</b> Photos should be clear and of high quality.\n
   - 🔄 <b>Variety of angles:</b> Use photos taken from different angles.\n
   - 😊 <b>Variety of facial expressions:</b> Include photos with different facial expressions.\n
   - 💡 <b>Variety of lighting conditions:</b> Use photos taken under different lighting conditions.\n
   - 🏞️ <b>Background and environment:</b> The background in the photos should be neutral.\n
   - 👗 <b>Variety of clothing styles:</b> Include photos in different outfits.\n`

    const fullReplyMessage = isRu
      ? `✅ Пол ${gender === GENDER_MALE ? 'Мужской' : 'Женский'} сохранен.\n\n📸 Теперь, пожалуйста, отправьте изображения для обучения модели (минимум 10). Отправьте /done когда закончите.\n\nВам потребуется минимум 10 фотографий, которые соответствуют следующим критериям:\n\n   - 📷 <b>Четкость и качество изображения:</b> Фотографии должны быть четкими и высококачественными.\n\n   - 🔄 <b>Разнообразие ракурсов:</b> Используйте фотографии, сделанные с разных ракурсов.\n\n   - 😊 <b>Разнообразие выражений лиц:</b> Включите фотографии с различными выражениями лиц.\n
   - 💡 <b>Разнообразие освещения:</b> Используйте фотографии, сделанные при разных условиях освещения.\n
   - 🏞️ <b>Фон и окружение:</b> Фон на фотографиях должен быть нейтральным.\n
   - 👗 <b>Разнообразие стилей одежды:</b> Включите фотографии в разных нарядах.\n
   - 🎯 <b>Лицо в центре кадра:</b> Убедитесь, что ваше лицо занимает центральное место на фотографии.\n
   - 🚫 <b>Минимум постобработки:</b> Избегайте фотографий с сильной постобработкой.\n
   - ⏳ <b>Разнообразие возрастных периодов:</b> Включите фотографии, сделанные в разные возрастные периоды.\n\n`
      : `✅ Gender ${gender === GENDER_MALE ? 'Male' : 'Female'} saved.\n\n📸 Now, please send images for model training (minimum 10 images). Send /done when finished.\n\nYou will need at least 10 photos that meet the following criteria:\n\n   - 📷 <b>Clear and high-quality image:</b> Photos should be clear and of high quality.\n
   - 🔄 <b>Variety of angles:</b> Use photos taken from different angles.\n
   - 😊 <b>Variety of facial expressions:</b> Include photos with different facial expressions.\n
   - 💡 <b>Variety of lighting conditions:</b> Use photos taken under different lighting conditions.\n
   - 🏞️ <b>Background and environment:</b> The background in the photos should be neutral.\n
   - 👗 <b>Variety of clothing styles:</b> Include photos in different outfits.\n`

    await ctx.reply(fullReplyMessage, {
      ...Markup.keyboard([
        [Markup.button.text(isRu ? 'Отмена' : 'Cancel')],
      ]).resize(),
      parse_mode: 'HTML',
    })

    console.log('Proceeding to image upload step (Step 3)')
    return ctx.wizard.next()
  },

  // Step 3: Handle Image Collection (Original Step 2)
  async ctx => {
    console.log('Scene: IMAGES')
    const isRu = isRussian(ctx)
    const message = ctx.message
    console.log('message', message)
    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    if (message && 'text' in message && message.text === '/done') {
      console.log('Received /done command')
      if (!ctx.session.images || ctx.session.images.length < 10) {
        // Check if images array exists
        await ctx.reply(
          isRu
            ? `📸 Необходимо минимум 10 изображений. Сейчас: ${ctx.session.images?.length || 0}`
            : `📸 Minimum 10 images required. Current: ${ctx.session.images?.length || 0}`
        )
        return
      }
      console.log('Proceeding to upload scene')
      // Pass necessary data including gender to the next scene if needed
      // ctx.scene.enter('uploadTrainFluxModelScene', { gender: ctx.session.gender }); // Example if state is passed
      return ctx.scene.enter('uploadTrainFluxModelScene')
    }

    if (message && 'photo' in message) {
      // Initialize images array if it doesn't exist
      if (!ctx.session.images) {
        ctx.session.images = []
      }
      // ... (rest of the image handling logic: getFile, fetch, validate, check size, push to session) ...
      const photo = message.photo[message.photo.length - 1]
      const file = await ctx.telegram.getFile(photo.file_id)

      if (!file.file_path) {
        await ctx.reply(
          isRu ? '❌ Ошибка получения файла' : '❌ Error getting file'
        )
        return
      }
      const botToken = getBotToken(ctx)
      const response = await fetch(
        `https://api.telegram.org/file/bot${botToken}/${file.file_path}`
      )
      const buffer = Buffer.from(await response.arrayBuffer())
      const isValid = await isValidImage(buffer)

      if (!isValid) {
        await ctx.reply(
          isRu
            ? '❌ Файл не является корректным изображением.'
            : '❌ File is not a valid image.'
        )
        return
      }
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
      if (buffer.length > MAX_IMAGE_SIZE) {
        await ctx.reply(
          isRu
            ? '❌ Изображение слишком большое (max 10MB).'
            : '❌ Image too large (max 10MB).'
        )
        return
      }

      ctx.session.images.push({
        buffer: Buffer.from(buffer),
        filename: `a_photo_of_${ctx.session.username}x${ctx.session.images.length + 1}.jpg`,
      })

      await ctx.reply(
        isRu
          ? `✅ Изображение ${ctx.session.images.length} добавлено. Отправьте еще или /done.`
          : `✅ Image ${ctx.session.images.length} added. Send more or /done.`
      )
      console.log(`Image ${ctx.session.images.length} added`)
    } else {
      // Handle cases where it's neither /done nor a photo
      await ctx.reply(
        isRu
          ? 'Пожалуйста, отправьте фото или /done.'
          : 'Please send a photo or /done.'
      )
    }
    // Stay on the same step to collect more images
    return
  }
)

export default trainFluxModelWizard

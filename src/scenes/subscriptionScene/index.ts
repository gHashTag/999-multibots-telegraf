import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '@/helpers'
import { SubscriptionType } from '@/interfaces/subscription.interface'
// import { levels } from '@/menu/mainMenu' // levels больше не нужны здесь

// Обновленный текст только для двух тарифов
const message = (isRu: boolean) =>
  isRu
    ? `<b>💫 Для получения полного доступа ко всем нейрокомандам, выберите одну из предложенных месячных подписок:</b>

<b>📸 НейроФото - Цена: 1110 ₽</b>
- Самостоятельное обучение по нейросетям с ИИ аватаром
- Учитесь в удобное время
- Включает видеоуроки, текстовые материалы
- Поддержка и актуальные технологии
- Доступ к чату с ментором
- 476 звезды на баланс бота

<b>📚 НейроБаза - Цена: 2999 ₽</b>
- 📖 Уроки по нейросетям 
- 📸 Нейрофото 
- 🎥 Генерация видео 
- 🗣️ Озвучка Аватара 
- 🔧 Поддержка куратора 
- 💬 Доступ к чату с ментором
- 1303 звезд на баланс бота
`
    : `<b>💫 To get full access to all neurocommands, choose one of the proposed monthly subscriptions:</b>

<b>📸 NeuroPhoto - Price: 1110 RUB</b>
- Self-study on neural networks with AI avatar
- Learn at your convenience
- Includes video lessons, text materials
- Support and up-to-date technologies
- Access to chat with a mentor
- 476 stars to bot balance

<b>📚 NeuroBase - Price: 2999 RUB</b>
- 📖 Lessons on neural networks
- 📸 NeuroPhoto feature
- 🎥 Video generation
- 🗣️ Avatar voice-over
- 🔧 Curator support
- 💬 Access to chat with a mentor
- 1303 stars to bot balance
` // Prices in RUB for EN version too, assuming primary market

export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  'subscriptionScene',
  async ctx => {
    console.log('CASE: subscriptionScene enter')
    const isRu = isRussian(ctx)

    // Обновленная клавиатура только для двух тарифов
    const inlineKeyboard = Markup.inlineKeyboard([
      [
        {
          text: isRu ? '📸 НейроФото' : '📸 NeuroPhoto',
          callback_data: 'neurophoto',
        },
        {
          text: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
          callback_data: 'neurobase',
        },
      ],
      [
        // Добавляем кнопку возврата в меню
        {
          text: isRu ? '🏠 Главное меню' : '🏠 Main menu',
          callback_data: 'mainmenu',
        },
      ],
    ])

    try {
      await ctx.reply(message(isRu), {
        reply_markup: inlineKeyboard.reply_markup,
        parse_mode: 'HTML',
      })
    } catch (error) {
      console.error('Error sending subscription options:', error)
      await ctx.reply(
        isRu ? 'Ошибка отображения тарифов.' : 'Error displaying tariffs.'
      )
      return ctx.scene.leave() // Выходим из сцены при ошибке
    }

    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE: subscriptionScene received callback')
    if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
      const text = ctx.update.callback_query.data
      console.log('Callback data:', text)

      // Удаляем обработку ненужных тарифов
      if (text === 'neurobase') {
        console.log('Selected: 📚 НейроБаза')
        ctx.session.subscription = SubscriptionType.NEUROBASE
        console.log('Переход в getEmailWizard для NeuroBase')
        return ctx.scene.enter('getEmailWizard')
      } else if (text === 'neurophoto') {
        console.log('Selected: 📸 НейроФото')
        ctx.session.subscription = SubscriptionType.NEUROPHOTO
        console.log('Переход в getEmailWizard для NeuroPhoto')
        return ctx.scene.enter('getEmailWizard')
      } else if (text === 'mainmenu') {
        console.log('Selected: 🏠 Главное меню')
        // await handleMenu(ctx) // Вызов handleMenu здесь может быть избыточен, если menuScene делает то же самое
        return ctx.scene.enter('menuScene')
      } else {
        console.warn('Unknown callback data in subscriptionScene:', text)
        await ctx.answerCbQuery() // Отвечаем на колбек, чтобы убрать часики
        await ctx.reply(
          isRussian(ctx)
            ? 'Неизвестный выбор. Пожалуйста, используйте кнопки.'
            : 'Unknown choice. Please use the buttons.'
        )
        // Остаемся в сцене, чтобы пользователь мог выбрать снова
        // return ctx.scene.reenter()
      }
      return ctx.scene.leave() // Выходим из сцены
    } else {
      // Если пришло не callback_query, а что-то другое (например, текст)
      console.log('Received non-callback query in subscriptionScene step 2')
      await ctx.reply(
        isRussian(ctx)
          ? 'Пожалуйста, выберите тариф с помощью кнопок.'
          : 'Please select a tariff using the buttons.'
      )
      // Можно либо выйти в меню, либо переотправить сообщение с кнопками
      // await handleMenu(ctx)
      return ctx.scene.leave() // Оставляем этот выход из сцены
    }
  }
)

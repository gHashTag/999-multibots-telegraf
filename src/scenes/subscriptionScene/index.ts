import { Markup, Scenes } from 'telegraf'
import { MyContext } from '../../interfaces'
import { isRussian } from '@/helpers'
import { levels } from '@/menu/mainMenu'
import { handleMenu } from '@/handlers'

const message = (isRu: boolean) =>
  isRu
    ? `<b>💫 Для получения полного доступа ко всем нейрокомандам, выберите одну из предложенных месячных подписок:</b>

<b>📸 НейроФото - Цена: 3000 ⭐️ - 4800₽</b>
- 📖 Самостоятельное обучение по нейросетям с ИИ аватаром
- ⏰ Учитесь в удобное время
- 🎥 Включает видеоуроки, текстовые материалы
- 🔧 Поддержка и актуальные технологии
- 💬 Доступ к чату с ментором
- ⭐️ 3000 на баланс бота

<b>📚 НейроБаза - Цена: 7000 ⭐️ - 9999₽</b>
- 📖 Самостоятельное обучение по нейросетям с ИИ аватаром
- ⏰ Учитесь в удобное время
- 🎥 Включает видеоуроки, текстовые материалы
- 🔧 Поддержка и актуальные технологии
- 💬 Доступ к чату с ментором
- ⭐️ 1000 на баланс бота

<b>🧠 НейроВстреча - Цена: 28000 ⭐️ - 44999₽</b>
- Индивидуальная встреча с экспертом
- Обсуждение ваших проектов и идей
- Персональные рекомендации и стратегии
- Доступ к эксклюзивным материалам
- Интеграция ИИ с вашими проектами
- ⭐️ 5000 на баланс бота

<b>🤖 НейроБлогер - Цена: 75000 ⭐️ - 75000₽</b>
- Все из тарифа НейроБаза
- Обучение по нейросетям с ментором
- Курс на 1 месяц с 4 онлайн уроками по 2 часа
- Практические занятия, домашние задания и поддержка куратора
- ⭐️ 7500 на баланс бота
`
    : `<b>💫 To get full access to all neurocommands, choose one of the proposed monthly subscriptions:</b>

<b>📸 NeuroPhoto - Price: 3000 ⭐️ - 48$</b>
- Self-study on neural networks with AI avatar
- Learn at your convenience
- Includes video lessons, text materials
- Support and up-to-date technologies
- Access to chat with a mentor
- ⭐️ 1000 on bot balance

<b>📚 NeuroBase - Price: 7000 ⭐️ - 112$</b>
- Self-study on neural networks with AI avatar
- Learn at your convenience
- Includes video lessons, text materials
- Support and up-to-date technologies
- Access to chat with a mentor
- ⭐️ 1000 on bot balance

<b>🧠 NeuroMeeting - Price: 28000 ⭐️ - 448$</b>
- Individual meeting with an expert
- Discussion of your projects and ideas
- Personal recommendations and strategies
- Access to exclusive materials
- AI integration with your projects
- ⭐️ 5000 on bot balance

<b>🤖 NeuroBlogger - Price: 75000 ⭐️ - 1200$</b>
- Everything from the NeuroBase plan
- Training on neural networks with a mentor
- 1-month course with 4 online lessons of 2 hours each
- Practical classes, homework, and curator support
- ⭐️ 7500 on bot balance
`
export const subscriptionScene = new Scenes.WizardScene<MyContext>(
  'subscriptionScene',
  async ctx => {
    console.log('CASE: subscriptionScene')
    const isRu = isRussian(ctx)

    const inlineKeyboard = Markup.inlineKeyboard([
      [
        {
          text: isRu ? levels[2].title_ru : levels[2].title_en,
          callback_data: 'neurophoto',
        },
        {
          text: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
          callback_data: 'neurobase',
        },
      ],
      [
        {
          text: isRu ? '🧠 НейроВстреча' : '🧠 NeuroMeeting',
          callback_data: 'neuromeeting',
        },
        {
          text: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
          callback_data: 'neuroblogger',
        },
        {
          text: isRu ? levels[104].title_ru : levels[104].title_en,
          callback_data: 'mainmenu',
        },
        // {
        //   text: isRu ? '🧠 НейроМентор' : '🧠 NeuroMentor',
        //   callback_data: 'neuromentor',
        // },
      ],
    ])

    await ctx.reply(message(isRu), {
      reply_markup: inlineKeyboard.reply_markup,
      parse_mode: 'HTML',
    })

    return ctx.wizard.next()
  },
  async ctx => {
    console.log('CASE: subscriptionScene.next', ctx)
    if ('callback_query' in ctx.update && 'data' in ctx.update.callback_query) {
      const text = ctx.update.callback_query.data
      console.log('text', text)
      if (text === 'neurobase') {
        console.log('CASE: 📚 НейроБаза')
        ctx.session.subscription = 'neurobase'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuromeeting') {
        console.log('CASE: 🧠 НейроВстреча')
        ctx.session.subscription = 'neuromeeting'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuroblogger') {
        console.log('CASE: 🤖 НейроБлогер')
        ctx.session.subscription = 'neuroblogger'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neurophoto') {
        console.log('CASE: 🎨 НейроФото')
        ctx.session.subscription = 'neurophoto'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'neuromentor') {
        console.log('CASE: 🧠 НейроМентор')
        ctx.session.subscription = 'neuromentor'
        return ctx.scene.enter('paymentScene')
      } else if (text === 'mainmenu') {
        console.log('CASE: 🏠 Главное меню')
        return ctx.scene.enter('menuScene')
      } else {
        console.warn('Unknown subscription type:', text)
        await ctx.reply(
          'Неизвестный тип подписки. Пожалуйста, выберите другой вариант.'
        )
      }
    } else {
      handleMenu(ctx)
      return ctx.scene.leave()
    }
  }
)

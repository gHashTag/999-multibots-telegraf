import { Telegraf, Scenes, session, Markup } from 'telegraf'
import { MyContext } from '../interfaces'
import { logger } from '../utils/logger'

// Импорт сцен для продающей воронки
import {
  vibeCodingStartScene,
  vibeCodingDemoScene,
  vibeCodingTestimonialsScene,
  vibeCodingOfferScene,
  vibeCodingPaymentScene,
  vibeCodingDeliveryScene,
} from '../scenes/vibeCoding'

// Создаем stage для управления сценами
const stage = new Scenes.Stage<MyContext>([
  vibeCodingStartScene,
  vibeCodingDemoScene,
  vibeCodingTestimonialsScene,
  vibeCodingOfferScene,
  vibeCodingPaymentScene,
  vibeCodingDeliveryScene,
])

export class VibeCodingBot {
  private bot: Telegraf<MyContext>

  constructor(token: string) {
    this.bot = new Telegraf<MyContext>(token)
    this.setupMiddleware()
    this.setupCommands()
    this.setupActions()
  }

  private setupMiddleware() {
    this.bot.use(session())
    this.bot.use(stage.middleware())
  }

  private setupCommands() {
    // Команда старта - главная точка входа
    this.bot.start(async ctx => {
      logger.info('🚀 VibeCoding Bot: Новый пользователь', {
        userId: ctx.from?.id,
        username: ctx.from?.username,
        firstName: ctx.from?.first_name,
      })

      await ctx.scene.enter('vibeCodingStart')
    })

    // Команда меню - возврат к главному меню
    this.bot.command('menu', async ctx => {
      await ctx.scene.enter('vibeCodingStart')
    })

    // Команда поддержки
    this.bot.command('support', async ctx => {
      const supportMessage = `
🆘 **Поддержка Вайб-Кодинг**

Если у вас есть вопросы о курсе или нужна помощь:

📧 Email: support@vibecoding.dev
💬 Telegram: @vibecoding_support
📞 Звонок: +1 (555) 123-4567

⏰ Время работы: 24/7
🌍 Поддержка на русском и английском

Мы отвечаем в течение 15 минут!
      `

      await ctx.replyWithMarkdown(
        supportMessage,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔙 Назад к курсу', 'back_to_course')],
        ])
      )
    })
  }

  private setupActions() {
    // Навигационные действия
    this.bot.action('back_to_course', async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.enter('vibeCodingStart')
    })

    this.bot.action('show_demo', async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.enter('vibeCodingDemo')
    })

    this.bot.action('show_testimonials', async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.enter('vibeCodingTestimonials')
    })

    this.bot.action('show_offer', async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.enter('vibeCodingOffer')
    })

    this.bot.action('buy_course', async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.enter('vibeCodingPayment')
    })

    // Действия для демо
    this.bot.action('problem_productivity', async ctx => {
      await ctx.answerCbQuery()
      await this.showProductivityProblem(ctx)
    })

    this.bot.action('problem_burnout', async ctx => {
      await ctx.answerCbQuery()
      await this.showBurnoutProblem(ctx)
    })

    this.bot.action('problem_code_quality', async ctx => {
      await ctx.answerCbQuery()
      await this.showCodeQualityProblem(ctx)
    })

    // Действия для оплаты
    this.bot.action('payment_crypto', async ctx => {
      await ctx.answerCbQuery()
      await this.handleCryptoPayment(ctx)
    })

    this.bot.action('payment_card', async ctx => {
      await ctx.answerCbQuery()
      await this.handleCardPayment(ctx)
    })

    this.bot.action('payment_paypal', async ctx => {
      await ctx.answerCbQuery()
      await this.handlePayPalPayment(ctx)
    })
  }

  private async showProductivityProblem(ctx: MyContext) {
    const message = `
😰 **Проблема: Низкая Продуктивность**

🔍 **Симптомы:**
• Часами сидите над простыми задачами
• Постоянно отвлекаетесь и теряете фокус
• Код получается хаотичным и сложным
• Чувствуете, что "плывете" в проекте

💡 **Решение в Вайб-Кодинге:**
✅ Техники входа в состояние потока за 5 минут
✅ Увеличение продуктивности в 3-5 раз
✅ Интуитивное понимание архитектуры
✅ Естественная концентрация на 2-4 часа

📈 **Результат:** Вместо 8 часов мучений - 2 часа в потоке с лучшим результатом
    `

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎯 Хочу решить эту проблему!',
              callback_data: 'show_offer',
            },
          ],
          [{ text: '🔙 Другие проблемы', callback_data: 'show_demo' }],
        ],
      },
    })
  }

  private async showBurnoutProblem(ctx: MyContext) {
    const message = `
🔥 **Проблема: Выгорание от Программирования**

🔍 **Симптомы:**
• Программирование стало рутиной и стрессом
• Нет радости от создания кода
• Постоянная усталость и раздражение
• Мысли о смене профессии

💡 **Решение в Вайб-Кодинге:**
✅ Возвращение радости к программированию
✅ Медитативный подход к кодингу
✅ Код как форма самовыражения
✅ Устойчивая мотивация и вдохновение

📈 **Результат:** Программирование становится источником энергии, а не её потребителем
    `

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '❤️ Хочу вернуть любовь к коду!',
              callback_data: 'show_offer',
            },
          ],
          [{ text: '🔙 Другие проблемы', callback_data: 'show_demo' }],
        ],
      },
    })
  }

  private async showCodeQualityProblem(ctx: MyContext) {
    const message = `
🗑️ **Проблема: Плохое Качество Кода**

🔍 **Симптомы:**
• Код сложно читать и понимать
• Постоянные баги и технический долг
• Стыдно показывать код коллегам
• Рефакторинг превращается в кошмар

💡 **Решение в Вайб-Кодинге:**
✅ Интуитивное чувство красивого кода
✅ Естественная архитектура без переусложнения
✅ Код, который читается как поэзия
✅ Гордость за каждую написанную строку

📈 **Результат:** Ваш код становится примером для других разработчиков
    `

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🎨 Хочу писать красивый код!',
              callback_data: 'show_offer',
            },
          ],
          [{ text: '🔙 Другие проблемы', callback_data: 'show_demo' }],
        ],
      },
    })
  }

  private async handleCryptoPayment(ctx: MyContext) {
    const message = `
₿ **Оплата Криптовалютой**

💰 **Стоимость:** $3,500 USD

🪙 **Принимаем:**
• Bitcoin (BTC)
• Ethereum (ETH) 
• USDT (TRC20/ERC20)
• USDC

📧 **Для оплаты напишите нам:**
support@vibecoding.dev

⚡ **Преимущества крипто-оплаты:**
• Мгновенное зачисление
• Анонимность
• Без комиссий банков
• Скидка 5% = $3,325

🎁 **Бонус:** При крипто-оплате - персональная консультация 1 час БЕСПЛАТНО!
    `

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📧 Написать для оплаты',
              url: 'mailto:support@vibecoding.dev',
            },
          ],
          [
            {
              text: '💬 Telegram поддержка',
              url: 'https://t.me/vibecoding_support',
            },
          ],
          [{ text: '🔙 Другие способы оплаты', callback_data: 'buy_course' }],
        ],
      },
    })
  }

  private async handleCardPayment(ctx: MyContext) {
    const message = `
💳 **Оплата Банковской Картой**

💰 **Стоимость:** $3,500 USD

🌍 **Принимаем карты:**
• Visa
• Mastercard
• American Express
• Мир (для РФ)

🔒 **Безопасность:**
• SSL шифрование
• PCI DSS сертификация
• 3D Secure защита

💳 **Для оплаты картой:**
Нажмите кнопку ниже для перехода к безопасной форме оплаты

🎁 **Бонус:** Рассрочка 0% на 6 месяцев = $583/месяц
    `

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '💳 Оплатить картой',
              url: 'https://pay.vibecoding.dev/card',
            },
          ],
          [
            {
              text: '📅 Рассрочка 6 месяцев',
              url: 'https://pay.vibecoding.dev/installment',
            },
          ],
          [{ text: '🔙 Другие способы оплаты', callback_data: 'buy_course' }],
        ],
      },
    })
  }

  private async handlePayPalPayment(ctx: MyContext) {
    const message = `
🅿️ **Оплата через PayPal**

💰 **Стоимость:** $3,500 USD

✅ **Преимущества PayPal:**
• Защита покупателей
• Мгновенная оплата
• Поддержка 200+ стран
• Возврат средств гарантирован

🔒 **Безопасность:**
• Данные карты не передаются
• Двухфакторная аутентификация
• Мониторинг мошенничества 24/7

💰 **Для оплаты через PayPal:**
Нажмите кнопку ниже для безопасной оплаты

🎁 **Бонус:** При оплате через PayPal - доступ к эксклюзивному сообществу!
    `

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🅿️ Оплатить PayPal',
              url: 'https://paypal.me/vibecoding/3500',
            },
          ],
          [
            {
              text: '💬 Вопросы по PayPal',
              url: 'https://t.me/vibecoding_support',
            },
          ],
          [{ text: '🔙 Другие способы оплаты', callback_data: 'buy_course' }],
        ],
      },
    })
  }

  public launch() {
    this.bot.launch()
    logger.info('🚀 VibeCoding Bot запущен!')

    // Graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'))
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'))
  }

  public getBot() {
    return this.bot
  }
}

// Экспорт для использования в основном приложении
export const createVibeCodingBot = (token: string) => {
  return new VibeCodingBot(token)
}

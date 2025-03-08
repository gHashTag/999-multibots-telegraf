import { MyContext } from '@/interfaces'
import { levels } from '@/menu/mainMenu'

interface BuyParams {
  ctx: MyContext
  isRu: boolean
}

export async function handleBuySubscription({ ctx, isRu }: BuyParams) {
  try {
    const subscriptionTitles = {
      neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
      neurobase: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
      neuroblogger: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
      // neuromentor: isRu ? '🦸🏼‍♂️ НейроМентор' : '🦸🏼‍♂️ NeuroMentor',
    }

    const subscriptionDescriptions = {
      neurophoto: isRu
        ? 'Создание фотографий с помощью нейросетей.'
        : 'Creating photos using neural networks.',
      neurobase: isRu
        ? 'Самостоятельное обучение по нейросетям с ИИ аватаром.'
        : 'Self-study on neural networks with AI avatar.',
      neuromeeting: isRu
        ? 'Индивидуальная встреча с экспертом.'
        : 'Individual meeting with an expert.',
      neuroblogger: isRu
        ? 'Обучение по нейросетям с ментором.'
        : 'Training on neural networks with a mentor.',
      // neuromentor: isRu
      //   ? 'Обучение по нейросетям с ментором.'
      //   : 'Training on neural networks with a mentor.',
    }

    const subscriptionStarAmounts = {
      neurophoto: 476,
      neurobase: 750,
      neuroblogger: 27777,
      // neuromentor: 100000,
    }

    const subscriptionType = ctx.session.subscription
    const amount = subscriptionStarAmounts[subscriptionType]

    const title = subscriptionTitles[subscriptionType] || `${amount} ⭐️`
    const description =
      subscriptionDescriptions[subscriptionType] ||
      (isRu
        ? `💬 Получите ${amount} звезд.\nИспользуйте звезды для различных функций нашего бота и наслаждайтесь новыми возможностями!`
        : `💬 Get ${amount} stars.\nUse stars for various functions of our bot and enjoy new opportunities!`)

    await ctx.replyWithInvoice({
      title,
      description,
      payload: `${amount}_${Date.now()}`,
      currency: 'XTR', // Pass “XTR” for payments in Telegram Stars.
      prices: [
        {
          label: isRu ? 'Цена' : 'Price',
          amount: amount,
        },
      ],
      provider_token: '',
    })

    return
  } catch (error) {
    console.error('Error in handleBuySubscription:', error)
    throw error
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'
import { MyContext } from '@/interfaces'
import { refundUser } from '@/price/helpers'
import { Scenes } from 'telegraf'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage } from '@/menu'

interface Prediction {
  input: {
    prompt: string
    [key: string]: any
  }
  status:
    | 'starting'
    | 'processing'
    | 'queued'
    | 'succeeded'
    | 'failed'
    | 'canceled'
  [key: string]: any
}
export const cancelPredictionsWizard = new Scenes.WizardScene<MyContext>(
  'cancelPredictionsWizard',
  async ctx => {
    try {
      // Получаем список предсказаний
      const response = await axios.get(
        'https://api.replicate.com/v1/predictions',
        {
          headers: {
            Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          },
        }
      )

      const predictions = response.data.results
      console.log('predictions', predictions)

      const predictionsToCancel = predictions.filter(
        (prediction: Prediction) => {
          const isMatchingPrompt =
            prediction.input.prompt === ctx.session.prompt
          const isCancelableStatus = [
            'starting',
            'processing',
            'queued',
          ].includes(prediction.status)
          return isMatchingPrompt && isCancelableStatus
        }
      )
      console.log('predictionsToCancel', predictionsToCancel)

      // Отменяем каждое подходящее предсказание
      for (const prediction of predictionsToCancel) {
        await axios.post(
          prediction.urls.cancel,
          {},
          {
            headers: {
              Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
            },
          }
        )
        console.log(`Cancelled prediction with ID: ${prediction.id}`)
        const isRu = isRussian(ctx)
        // Отправляем сообщение пользователю
        await ctx.reply(
          isRu
            ? `Запрос с ID: ${prediction.id} успешно отменен.`
            : `Request with ID: ${prediction.id} successfully cancelled.`
        )

        if (ctx.from) {
          const paymentAmount = ctx.session.paymentAmount || 0
          console.log('paymentAmount', paymentAmount)
          await refundUser(ctx, paymentAmount)
        }
      }
      return ctx.scene.leave()
    } catch (error) {
      console.error('Error cancelling predictions:', error)
      const isRu = isRussian(ctx)
      await sendGenericErrorMessage(ctx, isRu, error as Error)
      return ctx.scene.leave()
    }
  }
)

/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from 'axios'
import { MyContext } from '@/interfaces'
import { refundUser } from '@/price/helpers'
import { Scenes } from 'telegraf'
import { isRussian } from '@/helpers/language'
import { sendGenericErrorMessage } from '@/navigation'

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
      }

      // Refund ONCE for the cancelled operation, not once per matching
      // prediction. ctx.session.paymentAmount is a SINGLE payment; refunding it
      // inside the loop paid it out N times when the prompt matched N predictions
      // (the user's own re-submits, or another user's identical prompt) -- minting
      // credit. This scene is registered but currently has no entry point, so the
      // fix hardens it against a refund-mint for the day it is wired.
      if (ctx.from && predictionsToCancel.length > 0) {
        const paymentAmount = ctx.session.paymentAmount || 0
        await refundUser(ctx, paymentAmount, { reason: 'user_cancelled' })
      }

      return ctx.scene.leave()
    } catch (error) {
      console.error('Error cancelling predictions:', error)
      const isRu = isRussian(ctx)
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }
  }
)

import { replicate } from '@/core/replicate'
import {
  updateUserBalance,
  updateUserLevelPlusOne,
  supabase,
  createModelTraining,
  getUserByTelegramIdString,
} from '@/core/supabase'
import { processBalanceOperation } from '@/price/helpers'

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import { PaymentType } from '@/interfaces/payments.interface'

export interface ApiError extends Error {
  response?: {
    status: number
  }
}

interface TrainingResponse {
  id: string
  status: string
  urls: { get: string }
  error?: string
}

interface ReplicateModelResponse {
  latest_version?: {
    id: string
  }
}

interface ModelTrainingResult {
  model_id: string
  model_url?: string
}

const activeTrainings = new Map<string, { cancel: () => void }>()

async function getLatestModelUrl(modelName: string): Promise<string> {
  try {
    const username = process.env.REPLICATE_USERNAME
    if (!username) {
      throw new Error('REPLICATE_USERNAME is not set in environment variables')
    }
    const response = await fetch(
      `https://api.replicate.com/v1/models/${username}/${modelName}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(
          `Model ${username}/${modelName} not found or has no version yet.`
        )
        throw new Error(
          `Model ${username}/${modelName} not found or has no version yet.`
        )
      }
      throw new Error(
        `Failed to fetch latest version id, status: ${response.status}`
      )
    }

    const data = (await response.json()) as ReplicateModelResponse
    console.log('data:', data)
    if (!data.latest_version?.id) {
      throw new Error(
        `Latest version ID not found for model ${username}/${modelName}`
      )
    }
    const model_url = `${username}/${modelName}:${data.latest_version.id}`
    console.log('model_url:', model_url)
    return model_url
  } catch (error) {
    console.error('Error fetching latest model url:', error)
    throw error
  }
}

export async function generateModelTraining(
  zipUrl: string,
  triggerWord: string,
  modelName: string,
  steps: number,
  telegram_id: number,
  is_ru: boolean,
  bot: Telegraf<MyContext>,
  bot_name: string,
  gender: string
): Promise<ModelTrainingResult> {
  const userExists = await getUserByTelegramIdString(telegram_id.toString())
  if (!userExists) {
    throw new Error(`User with ID ${telegram_id} does not exist.`)
  }
  const level = userExists.level
  await updateUserLevelPlusOne(telegram_id.toString(), level)
  let currentTraining: TrainingResponse | null = null
  console.log(`currentTraining: ${currentTraining}`)

  const costResult = calculateModeCost({
    mode: ModeEnum.DigitalAvatarBody,
    steps: steps,
  })
  const paymentAmount = costResult.stars

  console.log('Starting balance check for user:', telegram_id)
  console.log('Payment amount:', paymentAmount)
  console.log('Is Russian:', is_ru)
  const balanceCheck = await processBalanceOperation({
    telegram_id: Number(telegram_id),
    paymentAmount,
    is_ru,
    bot_name: bot_name,
  } as any)
  console.log('Balance check result:', balanceCheck)

  if (!balanceCheck.success) {
    if (balanceCheck.error) {
      try {
        await bot.telegram.sendMessage(
          telegram_id.toString(),
          balanceCheck.error
        )
      } catch (notifyError) {
        console.error(
          'Failed to send balance error notification to user (Training)',
          { telegramId: telegram_id, error: notifyError }
        )
        // errorMessageAdmin(notifyError as Error)
      }
    }
    throw new Error(
      balanceCheck.error ||
        (is_ru ? 'Ошибка проверки баланса' : 'Balance check failed')
    )
  }
  const initialBalance = balanceCheck.currentBalance

  try {
    const username = process.env.REPLICATE_USERNAME
    if (!username) {
      throw new Error('REPLICATE_USERNAME is not set')
    }

    const destination: `${string}/${string}` = `${username}/${modelName}`
    console.log('destination', destination)
    let modelExists = false
    try {
      console.log(`Checking if model exists: ${username}/${modelName}`)
      await replicate.models.get(username, modelName)
      console.log(`Model ${username}/${modelName} exists.`)
      modelExists = true
    } catch (error) {
      if ((error as ApiError).response?.status === 404) {
        console.log(
          `Model ${username}/${modelName} does not exist. Creating...`
        )
        modelExists = false
      } else {
        console.error('Error checking model existence:', error)
        throw error
      }
    }

    if (!modelExists) {
      try {
        console.log(`Creating model ${username}/${modelName}...`)
        await replicate.models.create(username, modelName, {
          description: `LoRA model trained with trigger word: ${triggerWord}`,
          visibility: 'public',
          hardware: 'gpu-t4',
        })
        console.log(`Model ${username}/${modelName} created.`)
        await new Promise(resolve => setTimeout(resolve, 3000))
      } catch (error) {
        console.error('Ошибка API при создании модели:', error.message)
        // errorMessage(error as Error, telegram_id, is_ru)
        // errorMessageAdmin(error as Error)
        throw error
      }
    }

    const dbTrainingRecord = await createModelTraining({
      telegram_id: telegram_id,
      model_name: modelName,
      trigger_word: triggerWord,
      zip_url: zipUrl,
      steps,
      status: 'starting',
      gender,
      api: 'replicate',
      bot_name: bot_name,
    } as any)
    console.log(
      `Created DB training record ID: ${(dbTrainingRecord as any)?.id ?? 'unknown'}`
    )

    console.log(`ZIP URL for training: ${zipUrl}`)
    if (!zipUrl || !zipUrl.startsWith('http')) {
      console.error(
        `Invalid ZIP URL: ${zipUrl}. It must be a valid HTTP/HTTPS URL.`
      )
      throw new Error(`Invalid ZIP URL provided for training: ${zipUrl}`)
    }

    console.log(`Starting Replicate training for model ${destination}...`)
    currentTraining = await replicate.trainings.create(
      'ostris',
      'flux-dev-lora-trainer',
      'e440909d3512c31646ee2e0c7d6f6f4923224863a6a10c494606e79fb5844497',
      {
        destination,
        input: {
          steps,
          lora_rank: 128,
          optimizer: 'adamw8bit',
          batch_size: 1,
          resolution: '512,768,1024',
          autocaption: true,
          input_images: zipUrl,
          trigger_word: triggerWord,
          learning_rate: 0.0001,
          wandb_project: 'flux_train_replicate',
        },
      }
    )
    console.log(`Replicate training started. ID: ${currentTraining.id}`)

    await supabase
      .from('model_trainings')
      .update({
        replicate_training_id: currentTraining.id,
        status: 'processing',
      })
      .eq('id', (dbTrainingRecord as any)?.id ?? 'unknown')

    const newBalance = initialBalance - paymentAmount
    await updateUserBalance(
      telegram_id.toString(),
      newBalance,
      PaymentType.MONEY_OUTCOME,
      `Model training start ${modelName} (steps: ${steps})`,
      {
        stars: paymentAmount,
        payment_method: 'Internal',
        bot_name: bot_name,
        language: is_ru ? 'ru' : 'en',
        operation_id: currentTraining.id,
      }
    )
    console.log(
      `Balance updated after training start. New balance: ${newBalance}`
    )

    await bot.telegram.sendMessage(
      telegram_id,
      is_ru
        ? `✅ Тренировка модели ${modelName} успешно запущена! Списано: ${paymentAmount} ⭐️. Ваш новый баланс: ${newBalance.toFixed(
            2
          )} ⭐️.`
        : `✅ Model training ${modelName} started successfully! Deducted: ${paymentAmount} ⭐️. Your new balance: ${newBalance.toFixed(
            2
          )} ⭐️.`
    )

    const trainingProcess = {
      cancel: () => {
        activeTrainings.delete(telegram_id.toString())
      },
    }
    activeTrainings.set(telegram_id.toString(), trainingProcess)

    let status = currentTraining.status
    console.log(`Initial training status: ${status}, ID: ${currentTraining.id}`)

    while (
      status !== 'succeeded' &&
      status !== 'failed' &&
      status !== 'canceled'
    ) {
      console.log(
        `Waiting for training ${currentTraining.id} to complete... Current status: ${status}`
      )
      await new Promise(resolve => setTimeout(resolve, 15000))
      const updatedTraining = await replicate.trainings.get(currentTraining.id)
      status = updatedTraining.status

      if (updatedTraining.error) {
        console.error(
          `Training ${currentTraining.id} error details from Replicate:`,
          {
            error: updatedTraining.error,
            status: updatedTraining.status,
          }
        )
      }
    }
    console.log(
      `Training ${currentTraining.id} finished with status: ${status}`
    )

    if (status === 'succeeded') {
      console.log('Training succeeded!')
      const model_url = await getLatestModelUrl(modelName)
      console.log('Latest model URL:', model_url)
      await supabase
        .from('users')
        .update({
          latest_model_training: {
            status: 'SUCCESS',
            model_url,
            replicate_training_id: currentTraining.id,
          },
        })
        .eq('telegram_id', telegram_id.toString())

      await supabase
        .from('model_trainings')
        .update({ status: 'SUCCESS', model_url: model_url })
        .eq('replicate_training_id', currentTraining.id)

      bot.telegram.sendMessage(
        telegram_id,
        is_ru
          ? `✅ Модель ${modelName} успешно обучена!\nВаш уникальный ключ: ${triggerWord}`
          : `✅ Model ${modelName} trained successfully!\nYour unique keyword: ${triggerWord}`
      )
      return {
        model_id: currentTraining.id,
        model_url: model_url,
      }
    } else {
      console.error(
        `Training ${currentTraining.id} failed or canceled. Status: ${status}`
      )
      const errorMessageText = is_ru
        ? `❌ Тренировка модели ${modelName} не удалась (статус: ${status}). Средства НЕ списаны (или будут возвращены, если логика возврата есть).`
        : `❌ Model training ${modelName} failed or canceled (status: ${status}). Funds were NOT deducted (or will be refunded if refund logic exists).`
      await bot.telegram.sendMessage(telegram_id, errorMessageText)
      throw new Error(`Training failed or canceled with status: ${status}`)
    }
  } catch (error) {
    console.error('Error during model training process:', error)
    if (currentTraining?.id) {
      try {
        console.log(
          `Attempting to cancel training ${currentTraining.id} due to error...`
        )
        await replicate.trainings.cancel(currentTraining.id)
        console.log(`Training ${currentTraining.id} cancellation requested.`)
        await supabase
          .from('model_trainings')
          .update({ status: 'canceled' })
          .eq('replicate_training_id', currentTraining.id)
      } catch (cancelError) {
        console.error(
          `Failed to cancel training ${currentTraining.id}:`,
          cancelError
        )
      }
    }
    if (!error.message?.includes('Balance check failed')) {
      // errorMessage(error as Error, telegram_id.toString(), is_ru)
    }
    // errorMessageAdmin(error as Error)
    throw error
  } finally {
    activeTrainings.delete(telegram_id.toString())
  }
}

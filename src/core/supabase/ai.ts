import { supabase } from './index'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import FormData from 'form-data'
import axios from 'axios'

export const getHistory = async (
  brand: string,
  command: string,
  type: string
) => {
  const { data, error } = await supabase
    .from('clips')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
    .eq('brand', brand)
    .eq('command', command)
    .eq('type', type)

  if (error) {
    console.error('Error fetching lifehacks history:', error)
    return []
  }

  return data
}

type setHistoryProps = {
  brand: string
  response: string
  video_url: string
  command: string
  type: string
  voice_id: string
  chat_id: string
  lang: string
  trigger: string
}

export const setHistory = async ({
  brand,
  response,
  video_url,
  command,
  type,
  voice_id = '',
  chat_id = '',
  lang = '',
  trigger,
}: setHistoryProps) => {
  // Удаление символов # и *
  const sanitizeResponse = (text: string) => {
    return text.replace(/[#*]/g, '')
  }

  const sanitizedResponse = sanitizeResponse(response)

  const { error } = await supabase.from('clips').insert({
    brand: brand,
    response: sanitizedResponse,
    video_url: video_url,
    command: command,
    type: type,
    voice_id: voice_id,
    chat_id: chat_id,
    lang: lang,
    trigger,
  })

  if (error) {
    console.error('Error setting lifehack history:', error)
    return false
  }

  return true
}

export const incrementGeneratedImages = async (telegram_id: number) => {
  const { data, error } = await supabase
    .from('users')
    .select('count')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error && error.code === 'PGRST116') {
    const { error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegram_id.toString(), count: 1 })

    if (insertError) {
      console.error('Ошибка при добавлении нового telegram_id:', insertError)
      return false
    }
  } else if (data) {
    const newCount = data.count + 1
    const { error: updateError } = await supabase
      .from('users')
      .update({ count: newCount })
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      console.error('Ошибка при обновлении count для telegram_id:', updateError)
      return false
    }
  } else {
    console.error('Ошибка при проверке существования telegram_id:', error)
    return false
  }

  return true
}

export const incrementLimit = async ({
  telegram_id,
  amount,
}: {
  telegram_id: number
  amount: number
}) => {
  const { data, error } = await supabase
    .from('users')
    .select('limit')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error && error.code === 'PGRST116') {
    const { error: insertError } = await supabase
      .from('users')
      .insert({ telegram_id: telegram_id.toString(), limit: amount })

    if (insertError) {
      console.error('Ошибка при добавлении нового telegram_id:', insertError)
      return false
    }
  } else if (data) {
    const newLimit = data.limit + amount
    const { error: updateError } = await supabase
      .from('users')
      .update({ limit: newLimit })
      .eq('telegram_id', telegram_id.toString())

    if (updateError) {
      console.error('Ошибка при обновлении limit для telegram_id:', updateError)
      return false
    }
  } else {
    console.error('Ошибка при проверке существования telegram_id:', error)
    return false
  }

  return true
}

export const getGeneratedImages = async (telegram_id: number) => {
  const { data, error } = await supabase
    .from('users')
    .select('count, limit')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error || !data) {
    return { count: 0, limit: 2 }
  }

  return { count: Number(data.count), limit: Number(data.limit) }
}

export const getAspectRatio = async (telegram_id: number) => {
  const { data, error } = await supabase
    .from('users')
    .select('aspect_ratio')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error || !data) {
    console.error('Ошибка при получении aspect_ratio для telegram_id:', error)
    return null
  }

  return data.aspect_ratio
}

export const setAspectRatio = async (
  telegram_id: number,
  aspect_ratio: string
) => {
  const { error } = await supabase
    .from('users')
    .update({ aspect_ratio: aspect_ratio })
    .eq('telegram_id', telegram_id.toString())

  if (error) {
    console.error('Ошибка при установке aspect_ratio для telegram_id:', error)
    return false
  }
  return true
}

// Пример использования fetchWithDynamicImport
// export async function createVoiceSyncLabs({
//   fileUrl,
//   username,
// }: {
//   fileUrl: string
//   username: string
// }): Promise<string | null> {
//   const url = 'https://api.synclabs.so/voices/create'
//   const body = JSON.stringify({
//     name: username,
//     description: `Voice created from Telegram voice message`,
//     inputSamples: [fileUrl],
//     webhookUrl: `${process.env.SUPABASE_URL}/functions/v1/synclabs-video`,
//   })

//   try {
//     const response = await fetchWithAxios(url, {
//       method: 'POST',
//       headers: {
//         'x-api-key': process.env.SYNC_LABS_API_KEY as string,
//         'Content-Type': 'application/json',
//       },
//       data: body,
//     })

//     if (response.ok) {
//       const result = (await response.json()) as { id: string }

//       return result.id
//     } else {
//       console.error(`Error: ${response.status} ${response.statusText}`)
//       return null
//     }
//   } catch (error) {
//     console.error(error)
//     return null
//   }
// }

export const savePrompt = async (
  prompt: string,
  model_type: string,
  media_url?: string,
  telegram_id?: number
): Promise<number | null> => {
  // Проверяем, существует ли уже такой промпт в таблице
  const { data: existingPrompt, error: selectError } = await supabase
    .from('prompts_history')
    .select('prompt_id')
    .eq('prompt', prompt)
    .eq('model_type', model_type)
    .eq('media_url', media_url)
    .eq('telegram_id', telegram_id)
    .maybeSingle()

  if (selectError) {
    console.error('Ошибка при проверке существующего промпта:', selectError)
    return null
  }

  if (existingPrompt) {
    return existingPrompt.prompt_id
  }

  // Если промпт не существует, добавляем его в таблицу
  const { data: newPrompt, error } = await supabase
    .from('prompts_history')
    .insert({
      prompt: prompt,
      model_type: model_type,
      media_url: media_url,
      telegram_id: telegram_id,
    })
    .select()
    .single()

  if (error) {
    console.error('Ошибка при сохранении промпта:', error)
    return null
  }

  return newPrompt.prompt_id
}

export const getPrompt = async (prompt_id: string) => {
  const { data, error } = await supabase
    .from('prompts_history')
    .select('*')
    .eq('prompt_id', prompt_id)
    .single()

  if (error || !data) {
    console.error('Ошибка при получении промпта по prompt_id:', error)
    return null
  }

  return data
}

export async function getModel(telegram_id: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('model')
      .eq('telegram_id', telegram_id)
      .single()

    if (error || !data) throw new Error('Error getModel: ' + error)
    return data?.model
  } catch (error) {
    throw new Error('Error getModel: ' + error)
  }
}

export async function setModel(telegram_id: string, model: string) {
  try {
    await supabase
      .from('users')
      .update({ model })
      .eq('telegram_id', telegram_id)
      .select('*')
  } catch (error) {
    throw new Error('Error setModel: ' + error)
  }
}

export const getUserData = async (telegram_id: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('username, first_name, last_name, company, position, designation')
    .eq('telegram_id', telegram_id.toString())
    .single()

  if (error) {
    throw new Error(
      `Ошибка при получении данных пользователя: ${error.message}`
    )
  }

  return data
}

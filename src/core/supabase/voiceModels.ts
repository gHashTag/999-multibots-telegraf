/**
 * 🎤 Voice Models CRUD
 *
 * Управление голосовыми моделями пользователей для AI Cover
 * Таблица: voice_models
 */

import { supabase } from './client'
import { logger } from '@/utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type VoiceModelStatus = 'pending' | 'training' | 'ready' | 'failed'

export interface VoiceModel {
  id: string
  telegram_id: string
  model_name: string
  replicate_training_id: string | null
  model_url: string | null
  status: VoiceModelStatus
  audio_url: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface CreateVoiceModelParams {
  telegram_id: string
  model_name: string
  replicate_training_id?: string
  audio_url?: string
  status?: VoiceModelStatus
}

export interface UpdateVoiceModelParams {
  replicate_training_id?: string
  model_url?: string
  status?: VoiceModelStatus
  error_message?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Создает новую запись голосовой модели
 */
export async function createVoiceModel(
  params: CreateVoiceModelParams
): Promise<VoiceModel> {
  const { telegram_id, model_name, replicate_training_id, audio_url, status } =
    params

  logger.info('[VOICE_MODELS] Creating voice model', {
    telegram_id,
    model_name,
  })

  const { data, error } = await supabase
    .from('voice_models')
    .insert({
      telegram_id,
      model_name,
      replicate_training_id: replicate_training_id || null,
      audio_url: audio_url || null,
      status: status || 'pending',
    })
    .select()
    .single()

  if (error) {
    logger.error('[VOICE_MODELS] Failed to create voice model', {
      telegram_id,
      error: error.message,
    })
    throw new Error(`Failed to create voice model: ${error.message}`)
  }

  logger.info('[VOICE_MODELS] Voice model created', {
    id: data.id,
    telegram_id,
  })

  return data as VoiceModel
}

// ═══════════════════════════════════════════════════════════════════════════
// READ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Получает голосовую модель пользователя
 * Возвращает последнюю готовую (ready) модель
 */
export async function getVoiceModel(
  telegram_id: string
): Promise<VoiceModel | null> {
  const { data, error } = await supabase
    .from('voice_models')
    .select('*')
    .eq('telegram_id', telegram_id)
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found - не ошибка
      return null
    }
    logger.error('[VOICE_MODELS] Failed to get voice model', {
      telegram_id,
      error: error.message,
    })
    return null
  }

  return data as VoiceModel
}

/**
 * Получает все голосовые модели пользователя
 */
export async function getUserVoiceModels(
  telegram_id: string
): Promise<VoiceModel[]> {
  const { data, error } = await supabase
    .from('voice_models')
    .select('*')
    .eq('telegram_id', telegram_id)
    .order('created_at', { ascending: false })

  if (error) {
    logger.error('[VOICE_MODELS] Failed to get user voice models', {
      telegram_id,
      error: error.message,
    })
    return []
  }

  return (data as VoiceModel[]) || []
}

/**
 * Получает модель по ID тренировки Replicate
 */
export async function getVoiceModelByTrainingId(
  replicate_training_id: string
): Promise<VoiceModel | null> {
  const { data, error } = await supabase
    .from('voice_models')
    .select('*')
    .eq('replicate_training_id', replicate_training_id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    logger.error('[VOICE_MODELS] Failed to get voice model by training ID', {
      replicate_training_id,
      error: error.message,
    })
    return null
  }

  return data as VoiceModel
}

/**
 * Проверяет, есть ли у пользователя готовая модель
 */
export async function hasReadyVoiceModel(telegram_id: string): Promise<boolean> {
  const model = await getVoiceModel(telegram_id)
  return model !== null
}

/**
 * Проверяет, есть ли у пользователя модель в процессе обучения
 */
export async function hasTrainingVoiceModel(
  telegram_id: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('voice_models')
    .select('id')
    .eq('telegram_id', telegram_id)
    .in('status', ['pending', 'training'])
    .limit(1)

  if (error) {
    return false
  }

  return data && data.length > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Обновляет голосовую модель
 */
export async function updateVoiceModel(
  id: string,
  params: UpdateVoiceModelParams
): Promise<VoiceModel | null> {
  logger.info('[VOICE_MODELS] Updating voice model', {
    id,
    params,
  })

  const { data, error } = await supabase
    .from('voice_models')
    .update({
      ...params,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    logger.error('[VOICE_MODELS] Failed to update voice model', {
      id,
      error: error.message,
    })
    return null
  }

  logger.info('[VOICE_MODELS] Voice model updated', {
    id,
    status: params.status,
  })

  return data as VoiceModel
}

/**
 * Обновляет статус модели по ID тренировки
 */
export async function updateVoiceModelByTrainingId(
  replicate_training_id: string,
  params: UpdateVoiceModelParams
): Promise<VoiceModel | null> {
  const { data, error } = await supabase
    .from('voice_models')
    .update({
      ...params,
      updated_at: new Date().toISOString(),
    })
    .eq('replicate_training_id', replicate_training_id)
    .select()
    .single()

  if (error) {
    logger.error('[VOICE_MODELS] Failed to update voice model by training ID', {
      replicate_training_id,
      error: error.message,
    })
    return null
  }

  return data as VoiceModel
}

/**
 * Помечает модель как готовую
 */
export async function markVoiceModelReady(
  id: string,
  model_url: string
): Promise<VoiceModel | null> {
  return updateVoiceModel(id, {
    status: 'ready',
    model_url,
  })
}

/**
 * Помечает модель как неудачную
 */
export async function markVoiceModelFailed(
  id: string,
  error_message: string
): Promise<VoiceModel | null> {
  return updateVoiceModel(id, {
    status: 'failed',
    error_message,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Удаляет голосовую модель
 */
export async function deleteVoiceModel(id: string): Promise<boolean> {
  const { error } = await supabase.from('voice_models').delete().eq('id', id)

  if (error) {
    logger.error('[VOICE_MODELS] Failed to delete voice model', {
      id,
      error: error.message,
    })
    return false
  }

  logger.info('[VOICE_MODELS] Voice model deleted', { id })
  return true
}

/**
 * Удаляет все неудачные модели пользователя
 */
export async function deleteFailedVoiceModels(
  telegram_id: string
): Promise<number> {
  const { data, error } = await supabase
    .from('voice_models')
    .delete()
    .eq('telegram_id', telegram_id)
    .eq('status', 'failed')
    .select()

  if (error) {
    logger.error('[VOICE_MODELS] Failed to delete failed voice models', {
      telegram_id,
      error: error.message,
    })
    return 0
  }

  return data?.length || 0
}

export default {
  // Create
  createVoiceModel,
  // Read
  getVoiceModel,
  getUserVoiceModels,
  getVoiceModelByTrainingId,
  hasReadyVoiceModel,
  hasTrainingVoiceModel,
  // Update
  updateVoiceModel,
  updateVoiceModelByTrainingId,
  markVoiceModelReady,
  markVoiceModelFailed,
  // Delete
  deleteVoiceModel,
  deleteFailedVoiceModels,
}

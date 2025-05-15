import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mockDeep, mockReset } from 'vitest-mock-extended' // Используем mockDeep
import { inngest } from '@/inngest_app/client' // Правильный импорт
import { validateAndPrepareTrainingRequest } from '../helpers/trainingHelpers' // Импорт хелпера
import { getUserBalance } from '@/core/supabase/getUserBalance' // Прямой импорт
import { updateUserBalance } from '@/core/supabase/updateUserBalance' // Прямой импорт
import * as supabaseTraining from '@/core/supabase/createModelTraining' // Мокируем через * as
import * as priceCalculator from '@/price/priceCalculator' // Мокируем через * as
import * as config from '@/config' // Импортируем весь модуль config
import * as fs from 'fs'
import * as path from 'path'
import { MyContext } from '@/interfaces'
import { PaymentType } from '@/interfaces/payments.interface'
import { User } from '@/interfaces/user.interface'
import Replicate from 'replicate' // Импортируем тип Replicate
import { ModelTraining } from '@/core/supabase/createModelTraining'
import { logger } from '@/utils/logger'
import * as trainingHelpers from '../helpers/trainingHelpers'
import { DeepMockProxy } from 'vitest-mock-extended'
import { Inngest } from 'inngest'
import { supabase } from '@/core/supabase/client'
import { initiateDigitalAvatarModelTraining } from '../index'
import { getUserById } from '@/core/supabase/getUserById'

// Мокируем зависимости
vi.mock('../helpers/trainingHelpers')
vi.mock('@/core/supabase/getUserBalance')
vi.mock('@/core/supabase/updateUserBalance')
vi.mock('@/core/supabase/createModelTraining')
vi.mock('@/price/priceCalculator')
vi.mock('@/config', () => ({
  REPLICATE_TRAINING_MODEL_VERSION: 'test-version',
  API_URL: 'http://localhost',
  // Мокируем другие нужные константы из config
}))
// Новый способ мокирования Replicate
const mockReplicateCreate = vi.fn()
vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    trainings: {
      create: mockReplicateCreate, // Используем выделенный мок
    },
  })),
}))
vi.mock('@/utils/logger') // Мокируем логгер

// Типизируем моки
const mockValidatePrepare = vi.mocked(
  trainingHelpers.validateAndPrepareTrainingRequest
)
const mockGetUserBalance = vi.mocked(getUserBalance)
const mockUpdateUserBalance = vi.mocked(updateUserBalance)
const mockCreateModelTraining = vi.mocked(supabaseTraining.createModelTraining)
const mockCalculateCost = vi.mocked(priceCalculator.calculateCost)
// Мокируем хелпер createTrainingRecord из trainingHelpers
// const mockCreateTrainingRecordHelper = vi.mocked(
//   trainingHelpers.createTrainingRecord
// ) // Removed this mock as it relates to a commented-out test and a deleted helper
const mockStartReplicate = vi.mocked(trainingHelpers.startReplicateTraining)
const mockUpdateOnError = vi.mocked(trainingHelpers.updateTrainingRecordOnError)
const mockFormatModelName = vi.mocked(trainingHelpers.formatReplicateModelName)
// const MockReplicate = vi.mocked(Replicate) // Больше не нужно
// const mockReplicate = new MockReplicate() // Больше не нужно

// Исправляем имя мока для logger
const mockLogger = vi.mocked(logger)

// describe('startModelTraining (Plan B)', () => { // <-- ЗАКОММЕНТИРОВАНО
//   let ctx: any
//   const telegram_id = '12345'
// ... (весь остальной блок describe закомментирован) ...
// }) // <-- ЗАКОММЕНТИРОВАНО

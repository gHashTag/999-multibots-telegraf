import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Inngest, NonRetriableError, EventPayload } from 'inngest'
import { DeepMockProxy, mockDeep, mockReset } from 'vitest-mock-extended'
import ReplicateClient, { Training as ReplicateTrainingData } from 'replicate' // Импортируем клиент Replicate и тип Training

// Тестируемая Inngest-функция
import { generateModelTraining } from '../generateModelTraining'

// --- Импорт типов для моков и данных ---
import type { User as SupabaseUser } from '@supabase/supabase-js' // Переименовываем, чтобы избежать конфликта с локальным User
import type { ModelTraining as SupabaseModelTraining } from '@/core/supabase/createModelTraining'
import { PaymentType } from '@/interfaces/payments.interface' // Прямой импорт PaymentType
import type {
  ModelTrainingInngestEventData,
  ModelTrainingResponse,
  DigitalAvatarBodyUserSpecificContext, // Закомментировано, так как тип не найден
} from '../../types'
import type * as TrainingHelpersType from '../../helpers/trainingHelpers'
import type { logger as LoggerType } from '@/utils/logger' // Используем typeof для получения типа logger
import type { Telegraf } from 'telegraf'
// import type { InngestClient } from '@/inngest_app/clients'; // Закомментировано из-за ошибки пути

// --- Мокирование зависимостей ---
vi.mock('@/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as LoggerType, // Применяем тип к моку
}))

vi.mock('@/core/supabase/createModelTraining', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/core/supabase/createModelTraining')>()
  return {
    ...actual,
    createModelTraining: vi.fn(),
    // другие функции из этого модуля, если они используются и их нужно мокать
  }
})

vi.mock('../../helpers/trainingHelpers', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../helpers/trainingHelpers')>()
  return {
    ...actual,
    validateAndPrepareTrainingRequest: vi.fn(),
    createTrainingRecord: vi.fn(),
    startReplicateTraining: vi.fn(),
    updateTrainingRecordOnError: vi.fn(),
    formatReplicateModelName: vi.fn(),
    getReplicateWebhookUrl: vi.fn(),
  }
})

// Мокируем Replicate клиент
vi.mock('replicate', () => {
  const MockReplicateClient = vi.fn().mockImplementation(() => ({
    trainings: {
      create: vi.fn(),
      get: vi.fn(),
    },
  }))
  return {
    default: MockReplicateClient,
    // Если Replicate экспортирует тип Training отдельно, это хорошо, иначе его нужно будет определять вручную или импортировать из другого места.
    // Для простоты, пока предположим, что он есть или мы его правильно импортировали как ReplicateTrainingData
  }
})

// vi.mock('@/inngest_app/clients', () => ({
//   digitalAvatarBodyInngest: {
//     send: vi.fn(),
//   } as DeepMockProxy<InngestClient>,
// })); // Закомментировано из-за ошибки пути

vi.mock('telegraf') // Простой мок для Telegraf, если он просто создается new Telegraf()

// --- Конец мокирования зависимостей ---

// --- Типы для мокированных функций (для удобства) ---
type MockedTrainingHelpers = DeepMockProxy<typeof TrainingHelpersType>

describe('generateModelTraining Inngest Function', () => {
  // --- Переменные для моков ---
  let mockLogger: DeepMockProxy<LoggerType> // Используем Logger из @/utils/logger
  let mockSupabase: {
    createModelTraining: ReturnType<typeof vi.fn>
  }
  let mockHelpers: MockedTrainingHelpers
  let mockReplicate: DeepMockProxy<ReplicateClient> // Используем ReplicateClient из 'replicate'
  // let mockInngestClient: DeepMockProxy<InngestClient>; // Закомментировано
  let mockTelegraf: DeepMockProxy<Telegraf> // Telegraf из 'telegraf'

  beforeEach(() => {
    vi.resetAllMocks()

    // Переприсваиваем моки перед каждым тестом, чтобы убедиться, что это свежие моки
    mockLogger = vi.mocked(require('@/utils/logger').logger)
    mockSupabase = {
      createModelTraining: vi.mocked(
        require('@/core/supabase/createModelTraining').createModelTraining
      ),
    }
    mockHelpers = vi.mocked(require('../../helpers/trainingHelpers'))
    mockReplicate = vi.mocked(
      new (require('replicate').default)()
    ) as DeepMockProxy<ReplicateClient>
    // mockInngestClient = vi.mocked(require('@/inngest_app/clients').digitalAvatarBodyInngest); // Закомментировано
    mockTelegraf = vi.mocked(new (require('telegraf').Telegraf)())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should be defined and be an Inngest function object', () => {
    expect(generateModelTraining).toBeDefined()
    expect(generateModelTraining).toHaveProperty('id')
    expect(generateModelTraining).toHaveProperty('handler')
    expect(generateModelTraining).toHaveProperty('triggers')
  })

  // --- Тесты будут добавляться сюда ---
})

import { TestConfig } from './types'

export const TEST_CONFIG: TestConfig = {
  // Использовать мок-бота для тестов
  mockBot: true,

  // Таймауты
  botResponseTimeout: 5000,
  eventProcessingTimeout: 10000,

  // Размер буфера событий
  eventBufferSize: 100,
}

// Минимальный заголовок OGG файла для тестов
export const OGG_HEADER = Buffer.from([
  0x4f,
  0x67,
  0x67,
  0x53, // Magic number
  0x00, // Version
  0x02, // Header type
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // Granule position
])

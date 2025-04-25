// Заменяем выход из процесса на ничего не делающую функцию
jest.spyOn(process, 'exit').mockImplementation(() => {
  return undefined as never
})

// Сохраняем оригинальные значения
const originalEnv = { ...process.env }

// Clear module cache to apply fresh env settings
beforeEach(() => {
  jest.resetModules()
})

// Восстанавливаем оригинальные значения после всех тестов
afterAll(() => {
  process.env = originalEnv
})

describe('src/config/index.ts', () => {
  it('exports configuration matching the environment variables', () => {
    // Проверяем только соответствие значений из process.env и config
    // Не пытаемся контролировать содержимое .env файла
    
    // Получаем текущее состояние переменных
    process.env.NODE_ENV = 'development'
    const devConfig = require('../../src/config')
    
    // Проверяем, что isDev соответствует NODE_ENV
    expect(devConfig.isDev).toBe(process.env.NODE_ENV === 'development')
    
    // Проверяем, что CREDENTIALS соответствует process.env.CREDENTIALS
    const credentialsExpected = process.env.CREDENTIALS === 'true'
    expect(devConfig.CREDENTIALS).toBe(credentialsExpected)
    
    // Проверяем, что isSupabaseConfigured соответствует наличию всех необходимых переменных
    const supabseConfigured = !!(
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    expect(devConfig.isSupabaseConfigured).toBe(supabseConfigured)
  })
  
  it('updates isDev when NODE_ENV changes', () => {
    jest.resetModules()
    
    // Изменяем NODE_ENV
    process.env.NODE_ENV = 'production'
    
    // Получаем конфигурацию
    const prodConfig = require('../../src/config')
    
    // Проверяем, что isDev корректно обновился
    expect(prodConfig.isDev).toBe(false)
    expect(prodConfig.NODE_ENV).toBe('production')
  })
})

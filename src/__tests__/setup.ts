import dotenv from 'dotenv'
import path from 'path'

// Загружаем переменные из .env.test
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') }) // Path relative to src/__tests__/setup.ts

// Можно добавить другую глобальную настройку тестов здесь, если нужно
// Например, мокирование глобальных функций
// vi.mock('some-module');

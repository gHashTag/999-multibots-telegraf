/**
 * Тест переменных окружения для render-server
 */

console.log('🔍 [ENV TEST] Checking environment variables...')

console.log('RENDER_INNGEST_EVENT_KEY:', process.env.RENDER_INNGEST_EVENT_KEY ? 'SET' : 'NOT SET')
console.log('RENDER_INNGEST_SIGNING_KEY:', process.env.RENDER_INNGEST_SIGNING_KEY ? 'SET' : 'NOT SET')
console.log('RENDER_INNGEST_BASE_URL:', process.env.RENDER_INNGEST_BASE_URL || 'NOT SET')

// Проверяем, есть ли переменные в .env файле
import { readFileSync } from 'fs'
try {
  const envContent = readFileSync('.env', 'utf8')
  const renderVars = envContent.split('\n').filter(line => line.includes('RENDER_INNGEST'))
  console.log('📄 [ENV TEST] Variables in .env file:')
  renderVars.forEach(line => console.log('  ', line))
} catch (error) {
  console.log('❌ [ENV TEST] Could not read .env file:', error)
}

const dotenv = require('dotenv')
const path = require('path')

module.exports = async () => {
  console.log('\n[Jest Global Setup] Loading .env...')
  // Путь от корня проекта, где выполняется jest
  dotenv.config({ path: path.resolve(__dirname, '.env') })
  console.log(
    '[Jest Global Setup] Attempted load from:',
    path.resolve(__dirname, '.env')
  )
  console.log(
    '[Jest Global Setup] SUPABASE_URL loaded:',
    !!process.env.SUPABASE_URL
  )
  console.log('[Jest Global Setup] PASSWORD2 loaded:', !!process.env.PASSWORD2)
  console.log('[Jest Global Setup] Finished.')
}

const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')

module.exports = async () => {
  console.log('\n[Jest Global Setup] Setting up test environment...')
  // Путь от корня проекта, где выполняется jest
  const envPath = path.resolve(__dirname, '.env')
  console.log('[Jest Global Setup] Checking for .env at:', envPath)

  if (fs.existsSync(envPath)) {
    console.log('[Jest Global Setup] .env file found. Loading...')
    dotenv.config({ path: envPath })
    console.log(
      '[Jest Global Setup] SUPABASE_URL loaded from .env:',
      !!process.env.SUPABASE_URL
    )
    console.log(
      '[Jest Global Setup] PASSWORD2 loaded from .env:',
      !!process.env.PASSWORD2
    )
  } else {
    console.warn(
      '[Jest Global Setup] WARNING: .env file not found at', envPath, '. Proceeding without loading .env.'
    )
    // Здесь можно установить минимальные дефолтные значения, если нужно
    // process.env.SUPABASE_URL = 'default_test_url'
    // process.env.PASSWORD2 = 'default_test_pass'
  }
  console.log('[Jest Global Setup] Finished.')
}

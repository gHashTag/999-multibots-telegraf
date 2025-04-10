import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function checkStagedTypes() {
  try {
    // Получаем список измененных .ts файлов
    const { stdout: stagedFiles } = await execAsync(
      'git diff --cached --name-only --diff-filter=ACMR "*.ts"'
    )

    if (!stagedFiles) {
      console.log('✅ Нет измененных TypeScript файлов')
      process.exit(0)
    }

    const files = stagedFiles.split('\n').filter(Boolean)

    // Проверяем только измененные файлы с учетом конфигурации TypeScript
    const { stderr } = await execAsync(
      `ts-node -r tsconfig-paths/register ./node_modules/.bin/tsc --noEmit -p tsconfig.json ${files.join(' ')}`
    )

    if (stderr) {
      console.error('❌ Ошибки TypeScript:', stderr)
      process.exit(1)
    }

    console.log('✅ Проверка типов успешно пройдена')
    process.exit(0)
  } catch (error) {
    console.error('❌ Ошибка при проверке типов:', error)
    process.exit(1)
  }
}

checkStagedTypes()

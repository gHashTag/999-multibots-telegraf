const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Путь к исходной директории
const srcDir = path.join(__dirname, '../src')
const distDir = path.join(__dirname, '../dist')

// Создаем dist директорию, если её нет
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir)
}

// Копируем все файлы из src в dist, заменяя расширение .ts на .js
function copyDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name.replace('.ts', '.js'))

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath)
      }
      copyDir(srcPath, destPath)
    } else if (entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(srcPath, 'utf8')
      fs.writeFileSync(destPath, content)
    }
  }
}

console.log('🚀 Начинаем production сборку...')

try {
  // Копируем файлы
  copyDir(srcDir, distDir)
  console.log('✅ Файлы скопированы успешно')

  // Транспилируем TypeScript в JavaScript без проверки типов
  execSync(
    'tsc --allowJs --outDir dist --noEmit false --emitDeclarationOnly false --noEmitOnError false --skipLibCheck true',
    {
      stdio: 'inherit',
    }
  )

  console.log('✅ Сборка завершена успешно')
} catch (error) {
  console.error('❌ Ошибка при сборке:', error)
  process.exit(1)
}

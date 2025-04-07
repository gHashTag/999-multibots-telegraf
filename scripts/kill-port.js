/**
 * Скрипт для завершения процессов, использующих указанные порты
 * Запуск: node scripts/kill-port.js PORT1 PORT2 ...
 * Пример: node scripts/kill-port.js 2999 3001
 */

const { exec } = require('child_process')
const os = require('os')

const ports = process.argv.slice(2)

if (ports.length === 0) {
  console.error('🔴 Необходимо указать номера портов')
  console.error('   Использование: node scripts/kill-port.js PORT1 PORT2 ...')
  console.error('   Пример: node scripts/kill-port.js 2999 3001')
  process.exit(1)
}

console.log(`🔍 Поиск процессов, использующих порты: ${ports.join(', ')}...`)
console.log('   Searching for processes using the ports')

// Определяем операционную систему
const platform = os.platform()

// Функция для завершения процессов по порту
async function killProcessesByPort(port) {
  return new Promise(resolve => {
    let command

    if (platform === 'win32') {
      // Windows
      command = `netstat -ano | findstr :${port}`
    } else {
      // macOS/Linux
      command = `lsof -i:${port} -t`
    }

    exec(command, (error, stdout, stderr) => {
      if (error && !stdout) {
        console.log(`✅ Порт ${port} свободен`)
        console.log('   Port is free')
        resolve()
        return
      }

      if (stderr) {
        console.error(
          `❌ Ошибка при поиске процессов для порта ${port}: ${stderr}`
        )
        console.error(`   Error finding processes for port ${port}: ${stderr}`)
        resolve()
        return
      }

      const pids = stdout.trim().split('\n').filter(Boolean)

      if (pids.length === 0) {
        console.log(`✅ Порт ${port} свободен`)
        console.log('   Port is free')
        resolve()
        return
      }

      console.log(`🔥 Завершение ${pids.length} процессов для порта ${port}...`)
      console.log(`   Killing ${pids.length} processes for port ${port}...`)

      let completedKills = 0

      // Завершаем найденные процессы
      pids.forEach(pid => {
        // Для Windows нужно извлечь PID из строки netstat
        let processId = pid
        if (platform === 'win32') {
          // Последнее число в строке - это PID в выводе netstat
          const match = pid.match(/(\d+)$/)
          if (match) {
            processId = match[1]
          }
        }

        // Убиваем процесс
        const killCommand =
          platform === 'win32'
            ? `taskkill /F /PID ${processId}`
            : `kill -9 ${processId}`

        exec(killCommand, killError => {
          completedKills++

          if (killError) {
            console.error(
              `❌ Не удалось завершить процесс ${processId} для порта ${port}: ${killError.message}`
            )
            console.error(
              `   Failed to kill process ${processId} for port ${port}: ${killError.message}`
            )
          } else {
            console.log(`✅ Процесс ${processId} для порта ${port} завершен`)
            console.log(`   Process ${processId} for port ${port} terminated`)
          }

          if (completedKills === pids.length) {
            resolve()
          }
        })
      })
    })
  })
}

// Последовательно обрабатываем все порты
async function processAllPorts() {
  for (const port of ports) {
    await killProcessesByPort(port)
  }
  console.log('✅ Все порты обработаны')
  console.log('   All ports processed')
}

processAllPorts()

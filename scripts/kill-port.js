const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

async function killPort(port) {
  try {
    const platform = process.platform
    let command

    if (platform === 'win32') {
      command = `netstat -ano | findstr :${port}`
    } else {
      command = `lsof -i :${port} -t`
    }

    const { stdout } = await execAsync(command)

    if (stdout) {
      const pids = stdout.split('\n').filter(Boolean)

      for (const pid of pids) {
        try {
          const killCommand =
            platform === 'win32' ? 'taskkill /F /PID' : 'kill -9'
          await execAsync(`${killCommand} ${pid.trim()}`)
          console.log(`🎯 Порт ${port} освобожден (PID: ${pid.trim()})`)
        } catch (err) {
          console.error(
            `❌ Ошибка при завершении процесса ${pid.trim()}:`,
            err.message
          )
        }
      }
    } else {
      console.log(`ℹ️ Порт ${port} уже свободен`)
    }
  } catch (error) {
    if (!error.message.includes('No such process')) {
      console.error(`❌ Ошибка при проверке порта ${port}:`, error.message)
    }
  }
}

async function main() {
  const ports = process.argv.slice(2)

  if (ports.length === 0) {
    console.error('❌ Укажите порты для освобождения')
    process.exit(1)
  }

  console.log('🚀 Начинаю освобождение портов...')

  for (const port of ports) {
    await killPort(port)
  }

  console.log('✅ Все порты проверены')
}

main().catch(error => {
  console.error('❌ Критическая ошибка:', error)
  process.exit(1)
})

import fs from 'fs'
import os from 'os'
import path from 'path'
import { logger } from '@/utils/logger'

const LOCK_FILE_PATH = path.join(process.cwd(), '.bot.lock')

// Проверяет и создает файл блокировки
export function checkAndCreateLockFile(): boolean {
  try {
    // Проверяем наличие режима принудительного запуска
    const forceStart = process.env.FORCE_START === 'true'
    
    if (forceStart) {
      logger.warn('⚠️ Активирован режим принудительного запуска (FORCE_START=true)', {
        description: 'Bot forced to start regardless of lock file',
        warning: 'This may cause conflicts if another bot instance is running'
      })
    }
    
    // Если файл блокировки существует
    if (fs.existsSync(LOCK_FILE_PATH)) {
      try {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'))
        
        // Проверяем, запущен ли процесс
        const isProcessRunning = isProcessActive(lockData.pid)
        
        if (isProcessRunning && !forceStart) {
          const lockTime = new Date(lockData.start_time).toLocaleString()
          logger.error('❌ Ошибка: Другой экземпляр бота уже запущен', {
            description: 'Bot instance already running',
            pid: lockData.pid,
            start_time: lockData.start_time,
            locked_since: lockTime,
            computer: lockData.computerName || 'Unknown',
            username: lockData.username || 'Unknown'
          })
          return false
        } else if (isProcessRunning && forceStart) {
          // В режиме принудительного запуска удаляем существующий файл блокировки
          logger.warn('⚠️ Удаление существующего файла блокировки в режиме принудительного запуска', {
            description: 'Removing existing lock file in force start mode',
            existing_pid: lockData.pid,
            existing_computer: lockData.computerName || 'Unknown'
          })
          fs.unlinkSync(LOCK_FILE_PATH)
        } else {
          // Процесс не активен, удаляем устаревший файл блокировки
          logger.info('ℹ️ Обнаружен устаревший файл блокировки, удаляем', {
            description: 'Stale lock file detected, removing',
            old_pid: lockData.pid
          })
          fs.unlinkSync(LOCK_FILE_PATH)
        }
      } catch (error) {
        // Если не удалось прочитать файл блокировки, удаляем его
        logger.warn('⚠️ Ошибка чтения файла блокировки, удаляем файл', {
          description: 'Error reading lock file, removing it',
          error: error instanceof Error ? error.message : String(error)
        })
        try {
          fs.unlinkSync(LOCK_FILE_PATH)
        } catch (error) {
          logger.error('❌ Не удалось удалить файл блокировки', {
            description: 'Failed to remove lock file',
            error: error instanceof Error ? error.message : String(error)
          })
          return false
        }
      }
    }

    // Создаем новый файл блокировки
    const lockData = {
      pid: process.pid,
      start_time: new Date().toISOString(),
      computerName: os.hostname(),
      username: os.userInfo().username,
      force_started: forceStart
    }
    
    fs.writeFileSync(LOCK_FILE_PATH, JSON.stringify(lockData, null, 2))
    logger.info('✅ Создан файл блокировки', {
      description: 'Lock file created',
      pid: process.pid,
      computerName: os.hostname(),
      force_started: forceStart
    })
    
    // Устанавливаем обработчик для удаления файла блокировки при завершении приложения
    process.on('exit', () => removeLockFile())
    process.on('SIGINT', () => {
      removeLockFile()
      process.exit(0)
    })
    process.on('SIGTERM', () => {
      removeLockFile()
      process.exit(0)
    })
    
    return true
  } catch (error) {
    logger.error('❌ Ошибка создания файла блокировки', {
      description: 'Error creating lock file',
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

// Проверяет, активен ли процесс
function isProcessActive(pid: number): boolean {
  try {
    // Разные способы проверки для разных ОС
    if (process.platform === 'win32') {
      // Windows
      const { execSync } = require('child_process')
      const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' })
      return output.includes(pid.toString())
    } else {
      // UNIX-like системы (Linux, macOS)
      return fs.existsSync(`/proc/${pid}`)
    }
  } catch (error) {
    // При ошибке считаем, что процесс не активен
    return false
  }
}

// Удаляет файл блокировки
function removeLockFile(): void {
  try {
    if (fs.existsSync(LOCK_FILE_PATH)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, 'utf8'))
      
      // Удаляем файл только если это наш процесс
      if (lockData.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE_PATH)
        logger.info('✅ Файл блокировки удален', {
          description: 'Lock file removed',
          pid: process.pid
        })
      }
    }
  } catch (error) {
    logger.error('❌ Ошибка при удалении файла блокировки', {
      description: 'Error removing lock file',
      error: error instanceof Error ? error.message : String(error)
    })
  }
} 
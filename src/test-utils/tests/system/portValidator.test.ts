import { logger } from '@/utils/logger'
import { PORT_CONFIGS } from '@/config/ports'
import * as net from 'net'

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer()

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true)
      }
    })

    server.once('listening', () => {
      server.close()
      resolve(false)
    })

    server.listen(port)
  })
}

async function getProcessUsingPort(port: number): Promise<string> {
  return new Promise(resolve => {
    const { exec } = require('child_process')
    exec(`lsof -i :${port} | grep LISTEN`, (error: any, stdout: string) => {
      if (error) {
        resolve('Unknown')
        return
      }
      const process = stdout.trim().split(/\s+/)[0]
      resolve(process || 'Unknown')
    })
  })
}

export async function validatePorts(): Promise<boolean> {
  let allPortsValid = true
  logger.info('🔍 Starting port validation...')

  for (const config of PORT_CONFIGS) {
    const isUsed = await isPortInUse(config.port)

    if (isUsed) {
      const process = await getProcessUsingPort(config.port)
      logger.error(
        `❌ Port ${config.port} (${config.serviceName}) is already in use by process: ${process}`
      )
      allPortsValid = false
    } else {
      logger.info(`✅ Port ${config.port} (${config.serviceName}) is available`)
    }
  }

  if (!allPortsValid) {
    logger.warn(
      '⚠️ Some ports are already in use. This might cause issues with the application.'
    )
    logger.info(
      '💡 Try running: lsof -i :<port> | grep LISTEN to identify the process'
    )
    logger.info('💡 Then: kill <PID> to stop the process')
  } else {
    logger.info('✅ All ports are available!')
  }

  return allPortsValid
}

export async function runPortValidationTests(): Promise<{ success: boolean }> {
  try {
    const allPortsValid = await validatePorts()
    return { success: allPortsValid }
  } catch (error) {
    logger.error('Error during port validation:', error)
    return { success: false }
  }
}

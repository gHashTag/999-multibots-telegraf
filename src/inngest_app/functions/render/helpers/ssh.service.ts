/**
 * SSH Service for Remote Render Server Operations
 * Ported from Python: asyncssh connections in render.py
 *
 * Handles SSH operations including:
 * - Remote command execution
 * - File transfers
 * - Process streaming
 */

import { Client, ConnectConfig } from 'ssh2'
import { Logger } from 'inngest'
import { promisify } from 'util'
import * as fs from 'fs'

export interface SSHConnectionConfig {
  host: string
  port: number
  username: string
  privateKey?: string
  timeout?: number
}

export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class SSHService {
  private client: Client | null = null
  public config: SSHConnectionConfig
  private logger?: Logger

  constructor(config: SSHConnectionConfig, logger?: Logger) {
    this.config = config
    this.logger = logger
  }

  /**
   * Connect to remote server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client = new Client()

      const sshConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        privateKey: this.config.privateKey,
        readyTimeout: this.config.timeout || 15000,
      }

      this.client
        .on('ready', () => {
          if (this.logger) {
            this.logger.info('SSH connection established', {
              host: this.config.host,
              port: this.config.port,
            })
          }
          resolve()
        })
        .on('error', err => {
          if (this.logger) {
            this.logger.error('SSH connection error', { error: err.message })
          }
          reject(err)
        })
        .connect(sshConfig)
    })
  }

  /**
   * Execute a command on remote server
   */
  async exec(command: string, timeout: number = 10000): Promise<CommandResult> {
    if (!this.client) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('SSH client not connected'))
        return
      }

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`))
      }, timeout)

      this.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId)
          reject(err)
          return
        }

        stream
          .on('close', (code: number) => {
            if (!timedOut) {
              clearTimeout(timeoutId)
              if (this.logger) {
                this.logger.info('Command executed', {
                  command: command.substring(0, 100),
                  exitCode: code,
                })
              }
              resolve({ stdout, stderr, exitCode: code })
            }
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString()
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })
      })
    })
  }

  /**
   * Execute command and stream output line by line
   * Used for monitoring progress of long-running commands
   */
  async execStream(
    command: string,
    onLine: (line: string) => void | Promise<void>,
    timeout: number = 600000 // 10 minutes default for render
  ): Promise<CommandResult> {
    if (!this.client) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('SSH client not connected'))
        return
      }

      let stdout = ''
      let stderr = ''
      let buffer = ''
      let timedOut = false

      const timeoutId = setTimeout(() => {
        timedOut = true
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`))
      }, timeout)

      this.client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutId)
          reject(err)
          return
        }

        stream
          .on('close', (code: number) => {
            if (!timedOut) {
              clearTimeout(timeoutId)
              // Process any remaining buffer
              if (buffer.trim()) {
                onLine(buffer)
              }
              resolve({ stdout, stderr, exitCode: code })
            }
          })
          .on('data', (data: Buffer) => {
            const text = data.toString()
            stdout += text
            buffer += text

            // Process complete lines
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.trim()) {
                onLine(line)
              }
            }
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString()
          })
      })
    })
  }

  /**
   * Write content to a file on remote server via SFTP
   */
  async writeFile(remotePath: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error('SSH client not connected')
    }

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('SSH client not connected'))
        return
      }

      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }

        const stream = sftp.createWriteStream(remotePath)

        stream.on('close', () => {
          if (this.logger) {
            this.logger.info('File written via SFTP', {
              path: remotePath,
              size: content.length,
            })
          }
          resolve()
        })

        stream.on('error', error => {
          reject(error)
        })

        stream.write(content)
        stream.end()
      })
    })
  }

  /**
   * Download a file using curl on remote server
   */
  async downloadFileViaCurl(
    url: string,
    remotePath: string,
    timeout: number = 600000
  ): Promise<void> {
    const command = `curl -o "${remotePath}" "${url}"`

    if (this.logger) {
      this.logger.info('Downloading file via curl', { url, remotePath })
    }

    const result = await this.exec(command, timeout)

    if (result.exitCode !== 0) {
      throw new Error(`Curl download failed: ${result.stderr}`)
    }

    if (this.logger) {
      this.logger.info('File downloaded successfully', { url, remotePath })
    }
  }

  /**
   * Upload file to S3 using curl on remote server
   */
  async uploadToS3ViaCurl(
    localPath: string,
    presignedUrl: string,
    contentType: string,
    proxyConfig?: { proxy?: string; auth?: string }
  ): Promise<void> {
    let proxyFlags = ''
    if (proxyConfig?.proxy) {
      proxyFlags += `-x ${proxyConfig.proxy} `
    }
    if (proxyConfig?.auth) {
      proxyFlags += `-U ${proxyConfig.auth} `
    }

    const command = `curl ${proxyFlags}"${presignedUrl}" -H "Content-Type: ${contentType}" --upload-file "${localPath}" --progress-bar`

    if (this.logger) {
      this.logger.info('Uploading file to S3 via curl', { localPath })
    }

    // Stream output to monitor progress
    await this.execStream(
      command,
      line => {
        // Parse progress from curl output
        const progressMatch = line.match(/(\d+\.\d+)%/)
        if (progressMatch && this.logger) {
          const progress = parseFloat(progressMatch[1])
          if (progress % 10 === 0 || progress >= 99) {
            // Log every 10% or at completion
            this.logger.info('Upload progress', { progress: `${progress}%` })
          }
        }
      },
      600000 // 10 minutes timeout for upload
    )

    if (this.logger) {
      this.logger.info('File uploaded to S3 successfully', { localPath })
    }
  }

  /**
   * Close SSH connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.end()
      this.client = null
      if (this.logger) {
        this.logger.info('SSH connection closed')
      }
    }
  }

  /**
   * Create SSH service from environment variables
   */
  static fromEnv(logger?: Logger): SSHService {
    const sshKeyString = process.env.SSH_KEY_STRING
    if (!sshKeyString) {
      throw new Error('SSH_KEY_STRING not configured')
    }

    // Decode base64 SSH key
    const privateKey =
      '-----BEGIN OPENSSH PRIVATE KEY-----\n' +
      sshKeyString +
      '\n-----END OPENSSH PRIVATE KEY-----'

    const config: SSHConnectionConfig = {
      host: '', // Will be provided per job
      port: 22,
      username: 'Administrator',
      privateKey,
      timeout: 15000,
    }

    return new SSHService(config, logger)
  }
}

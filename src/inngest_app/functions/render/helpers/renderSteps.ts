/**
 * Core Render Step Implementations
 * Ported from Python: src/services/inngest_services/render.py
 */

import { Logger } from 'inngest'
import { NonRetriableError } from 'inngest'
import { SSHService } from './ssh.service'
import { S3Service } from './s3.service'
import { RenderConfig } from './config'
import type { RenderEventData } from '@/inngest_app/functions/render/types'
import axios from 'axios'

/**
 * Build job.json structure for nexrender
 * Python equivalent: _build_job_json()
 */
async function buildJobJson(
  compositionName: string,
  jobJsonUrl: string,
  jobDir: string,
  templatePath: string,
  scriptPath: string,
  outputPath: string,
  logger: Logger
): Promise<any> {
  // Fetch job parameters from URL
  logger.info('Fetching job parameters', { jobJsonUrl })
  const response = await axios.get(jobJsonUrl, { timeout: 30000 })
  const jobParameters = response.data

  if (!Array.isArray(jobParameters)) {
    throw new NonRetriableError(
      'job_json_url must return an array of parameters'
    )
  }

  // Build nexrender job structure
  const structure = {
    template: {
      src: `file://${templatePath}`,
      composition: compositionName,
    },
    assets: [
      {
        src: `file://${scriptPath}`,
        type: 'script',
        parameters: [
          {
            key: 'jobFolder',
            value: jobDir,
          },
          ...jobParameters,
        ],
      },
    ],
    actions: {
      postrender: [
        {
          module: '@nexrender/action-copy',
          output: outputPath,
        },
      ],
    },
  }

  logger.info('Built job.json structure', {
    composition: compositionName,
    parametersCount: jobParameters.length,
  })

  return structure
}

/**
 * Step 1: Create job folder and assets directory on remote server
 * Python equivalent: create_job_folder_step()
 */
export async function createJobFolder(
  eventData: RenderEventData,
  logger: Logger
): Promise<void> {
  const { job_id, server_url, server_port, server_user } = eventData

  logger.info(`Creating job folder for job ${job_id}`)

  const ssh = SSHService.fromEnv(logger)
  ssh.config.host = server_url
  ssh.config.port = server_port
  ssh.config.username = server_user

  try {
    await ssh.connect()

    // Create job directory
    const jobDir = RenderConfig.getJobDir(job_id)
    await ssh.exec(`mkdir "${jobDir}"`, 10000)
    logger.info(`Created job folder: ${jobDir}`)

    // Create assets directory
    const assetsDir = RenderConfig.getAssetsDir(job_id)
    await ssh.exec(`mkdir "${assetsDir}"`, 10000)
    logger.info(`Created assets folder: ${assetsDir}`)
  } finally {
    await ssh.disconnect()
  }
}

/**
 * Step 2: Download all required files to remote server
 * Python equivalent: download_files_step()
 */
export async function downloadFiles(
  eventData: RenderEventData,
  logger: Logger
): Promise<void> {
  const {
    job_id,
    template_url,
    job_json_url,
    composition_name,
    render_type,
    server_url,
    server_port,
    server_user,
  } = eventData

  logger.info(`Downloading files for job ${job_id}`)

  // Get paths
  const jobDir = RenderConfig.getJobDir(job_id)
  const templatePath = RenderConfig.getTemplatePath(job_id)
  const jobJsonPath = RenderConfig.getJobFile(job_id)
  const outputPath = RenderConfig.getOutputFile(job_id)
  const scriptPath = RenderConfig.getScriptPath(render_type)

  const ssh = SSHService.fromEnv(logger)
  ssh.config.host = server_url
  ssh.config.port = server_port
  ssh.config.username = server_user

  try {
    await ssh.connect()

    // Download template file
    logger.info('Downloading template file', { template_url })
    await ssh.downloadFileViaCurl(template_url, templatePath)

    // Build job.json
    logger.info('Building job.json structure')
    const jobJson = await buildJobJson(
      composition_name,
      job_json_url,
      jobDir,
      templatePath,
      scriptPath,
      outputPath,
      logger
    )

    // Write job.json to remote server
    logger.info('Writing job.json to remote server', { jobJsonPath })
    await ssh.writeFile(jobJsonPath, JSON.stringify(jobJson, null, 2))

    logger.info('All files downloaded successfully')
  } finally {
    await ssh.disconnect()
  }
}

/**
 * Step 3: Execute render process on remote server
 * Python equivalent: render_step()
 */
export async function renderFunction(
  eventData: RenderEventData,
  logger: Logger
): Promise<void> {
  const { job_id, server_url, server_port, server_user } = eventData

  logger.info(`Starting render for job ${job_id}`)

  const jobPath = RenderConfig.getJobFile(job_id)
  const command = `nexrender-cli --file ${jobPath}`

  const ssh = SSHService.fromEnv(logger)
  ssh.config.host = server_url
  ssh.config.port = server_port
  ssh.config.username = server_user

  try {
    await ssh.connect()

    let renderCompleted = false
    let lastProgress = 0

    // Execute render with streaming output
    const result = await ssh.execStream(
      command,
      line => {
        // Check for completion message
        if (line.includes('job rendering successfully finished')) {
          renderCompleted = true
          logger.info('Render completed successfully')
        }

        // Parse and log progress
        const progressMatch = line.match(/(\d+\.\d+)%/)
        if (progressMatch) {
          const progress = parseFloat(progressMatch[1])

          // Log every 10% or when reaching 100%
          if (
            progress >= 100.0 ||
            Math.floor(progress / 10) > Math.floor(lastProgress / 10)
          ) {
            logger.info(`Render progress: ${progress.toFixed(1)}%`)
            lastProgress = progress
          }

          if (progress >= 100.0) {
            renderCompleted = true
          }
        }
      },
      600000 // 10 minutes timeout
    )

    if (result.exitCode !== 0) {
      throw new NonRetriableError(
        `Render failed with exit code ${result.exitCode}: ${result.stderr}`
      )
    }

    if (!renderCompleted) {
      throw new NonRetriableError(
        'Render process did not complete successfully'
      )
    }

    logger.info(`Render completed for job ${job_id}`)
  } finally {
    await ssh.disconnect()
  }
}

/**
 * Step 4: Upload rendered video to S3
 * Python equivalent: upload_to_s3_step()
 */
export async function uploadToS3(
  eventData: RenderEventData,
  logger: Logger
): Promise<{ objectKey: string; downloadUrl: string }> {
  const { job_id, server_url, server_port, server_user } = eventData

  logger.info(`Uploading result for job ${job_id}`)

  const resultFilePath = RenderConfig.getOutputFile(job_id)
  const objectKey = RenderConfig.getOutputObjectKey(job_id)

  // Initialize S3 service
  const s3Service = new S3Service()

  // Generate presigned upload URL
  logger.info('Generating presigned upload URL')
  const presignedUpload = await s3Service.generatePresignedUploadUrl(
    objectKey,
    'video/mp4',
    604800, // 7 days
    logger
  )

  const ssh = SSHService.fromEnv(logger)
  ssh.config.host = server_url
  ssh.config.port = server_port
  ssh.config.username = server_user

  try {
    await ssh.connect()

    // Check if result file exists
    logger.info('Checking if result file exists', { resultFilePath })
    const checkCommand = `IF EXIST "${resultFilePath}" (echo "EXISTS") ELSE (echo "NOT_FOUND")`
    const checkResult = await ssh.exec(checkCommand, 10000)

    if (checkResult.stdout.includes('NOT_FOUND')) {
      throw new NonRetriableError(`Result file not found: ${resultFilePath}`)
    }

    logger.info('Result file exists, starting upload')

    // Upload to S3 using curl
    const proxyConfig = RenderConfig.getProxyConfig()
    await ssh.uploadToS3ViaCurl(
      resultFilePath,
      presignedUpload.url,
      presignedUpload.content_type,
      proxyConfig
    )

    logger.info('Upload completed')
  } finally {
    await ssh.disconnect()
  }

  // Generate download URL
  const downloadUrl = await s3Service.generateGetUrl(objectKey, 604800, logger)

  // redact SigV4 query (X-Amz-Signature bearer capability) before logging
  logger.info('Generated download URL', {
    downloadUrl: downloadUrl.split('?')[0],
  })

  return {
    objectKey,
    downloadUrl,
  }
}

/**
 * Step 5: Send callback to client (optional)
 * Python equivalent: callback_step()
 */
export async function sendCallback(
  callbackUrl: string,
  downloadUrl: string,
  logger: Logger
): Promise<void> {
  logger.info('Sending callback', { callbackUrl })

  try {
    const response = await axios.post(
      callbackUrl,
      { download_url: downloadUrl },
      { timeout: 30000 }
    )

    logger.info('Callback sent successfully', { status: response.status })
  } catch (error: any) {
    logger.error('Callback failed', {
      error: error.message,
      callbackUrl,
    })
    // Don't throw - callback failure should not fail the job
  }
}

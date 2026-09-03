/**
 * S3 Service for Render Functions
 * Ported from Python: src/services/s3_service.py
 *
 * Handles S3 operations including:
 * - File uploads/downloads
 * - Presigned URL generation
 * - Content type detection
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Logger } from 'inngest'

export interface PresignedUploadUrl {
  url: string
  object_key: string
  content_type: string
}

export class S3Service {
  private s3Client: S3Client
  private bucketName: string
  private publicServer?: string
  private isBucketPublic: boolean

  constructor() {
    const region = process.env.AWS_REGION || 'ru-7'
    const endpoint =
      process.env.AWS_S3_SERVER || 'https://s3.storage.selcloud.ru'
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not configured')
    }

    this.bucketName = process.env.AWS_S3_FRONTEND_BUCKET || ''
    this.publicServer = process.env.AWS_S3_PUBLIC_SERVER
    this.isBucketPublic = process.env.AWS_S3_IS_BUCKET_PUBLIC === 'true'

    this.s3Client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: process.env.AWS_USE_VIRTUAL_HOST !== 'true',
    })
  }

  /**
   * Prepare filename and determine content type
   */
  prepareFilename(filename: string): {
    sanitizedFilename: string
    contentType: string
  } {
    // Sanitize and lowercase filename
    const sanitizedFilename = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')

    // Determine content type from extension
    const extension = sanitizedFilename.split('.').pop() || ''
    const contentType = this.getContentType(extension)

    return { sanitizedFilename, contentType }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(extension: string): string {
    const contentTypeMap: Record<string, string> = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      // Audio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      // Video
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      wmv: 'video/x-ms-wmv',
      flv: 'video/x-flv',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      // Scripts
      js: 'application/javascript',
      jsx: 'application/javascript',
      // Adobe After Effects
      aep: 'application/octet-stream',
      aepx: 'application/octet-stream',
    }

    return contentTypeMap[extension] || 'application/octet-stream'
  }

  /**
   * Generate presigned URL for uploading files to S3
   */
  async generatePresignedUploadUrl(
    objectKey: string,
    contentType: string,
    expiresIn: number = 604800, // 7 days default
    logger?: Logger
  ): Promise<PresignedUploadUrl> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: contentType,
    })

    const url = await getSignedUrl(this.s3Client, command, { expiresIn })

    if (logger) {
      logger.info('Generated presigned upload URL', {
        // Redact the SigV4 query (X-Amz-Signature = a 7-day bearer capability,
        // X-Amz-Credential = the access key id) before logging.
        url: url.split('?')[0],
        objectKey,
        contentType,
        bucket: this.bucketName,
      })
    }

    return {
      url,
      object_key: objectKey,
      content_type: contentType,
    }
  }

  /**
   * Generate presigned URL for downloading files from S3
   * If bucket is public, returns public URL instead
   */
  async generateGetUrl(
    objectKey: string,
    expiresIn: number = 604800, // 7 days default
    logger?: Logger
  ): Promise<string> {
    // If bucket is public, return public URL
    if (this.isBucketPublic && this.publicServer) {
      const publicUrl = `${this.publicServer}/${objectKey}`
      if (logger) {
        logger.info('Generated public S3 URL', { objectKey, publicUrl })
      }
      return publicUrl
    }

    // Otherwise generate presigned URL
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
    })

    const url = await getSignedUrl(this.s3Client, command, { expiresIn })

    if (logger) {
      logger.info('Generated presigned download URL', {
        objectKey,
        url: url.split('?')[0], // redact SigV4 query (bearer capability)
      })
    }

    return url
  }

  /**
   * Check if object exists in S3
   */
  async checkObjectExists(
    objectKey: string,
    logger?: Logger
  ): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: objectKey,
        })
      )
      if (logger) {
        logger.info('Object exists in S3', { objectKey })
      }
      return true
    } catch (error: any) {
      if (
        error.name === 'NotFound' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        if (logger) {
          logger.info('Object not found in S3', { objectKey })
        }
        return false
      }
      throw error
    }
  }

  /**
   * Upload file directly to S3
   */
  async uploadFile(
    objectKey: string,
    contentType: string,
    fileContent: Buffer,
    logger?: Logger
  ): Promise<void> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: fileContent,
        ContentType: contentType,
      })
    )

    if (logger) {
      logger.info('File uploaded to S3', {
        objectKey,
        size: fileContent.length,
        contentType,
      })
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(objectKey: string, logger?: Logger): Promise<Buffer> {
    if (logger) {
      logger.info('Downloading file from S3', { objectKey })
    }

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      })
    )

    if (!response.Body) {
      throw new Error(`No body in S3 response for ${objectKey}`)
    }

    const chunks: Uint8Array[] = []
    for await (const chunk of response.Body as any) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    if (logger) {
      logger.info('File downloaded from S3', {
        objectKey,
        size: buffer.length,
      })
    }

    return buffer
  }
}

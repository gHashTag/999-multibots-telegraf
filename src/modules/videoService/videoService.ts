import type { VideoServiceDependencies } from './types'

export class VideoService {
  private readonly logger: VideoServiceDependencies['logger']
  private readonly downloadFile: VideoServiceDependencies['downloadFile']
  private readonly fs: VideoServiceDependencies['fs']
  private readonly path: VideoServiceDependencies['path']
  private readonly uploadsDir: VideoServiceDependencies['uploadsDir']

  constructor(dependencies: VideoServiceDependencies) {
    this.logger = dependencies.logger
    this.downloadFile = dependencies.downloadFile
    this.fs = dependencies.fs
    this.path = dependencies.path
    this.uploadsDir = dependencies.uploadsDir
  }

  /**
   * Скачивает видео по URL и сохраняет его локально.
   * @param videoUrl URL видео для скачивания.
   * @param telegramId ID пользователя Telegram (для организации папок).
   * @param fileName Имя файла для сохранения.
   * @returns Локальный путь к сохраненному файлу.
   */
  public async processVideo(
    videoUrl: string,
    telegramId: number | string, // Принимаем и строку
    fileName: string
  ): Promise<string> {
    this.logger.info(`Начало обработки видео: ${videoUrl}`, {
      telegramId,
      fileName,
    })
    try {
      const videoLocalPath = this.path.join(
        this.uploadsDir, // Используем корневую директорию из зависимостей
        String(telegramId), // Преобразуем в строку на всякий случай
        'videos', // Поддиректория для видео
        fileName
      )
      this.logger.info(`Локальный путь для сохранения: ${videoLocalPath}`)

      const dirPath = this.path.dirname(videoLocalPath)
      this.logger.info(`Создание директории: ${dirPath}`)
      await this.fs.mkdir(dirPath, { recursive: true })
      this.logger.info(`Директория создана: ${dirPath}`)

      this.logger.info(`Скачивание файла: ${videoUrl}`)
      const videoBuffer = await this.downloadFile(videoUrl)
      this.logger.info(`Файл скачан, размер: ${videoBuffer.length} байт`)

      this.logger.info(`Запись файла: ${videoLocalPath}`)
      await this.fs.writeFile(videoLocalPath, videoBuffer)
      this.logger.info(`Файл записан: ${videoLocalPath}`)

      return videoLocalPath
    } catch (error) {
      this.logger.error('Ошибка при обработке видео:', {
        videoUrl,
        telegramId,
        fileName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Перебрасываем ошибку дальше, чтобы вызывающий код мог ее обработать
      throw error
    }
  }
}

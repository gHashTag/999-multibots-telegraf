import { Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { Logger as logger } from '@/utils/logger'
import { UPLOAD_DIR } from '@/config'
import { API_URL } from '@/config'
import { Readable } from 'stream'

// Типы для multer
interface MulterFile {
  fieldname: string
  originalname: string
  encoding: string
  mimetype: string
  size: number
  destination: string
  filename: string
  path: string
  buffer: Buffer
  stream: Readable
  lastModifiedDate?: Date
  hash?: string
}

// Расширяем тип Request для поддержки файлов от multer
interface MulterRequest extends Request {
  file?: MulterFile | undefined
}

// Убедимся, что директория для загрузок существует
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  logger.info({
    message: '📁 Создана директория для загрузок',
    dir: UPLOAD_DIR,
  })
}

// Настраиваем хранилище для multer
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, UPLOAD_DIR)
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = uuidv4()
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 МБ максимальный размер файла
  },
  fileFilter: (_req, file, cb) => {
    // Принимаем только zip файлы
    if (
      file.mimetype === 'application/zip' ||
      file.originalname.toLowerCase().endsWith('.zip')
    ) {
      cb(null, true)
    } else {
      cb(new Error('Только ZIP файлы разрешены для загрузки'))
    }
  },
}).single('zipUrl')

export const uploadZipFile = async (req: Request, res: Response) => {
  try {
    logger.info({
      message: '🔄 Получен запрос на загрузку zip файла',
      ip: req.ip,
    })

    // Проверяем секретный ключ
    const secretKey = req.headers['x-secret-key']
    if (secretKey !== process.env.SECRET_API_KEY) {
      logger.warn({
        message: '🚫 Неверный секретный ключ',
        ip: req.ip,
      })
      return res.status(401).json({ error: 'Неверный секретный ключ' })
    }

    upload(req, res, function (err) {
      if (err) {
        logger.error({
          message: '❌ Ошибка загрузки файла',
          error: err.message,
        })
        return res.status(400).json({ error: err.message })
      }

      const multerReq = req as MulterRequest

      if (!multerReq.file) {
        logger.error({
          message: '❌ Файл не предоставлен',
          ip: req.ip,
        })
        return res.status(400).json({ error: 'Файл не предоставлен' })
      }

      // Создаем URL для доступа к файлу
      const fileUrl = `${API_URL}/uploads/${multerReq.file.filename}`

      logger.info({
        message: '✅ Файл успешно загружен',
        filename: multerReq.file.filename,
        size: multerReq.file.size,
        url: fileUrl,
      })

      return res.status(200).json({
        message: 'Файл успешно загружен',
        zipUrl: fileUrl,
      })
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в контроллере загрузки файла',
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' })
  }
}

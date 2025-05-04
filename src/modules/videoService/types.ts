// src/modules/videoService/types.ts
import type { PathLike } from 'fs'
import type { MakeDirectoryOptions, ObjectEncodingOptions, OpenMode } from 'fs'
import type { FileHandle } from 'fs/promises'
import type { Abortable } from 'node:events'

// --- Interfaces for Dependencies ---

/**
 * Упрощенный интерфейс логгера для модуля.
 */
export interface MinimalLogger {
  info: (message: string, ...meta: any[]) => void
  error: (message: string, ...meta: any[]) => void
  warn: (message: string, ...meta: any[]) => void
}

/**
 * Функция для скачивания файла по URL.
 */
export type DownloadFileFunction = (url: string) => Promise<Buffer>

/**
 * Интерфейс для операций с файловой системой.
 */
export interface FileSystemOps {
  mkdir: (
    path: PathLike,
    options?: MakeDirectoryOptions | null | number
  ) => Promise<string | undefined>
  writeFile: (
    file: PathLike | FileHandle,
    data: string | NodeJS.ArrayBufferView,
    options?:
      | (ObjectEncodingOptions & {
          mode?: OpenMode
          flag?: string
          signal?: AbortSignal
        })
      | BufferEncoding
      | null
  ) => Promise<void>
}

/**
 * Интерфейс для работы с путями.
 */
export interface PathOps {
  join: (...paths: string[]) => string
  dirname: (p: string) => string
}

// --- Dependency Injection Container --- //

/**
 * Зависимости, необходимые для модуля VideoService.
 */
export interface VideoServiceDependencies {
  logger: MinimalLogger
  downloadFile: DownloadFileFunction
  fs: FileSystemOps
  path: PathOps
  /** Корневая директория для сохранения загруженных файлов. */
  uploadsDir: string
}

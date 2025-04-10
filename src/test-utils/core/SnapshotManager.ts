import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logger } from '@/utils/logger'

/**
 * Результат сравнения снэпшота
 */
export interface SnapshotResult {
  /** Успешность сравнения */
  success: boolean
  /** Сообщение о результате */
  message: string
  /** Путь к файлу снэпшота */
  snapshotPath: string
  /** Предыдущее сохраненное значение */
  previousValue?: any
  /** Новое значение */
  newValue?: any
  /** Разница между значениями */
  diff?: any
}

/**
 * Опции менеджера снэпшотов
 */
export interface SnapshotManagerOptions {
  /** Директория для хранения снэпшотов */
  snapshotDir?: string
  /** Автоматически обновлять снэпшоты при изменении */
  autoUpdate?: boolean
  /** Включить подробное логирование */
  verbose?: boolean
}

/**
 * Менеджер снэпшотов для тестирования
 * 
 * Позволяет сохранять и сравнивать результаты тестов с эталонными значениями
 */
export class SnapshotManager {
  private snapshotDir: string
  private autoUpdate: boolean
  private verbose: boolean
  
  constructor(options: SnapshotManagerOptions = {}) {
    this.snapshotDir = options.snapshotDir || 'src/test-utils/snapshots'
    this.autoUpdate = options.autoUpdate || false
    this.verbose = options.verbose || false
    
    // Создаем директорию, если не существует
    if (!fs.existsSync(this.snapshotDir)) {
      if (this.verbose) {
        logger.info(`📁 Creating snapshot directory: ${this.snapshotDir}`)
      }
      fs.mkdirSync(this.snapshotDir, { recursive: true })
    }
  }
  
  /**
   * Сравнивает данные с сохраненным снэпшотом
   * Если снэпшот не существует, создает новый
   */
  async matchSnapshot(name: string, category: string, data: any): Promise<SnapshotResult> {
    const snapshotPath = this.getSnapshotPath(name, category)
    
    if (this.verbose) {
      logger.info(`🔄 Matching snapshot for ${category}/${name}`)
    }
    
    // Преобразуем данные в строку
    const stringData = this.serializeData(data)
    
    // Если снэпшот существует, сравниваем с ним
    if (fs.existsSync(snapshotPath)) {
      try {
        const previousData = fs.readFileSync(snapshotPath, 'utf-8')
        
        if (stringData === previousData) {
          return {
            success: true,
            message: 'Snapshot matches',
            snapshotPath
          }
        } else {
          // Снэпшот не совпадает
          const diff = this.calculateDiff(previousData, stringData)
          
          // Обновляем снэпшот, если включено автообновление
          if (this.autoUpdate) {
            await this.updateSnapshot(name, category, data)
            return {
              success: true,
              message: 'Snapshot automatically updated',
              snapshotPath,
              previousValue: this.parseData(previousData),
              newValue: data,
              diff
            }
          }
          
          return {
            success: false,
            message: 'Snapshot does not match',
            snapshotPath,
            previousValue: this.parseData(previousData),
            newValue: data,
            diff
          }
        }
      } catch (error) {
        logger.error(`❌ Error reading snapshot: ${snapshotPath}`, {
          error: error instanceof Error ? error.message : String(error)
        })
        
        // Создаем новый снэпшот при ошибке чтения
        await this.updateSnapshot(name, category, data)
        
        return {
          success: false,
          message: `Error reading snapshot, new one created: ${error instanceof Error ? error.message : String(error)}`,
          snapshotPath
        }
      }
    } else {
      // Снэпшот не существует, создаем новый
      await this.updateSnapshot(name, category, data)
      
      return {
        success: true,
        message: 'New snapshot created',
        snapshotPath,
        newValue: data
      }
    }
  }
  
  /**
   * Обновляет снэпшот новыми данными
   */
  async updateSnapshot(name: string, category: string, data: any): Promise<string> {
    const snapshotPath = this.getSnapshotPath(name, category)
    
    // Создаем директорию категории, если не существует
    const categoryDir = path.dirname(snapshotPath)
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true })
    }
    
    // Сохраняем данные в файл
    const stringData = this.serializeData(data)
    fs.writeFileSync(snapshotPath, stringData)
    
    if (this.verbose) {
      logger.info(`💾 Snapshot updated: ${snapshotPath}`)
    }
    
    return snapshotPath
  }
  
  /**
   * Удаляет снэпшот
   */
  async deleteSnapshot(name: string, category: string): Promise<boolean> {
    const snapshotPath = this.getSnapshotPath(name, category)
    
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath)
      
      if (this.verbose) {
        logger.info(`🗑️ Snapshot deleted: ${snapshotPath}`)
      }
      
      return true
    }
    
    return false
  }
  
  /**
   * Получает путь к файлу снэпшота
   */
  private getSnapshotPath(name: string, category: string): string {
    const sanitizedName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const sanitizedCategory = category.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    
    // Создаем иерархическую структуру директорий для снэпшотов
    return path.join(this.snapshotDir, sanitizedCategory, `${sanitizedName}.snapshot`)
  }
  
  /**
   * Сериализует данные для сохранения
   */
  private serializeData(data: any): string {
    return JSON.stringify(data, null, 2)
  }
  
  /**
   * Десериализует данные из строки
   */
  private parseData(data: string): any {
    try {
      return JSON.parse(data)
    } catch {
      return data
    }
  }
  
  /**
   * Вычисляет разницу между двумя объектами
   */
  private calculateDiff(oldData: string, newData: string): any {
    try {
      const oldObj = this.parseData(oldData)
      const newObj = this.parseData(newData)
      
      // Простая реализация diff для объектов
      if (typeof oldObj === 'object' && typeof newObj === 'object') {
        const diff: Record<string, { old?: any; new?: any }> = {}
        
        // Добавляем ключи из старого объекта
        for (const key in oldObj) {
          if (!(key in newObj)) {
            diff[key] = { old: oldObj[key] }
          } else if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            diff[key] = { old: oldObj[key], new: newObj[key] }
          }
        }
        
        // Добавляем новые ключи из нового объекта
        for (const key in newObj) {
          if (!(key in oldObj)) {
            diff[key] = { new: newObj[key] }
          } else if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
            diff[key] = { old: oldObj[key], new: newObj[key] }
          }
        }
        
        return diff
      }
      
      // Для примитивных типов просто возвращаем старое и новое значение
      return { old: oldObj, new: newObj }
    } catch (error) {
      // В случае ошибки парсинга просто возвращаем строки
      return { old: oldData, new: newData }
    }
  }
} 
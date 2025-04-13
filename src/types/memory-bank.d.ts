declare module '@allpepper/memory-bank-mcp' {
  export interface MemoryBankMCPConfig {
    apiKey: string
    baseUrl?: string
    userId?: string
  }

  export class MemoryBankMCP {
    constructor(config: MemoryBankMCPConfig)

    // Базовые методы для работы с памятью
    storeMemory(data: any): Promise<any>
    retrieveMemory(queryOptions: any): Promise<any>
    updateMemory(memoryId: string, data: any): Promise<any>
    deleteMemory(memoryId: string): Promise<any>

    // Методы для работы с коллекциями
    createCollection(collectionName: string, options?: any): Promise<any>
    deleteCollection(collectionName: string): Promise<any>
    listCollections(): Promise<any>

    // Дополнительные утилиты
    vectorSearch(
      collectionName: string,
      query: string,
      options?: any
    ): Promise<any>
    semanticSearch(query: string, options?: any): Promise<any>
  }
}

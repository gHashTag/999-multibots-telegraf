declare module '@modelcontextprotocol/sdk' {
  export interface Client {
    initialize(): Promise<void>
    close(): Promise<void>
    call(prompt: string): Promise<{
      content: string
      role: string
    }>
  }
} 
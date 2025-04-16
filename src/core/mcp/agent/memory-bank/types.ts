// Типы для Memory Bank
export type MemoryBankProject = {
  name: string
  files: string[]
}

export type MemoryBankFile = {
  name: string
  content: string
  projectName: string
}

// Функции Memory Bank MCP
export declare function mcp_allpepper_memory_bank_memory_bank_write(params: {
  projectName: string
  fileName: string
  content: string
}): Promise<void>

export declare function mcp_allpepper_memory_bank_memory_bank_read(params: {
  projectName: string
  fileName: string
}): Promise<string>

export declare function mcp_allpepper_memory_bank_memory_bank_update(params: {
  projectName: string
  fileName: string
  content: string
}): Promise<void>

export declare function mcp_allpepper_memory_bank_list_projects(params: {
  random_string: string
}): Promise<string[]>

export declare function mcp_allpepper_memory_bank_list_project_files(params: {
  projectName: string
}): Promise<string[]>

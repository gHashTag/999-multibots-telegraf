/**
 * Специализированный агент для генерации и улучшения кода
 * Отвечает за создание нового и улучшение существующего кода
 */

import { NetworkAgent } from '../router.js'
import { AgentState, Task, TaskType } from '../state.js'
import { Service } from '../../types/index.js'
import fs from 'fs'
import path from 'path'
import { ImprovementResult } from '../self-improvement.js'

/**
 * Создает специализированного агента для генерации кода
 */
export function createCodeGeneratorAgent(mcpService: Service): NetworkAgent {
  return {
    id: 'code-generator',
    name: 'Code Generator',
    description: 'Специализированный агент для генерации и улучшения кода',
    capabilities: [
      'Генерация нового кода',
      'Улучшение существующего кода',
      'Рефакторинг кода',
      'Анализ кода и предложение улучшений',
    ],

    /**
     * Проверяет, может ли агент обработать задачу
     */
    async canHandle(task: Task): Promise<boolean> {
      // Агент может обрабатывать задачи генерации и рефакторинга кода
      return (
        task.type === TaskType.CODE_GENERATION ||
        task.type === TaskType.CODE_REFACTORING ||
        task.type === TaskType.SELF_IMPROVEMENT
      )
    },

    /**
     * Обрабатывает задачу
     */
    async handle(task: Task, _state: AgentState): Promise<any> {
      console.log(`Code Generator handling task: ${task.id} (${task.type})`)

      try {
        switch (task.type) {
          case TaskType.CODE_GENERATION:
            return await handleCodeGeneration(task, mcpService)

          case TaskType.CODE_REFACTORING:
            return await handleCodeRefactoring(task, mcpService)

          case TaskType.SELF_IMPROVEMENT:
            return await handleSelfImprovement(task, mcpService)

          default:
            throw new Error(`Unsupported task type: ${task.type}`)
        }
      } catch (error) {
        console.error(`Error handling task ${task.id}:`, error)
        throw error
      }
    },
  }
}

/**
 * Обрабатывает задачу генерации кода
 */
async function handleCodeGeneration(
  task: Task,
  mcpService: Service
): Promise<{ files: { path: string; content: string }[] }> {
  const { description, requirements, outputDir, language } = task.metadata

  const prompt = `
You are an expert code generator. Please generate code based on the following description and requirements:

DESCRIPTION:
${description}

REQUIREMENTS:
${Array.isArray(requirements) ? requirements.join('\n') : requirements}

LANGUAGE:
${language || 'TypeScript'}

Respond with code files in the following format:
FILE_PATH: [relative file path]
FILE_CONTENT:
\`\`\`
[file content here]
\`\`\`

Generate as many files as needed to fulfill the requirements.
`

  try {
    const response = await mcpService.processTask(prompt)
    const files = parseGeneratedFiles(response)

    // Сохраняем файлы, если указана директория
    if (outputDir) {
      saveGeneratedFiles(files, outputDir)
    }

    return { files }
  } catch (error) {
    console.error('Error generating code:', error)
    throw error
  }
}

/**
 * Обрабатывает задачу рефакторинга кода
 */
async function handleCodeRefactoring(
  task: Task,
  mcpService: Service
): Promise<{ files: { path: string; content: string }[] }> {
  const { filePaths, codeSnippets, refactoringType, goals } = task.metadata

  // Читаем содержимое файлов, если указаны пути
  const codeToRefactor: { path: string; content: string }[] = []

  if (filePaths && Array.isArray(filePaths)) {
    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        codeToRefactor.push({ path: filePath, content })
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error)
      }
    }
  }

  // Добавляем сниппеты кода, если они есть
  if (codeSnippets && Array.isArray(codeSnippets)) {
    for (const snippet of codeSnippets) {
      if (snippet.path && snippet.content) {
        codeToRefactor.push(snippet)
      }
    }
  }

  if (codeToRefactor.length === 0) {
    throw new Error('No code to refactor')
  }

  const codeContent = codeToRefactor
    .map(
      file => `
FILE_PATH: ${file.path}
FILE_CONTENT:
\`\`\`
${file.content}
\`\`\`
`
    )
    .join('\n\n')

  const prompt = `
You are an expert code refactorer. Please refactor the following code according to the requirements:

CODE TO REFACTOR:
${codeContent}

REFACTORING TYPE:
${refactoringType || 'General improvement'}

GOALS:
${Array.isArray(goals) ? goals.join('\n') : goals || 'Improve code quality, readability and maintainability'}

Respond with the refactored code files in the following format:
FILE_PATH: [original file path]
REFACTORED_CONTENT:
\`\`\`
[refactored file content here]
\`\`\`

Include ALL files in your response, even if you didn't change them.
`

  try {
    const response = await mcpService.processTask(prompt)
    const files = parseRefactoredFiles(response)

    return { files }
  } catch (error) {
    console.error('Error refactoring code:', error)
    throw error
  }
}

/**
 * Обрабатывает задачу самосовершенствования
 */
async function handleSelfImprovement(
  task: Task,
  mcpService: Service
): Promise<ImprovementResult> {
  const { description, targetComponent } = task.metadata

  // Если указан конкретный компонент, анализируем только его
  let codeContent = ''
  let componentFiles: string[] = []

  if (targetComponent) {
    // Получаем список файлов компонента для анализа
    componentFiles = await getComponentFiles(targetComponent)

    if (componentFiles.length === 0) {
      throw new Error(`No files found for component ${targetComponent}`)
    }

    // Читаем содержимое файлов
    for (const filePath of componentFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        codeContent += `
FILE_PATH: ${filePath}
FILE_CONTENT:
\`\`\`
${content}
\`\`\`
`
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error)
      }
    }
  }

  const prompt = `
You are an autonomous agent tasked with improving the codebase. Please analyze and implement the following improvement:

IMPROVEMENT REQUEST:
${description}

${targetComponent ? `TARGET COMPONENT: ${targetComponent}` : ''}

${codeContent ? `COMPONENT CODE:\n${codeContent}` : ''}

Please analyze the code and suggest specific improvements. For each improvement:
1. Explain what needs to be changed and why
2. Provide the exact code changes needed
3. Explain the benefits of the improvement

Respond in the following format:
ANALYSIS:
[Your analysis of the current code and what needs to be improved]

IMPROVEMENTS:
[List of specific improvements]

CHANGED_FILES:
FILE_PATH: [file path]
UPDATED_CONTENT:
\`\`\`
[entire file content after changes]
\`\`\`

[Repeat for each modified file]

NEW_FILES:
FILE_PATH: [file path]
CONTENT:
\`\`\`
[file content]
\`\`\`

[Repeat for each new file]
`

  try {
    const response = await mcpService.processTask(prompt)

    // Парсим результат и возвращаем структурированную информацию
    const improvementResult = parseImprovementResult(response)

    // Применяем изменения, если нужно
    if (task.metadata.applyChanges) {
      await applyImprovementChanges(improvementResult)
    }

    return improvementResult
  } catch (error) {
    console.error('Error implementing self-improvement:', error)
    throw error
  }
}

/**
 * Парсит сгенерированные файлы из ответа MCP
 */
function parseGeneratedFiles(
  response: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const fileRegex =
    /FILE_PATH:\s*([^\n]+)\s*FILE_CONTENT:\s*```(?:[\w]*)\s*([\s\S]*?)```/g

  let match
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1].trim()
    const content = match[2].trim()

    files.push({ path: filePath, content })
  }

  return files
}

/**
 * Парсит рефакторизованные файлы из ответа MCP
 */
function parseRefactoredFiles(
  response: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const fileRegex =
    /FILE_PATH:\s*([^\n]+)\s*REFACTORED_CONTENT:\s*```(?:[\w]*)\s*([\s\S]*?)```/g

  let match
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1].trim()
    const content = match[2].trim()

    files.push({ path: filePath, content })
  }

  return files
}

/**
 * Сохраняет сгенерированные файлы на диск
 */
function saveGeneratedFiles(
  files: { path: string; content: string }[],
  outputDir: string
): void {
  for (const file of files) {
    try {
      const fullPath = path.join(outputDir, file.path)
      const dirPath = path.dirname(fullPath)

      // Создаем директорию, если она не существует
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      // Записываем файл
      fs.writeFileSync(fullPath, file.content)
      console.log(`Created file: ${fullPath}`)
    } catch (error) {
      console.error(`Error saving file ${file.path}:`, error)
    }
  }
}

/**
 * Получает список файлов компонента по имени
 */
async function getComponentFiles(componentName: string): Promise<string[]> {
  const componentDirs = ['src/core', 'src/lib', 'src/components', 'src/utils']

  const files: string[] = []

  for (const dir of componentDirs) {
    if (!fs.existsSync(dir)) {
      continue
    }

    // Ищем файлы рекурсивно
    await findFiles(dir, new RegExp(`${componentName}\\.[jt]s`), files)
  }

  return files
}

/**
 * Рекурсивно ищет файлы по шаблону
 */
async function findFiles(
  dir: string,
  pattern: RegExp,
  result: string[]
): Promise<void> {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      await findFiles(fullPath, pattern, result)
    } else if (pattern.test(entry.name)) {
      result.push(fullPath)
    }
  }
}

/**
 * Парсит результат улучшения из ответа MCP
 */
function parseImprovementResult(response: string): ImprovementResult {
  const analysisMatch = /ANALYSIS:\s*([\s\S]*?)(?=IMPROVEMENTS:)/i.exec(
    response
  )
  const improvementsMatch =
    /IMPROVEMENTS:\s*([\s\S]*?)(?=CHANGED_FILES:|NEW_FILES:|$)/i.exec(response)

  // Парсим измененные файлы
  const changedFilesRegex = /CHANGED_FILES:([\s\S]*?)(?=NEW_FILES:|$)/i.exec(
    response
  )
  const updatedFiles: string[] = []

  if (changedFilesRegex) {
    const changedFilesContent = changedFilesRegex[1]
    const fileRegex =
      /FILE_PATH:\s*([^\n]+)\s*UPDATED_CONTENT:\s*```(?:[\w]*)\s*([\s\S]*?)```/g

    let match
    while ((match = fileRegex.exec(changedFilesContent)) !== null) {
      const filePath = match[1].trim()
      const content = match[2].trim()

      updatedFiles.push(filePath)

      // Сохраняем изменения во временный файл
      const tempPath = `${filePath}.new`
      fs.writeFileSync(tempPath, content)
    }
  }

  // Парсим новые файлы
  const newFilesRegex = /NEW_FILES:([\s\S]*?)$/i.exec(response)
  const createdFiles: string[] = []

  if (newFilesRegex) {
    const newFilesContent = newFilesRegex[1]
    const fileRegex =
      /FILE_PATH:\s*([^\n]+)\s*CONTENT:\s*```(?:[\w]*)\s*([\s\S]*?)```/g

    let match
    while ((match = fileRegex.exec(newFilesContent)) !== null) {
      const filePath = match[1].trim()
      const content = match[2].trim()

      createdFiles.push(filePath)

      // Сохраняем новый файл во временный файл
      const dirPath = path.dirname(filePath)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }

      fs.writeFileSync(filePath, content)
    }
  }

  return {
    success: true,
    message: analysisMatch ? analysisMatch[1].trim() : 'Improvement completed',
    createdFiles,
    updatedFiles,
    improvementType: 'CODE_QUALITY',
    recommendations: improvementsMatch
      ? improvementsMatch[1]
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
      : [],
  }
}

/**
 * Применяет изменения к файлам
 */
async function applyImprovementChanges(
  result: ImprovementResult
): Promise<void> {
  // Применяем изменения к обновленным файлам
  for (const filePath of result.updatedFiles) {
    const tempPath = `${filePath}.new`

    if (fs.existsSync(tempPath)) {
      // Копируем новое содержимое
      fs.renameSync(tempPath, filePath)
      console.log(`Updated file: ${filePath}`)
    }
  }
}

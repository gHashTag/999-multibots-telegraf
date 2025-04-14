/**
 * Специализированный агент для генерации и улучшения кода (Адаптирован под @inngest/agent-kit)
 */

import { z } from 'zod'
import {
  createAgent,
  createTool,
  type Agent,
} from '@inngest/agent-kit'
// import { NetworkAgent } from '../router.js' // Removed old type
import { AgentState, Task, TaskType } from '../state.js' // Keep Task for potential use in helpers?
import { Service } from '../../types/index.js'
import fs from 'fs'
import path from 'path'
import { ImprovementResult } from '../self-improvement.js'

// --- Инструменты для Агента ---

const generateCodeTool = (mcpService: Service) =>
  createTool({
    name: 'generateCode',
    description: 'Generates new code based on a description and requirements.',
    parameters: z.object({
      description: z.string(),
      requirements: z.union([z.string(), z.array(z.string())]),
      language: z.string().optional().default('TypeScript'),
      outputDir:
        z.string().optional().describe('Directory to save generated files.'),
    }),
    handler: async ({ description, requirements, language, outputDir }) => {
      // Вызываем старую логику, передавая параметры
      console.log(`[generateCodeTool] 🚀 Generating code...`)
      try {
        const result = await handleCodeGeneration(
          description,
          requirements,
          language,
          outputDir,
          mcpService
        )
        console.log(`[generateCodeTool] ✅ Code generated successfully.`)
        return result
      } catch (error: any) {
        console.error('[generateCodeTool] ❌ Error:', error)
        return { error: `Failed to generate code: ${error.message}` }
      }
    },
  })

const refactorCodeTool = (mcpService: Service) =>
  createTool({
    name: 'refactorCode',
    description: 'Refactors existing code based on file paths or snippets.',
    parameters: z.object({
      filePaths:
        z.array(z.string()).optional().describe('Paths to files to refactor.'),
      codeSnippets:
        z
          .array(z.object({ path: z.string(), content: z.string() }))
          .optional()
          .describe('Code snippets to refactor.'),
      refactoringType: z.string().optional().default('General improvement'),
      goals:
        z
          .union([z.string(), z.array(z.string())])
          .optional()
          .default('Improve code quality, readability and maintainability'),
    }),
    handler: async ({ filePaths, codeSnippets, refactoringType, goals }) => {
      console.log(`[refactorCodeTool] 🚀 Refactoring code...`)
      try {
        const result = await handleCodeRefactoring(
          filePaths,
          codeSnippets,
          refactoringType,
          goals,
          mcpService
        )
        console.log(`[refactorCodeTool] ✅ Code refactored successfully.`)
        return result
      } catch (error: any) {
        console.error('[refactorCodeTool] ❌ Error:', error)
        return { error: `Failed to refactor code: ${error.message}` }
      }
    },
  })

const improveCodeTool = (mcpService: Service) =>
  createTool({
    name: 'improveCode',
    description:
      'Analyzes code (optionally within a specific component) and suggests/applies improvements.',
    parameters: z.object({
      description:
        z.string().describe('Description of the desired improvement.'),
      targetComponent:
        z
          .string()
          .optional()
          .describe('Specific component/directory to analyze.'),
      applyChanges:
        z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to automatically apply the suggested changes.'),
    }),
    handler: async ({ description, targetComponent, applyChanges }) => {
      console.log(
        `[improveCodeTool] 🚀 Improving code... (Apply: ${applyChanges})`
      )
      try {
        const result = await handleSelfImprovement(
          description,
          targetComponent,
          applyChanges,
          mcpService
        )
        console.log(
          `[improveCodeTool] ✅ Code improvement analysis/application complete.`
        )
        return result
      } catch (error: any) {
        console.error('[improveCodeTool] ❌ Error:', error)
        return { error: `Failed to improve code: ${error.message}` }
      }
    },
  })

/**
 * Создает специализированного агента для генерации кода (Адаптировано)
 */
export function createCodeGeneratorAgent(mcpService: Service): Agent<any> {
  // Создаем инструменты, передавая mcpService
  const tools = [
    generateCodeTool(mcpService),
    refactorCodeTool(mcpService),
    improveCodeTool(mcpService),
  ]

  return createAgent<any>({
    name: 'codeGeneratorAgent',
    description:
      'Generates, refactors, and improves code based on provided specifications.',
    system: `You are an expert AI assistant specializing in code generation, refactoring, and improvement.
Carefully analyze the user request and select the most appropriate tool (\`generateCode\`, \`refactorCode\`, or \`improveCode\`).
Provide all necessary parameters for the chosen tool based on the request.`,
    tools: tools,
  })
}

// --- Вспомогательные функции (Адаптированы для приема параметров вместо Task) ---

/**
 * Обрабатывает задачу генерации кода
 */
async function handleCodeGeneration(
  description: string,
  requirements: string | string[],
  language: string,
  outputDir: string | undefined,
  mcpService: Service
): Promise<{ files: { path: string; content: string }[] }> {
  const prompt = `
You are an expert code generator. Please generate code based on the following description and requirements:

DESCRIPTION:
${description}

REQUIREMENTS:
${Array.isArray(requirements) ? requirements.join('\n') : requirements}

LANGUAGE:
${language}

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
  filePaths: string[] | undefined,
  codeSnippets: { path: string; content: string }[] | undefined,
  refactoringType: string,
  goals: string | string[],
  mcpService: Service
): Promise<{ files: { path: string; content: string }[] }> {
  const codeToRefactor: { path: string; content: string }[] = []

  if (filePaths && Array.isArray(filePaths)) {
    for (const filePath of filePaths) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        codeToRefactor.push({ path: filePath, content })
      } catch (error: any) {
        console.warn(
          `[Refactor] Error reading local file ${filePath}: ${error.message}`
        )
      }
    }
  }

  if (codeSnippets && Array.isArray(codeSnippets)) {
    codeToRefactor.push(...codeSnippets)
  }

  if (codeToRefactor.length === 0) {
    throw new Error(
      'No code provided to refactor (checked local filePaths and codeSnippets).'
    )
  }

  const codeContent = codeToRefactor
    .map(
      (file) =>
        `
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
${refactoringType}

GOALS:
${Array.isArray(goals) ? goals.join('\n') : goals}

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
  description: string,
  targetComponent: string | undefined,
  applyChanges: boolean,
  mcpService: Service
): Promise<ImprovementResult> {
  let codeContent = ''
  let componentFiles: string[] = []

  if (targetComponent) {
    componentFiles = await getComponentFiles(targetComponent)

    if (componentFiles.length === 0) {
      throw new Error(`No local files found for component ${targetComponent}`)
    }

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
      } catch (error: any) {
        console.warn(
          `[Improve] Error reading local file ${filePath}: ${error.message}`
        )
      }
    }
  }

  const prompt = `
You are an autonomous agent tasked with improving the codebase. Please analyze and implement the following improvement:

IMPROVEMENT REQUEST:
${description}

${targetComponent ? `TARGET COMPONENT: ${targetComponent}` : 'Analyze relevant parts of the codebase based on the request.'}

${codeContent ? `COMPONENT CODE:\n${codeContent}` : 'Code context is not provided; analyze based on the request and general knowledge.'}

Please analyze the code and suggest specific improvements. For each improvement:
1. Explain what needs to be changed and why.
2. Provide the exact code changes needed, including the full file path and the complete refactored code for each affected file.
3. Explain the benefits of the improvement.

Respond *only* in the following structured format:
ANALYSIS:
\`\`\`
[Your analysis of the code and the problem]
\`\`\`
PROPOSED_IMPROVEMENTS:
[List of proposed improvements. For each improvement, include sections: Explanation:, CodeChanges:, Benefits:]

Example CodeChanges format:
---
FILE_PATH: [full file path]
REFACTORED_CONTENT:
\`\`\`[language]
[full refactored code content]
\`\`\`
---
[Repeat for each file to change]

If no improvements are needed or possible, state that clearly in the ANALYSIS section.
`

  try {
    console.log('[Improve] Sending analysis request to MCP...')
    const response = await mcpService.processTask(prompt)
    const result = parseImprovementResult(response)

    if (applyChanges && result.proposedImprovements?.length > 0) {
      console.log('[Improve] Applying detected changes...')
      await applyImprovementChanges(result)
      console.log('[Improve] Changes applied locally (potential issue!).')
      result.changesApplied = true
    } else {
      result.changesApplied = false
    }

    return result
  } catch (error) {
    console.error('Error during self-improvement:', error)
    throw error
  }
}

// --- Утилиты парсинга и сохранения (без изменений, кроме TODO комментариев) ---

function parseGeneratedFiles(
  response: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const fileRegex = /FILE_PATH: ([^\n]+)\nFILE_CONTENT:\n```(?:\w*\n)?([^]*?)\n```/g
  let match

  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1].trim()
    const fileContent = match[2].trim()
    files.push({ path: filePath, content: fileContent })
  }

  if (files.length === 0) {
    console.warn('Could not parse any files from generation response.')
  }

  return files
}

function parseRefactoredFiles(
  response: string
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = []
  const fileRegex =
    /FILE_PATH: ([^\n]+)\nREFACTORED_CONTENT:\n```(?:\w*\n)?([^]*?)\n```/g
  let match

  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1].trim()
    const fileContent = match[2].trim()
    files.push({ path: filePath, content: fileContent })
  }

  if (files.length === 0) {
    console.warn('Could not parse any files from refactoring response.')
  }

  return files
}

function saveGeneratedFiles(
  files: { path: string; content: string }[],
  outputDir: string
): void {
  console.warn(
    '[saveGeneratedFiles] Attempting to write to local filesystem. This should likely use sandbox tools.'
  )
  files.forEach((file) => {
    try {
      const fullPath = path.resolve(outputDir, file.path)
      const dirName = path.dirname(fullPath)

      if (!fs.existsSync(dirName)) {
        fs.mkdirSync(dirName, { recursive: true })
      }

      fs.writeFileSync(fullPath, file.content)
      console.log(`[Local Save] File saved: ${fullPath}`)
    } catch (error) {
      console.error(`[Local Save] Error saving file ${file.path}:`, error)
    }
  })
}

// --- Функции для Self-Improvement (Без изменений, кроме TODO комментариев) ---

async function getComponentFiles(componentName: string): Promise<string[]> {
  console.warn(
    '[getComponentFiles] Searching local filesystem. Needs adaptation for sandbox.'
  )
  const rootDir = path.resolve(__dirname, '../../../../')
  const searchPattern = new RegExp(`${componentName}\.(ts|js|tsx|jsx)$`, 'i')
  const files: string[] = []
  await findFiles(path.join(rootDir, 'src'), searchPattern, files)
  return files
}

async function findFiles(
  dir: string,
  pattern: RegExp,
  result: string[]
): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        await findFiles(fullPath, pattern, result)
      }
    } else if (pattern.test(entry.name)) {
      result.push(fullPath)
    }
  }
}

function parseImprovementResult(response: string): ImprovementResult {
  const analysisRegex = /ANALYSIS:\n```([^]*?)```/
  const improvementsRegex = /PROPOSED_IMPROVEMENTS:([^]*)/
  const fileChangeRegex =
    /FILE_PATH: ([^\n]+)\nREFACTORED_CONTENT:\n```(?:\w*\n)?([^]*?)\n```/g

  const analysisMatch = response.match(analysisRegex)
  const improvementsMatch = response.match(improvementsRegex)

  const result: ImprovementResult = {
    analysis: analysisMatch ? analysisMatch[1].trim() : 'No analysis provided.',
    proposedImprovements: [],
    changesApplied: false,
    success: true,
    message: analysisMatch ? 'Analysis complete' : 'No structured analysis found',
    updatedFiles: [],
    createdFiles: [],
    improvementType: 'UNKNOWN',
    recommendations: [],
  }

  if (improvementsMatch) {
    const improvementsText = improvementsMatch[1]
    const improvementBlocks = improvementsText
      .split(/Explanation:/)
      .map((s) => s.trim())
      .filter((s) => s)

    improvementBlocks.forEach((block) => {
      const explanationMatch = block.match(
        /^([^]*?)(?:CodeChanges:|Benefits:)/
      )
      const codeChangesMatch = block.match(
        /CodeChanges:([^]*?)(?:Benefits:|$)/
      )
      const benefitsMatch = block.match(/Benefits:([^]*)/)

      const improvement: ImprovementResult['proposedImprovements'][0] = {
        explanation: explanationMatch
          ? explanationMatch[1].trim()
          : 'No explanation.',
        codeChanges: [],
        benefits: benefitsMatch
          ? benefitsMatch[1].trim()
          : 'No benefits listed.',
      }

      if (codeChangesMatch) {
        const codeChangesText = codeChangesMatch[1]
        let fileMatch
        while ((fileMatch = fileChangeRegex.exec(codeChangesText)) !== null) {
          improvement.codeChanges.push({
            filePath: fileMatch[1].trim(),
            refactoredContent: fileMatch[2].trim(),
          })
        }
        fileChangeRegex.lastIndex = 0
      }

      result.proposedImprovements.push(improvement)
    })
  }

  if (!analysisMatch && !improvementsMatch) {
    result.analysis = response.trim()
    result.message = 'Could not parse structured improvement response. Treating whole response as analysis.'
    console.warn(result.message)
  }

  return result
}

async function applyImprovementChanges(
  result: ImprovementResult,
  dryRun = false
): Promise<ImprovementResult> {
  if (!result.proposedImprovements || result.proposedImprovements.length === 0) {
    console.warn('No improvements to apply')
    return {
      ...result,
      changesApplied: false,
      message: result.message + '. No improvements to apply.',
    }
  }

  const updatedFiles: string[] = []
  const createdFiles: string[] = []
  let errorMessage = ''

  try {
    // Attempt to apply each proposed improvement
    for (const improvement of result.proposedImprovements) {
      for (const change of improvement.codeChanges) {
        const { filePath, refactoredContent } = change
        const fullPath = path.resolve(process.cwd(), filePath)
        
        try {
          if (!dryRun) {
            // Check if file exists
            const fileExists = await fs.promises
              .access(fullPath)
              .then(() => true)
              .catch(() => false)

            await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
            await fs.promises.writeFile(fullPath, refactoredContent)

            if (fileExists) {
              updatedFiles.push(filePath)
            } else {
              createdFiles.push(filePath)
            }
          } else {
            console.log(`[DRY RUN] Would write to: ${filePath}`)
          }
        } catch (error) {
          console.error(`Error writing file ${filePath}:`, error)
          errorMessage += `Failed to write ${filePath}: ${error}\n`
        }
      }
    }

    return {
      ...result,
      changesApplied: true,
      success: errorMessage === '',
      message: errorMessage || 'Applied improvements successfully',
      updatedFiles,
      createdFiles,
    }
  } catch (error) {
    console.error('Error applying improvements:', error)
    return {
      ...result,
      changesApplied: false,
      success: false,
      message: `Error applying improvements: ${error}`,
    }
  }
}

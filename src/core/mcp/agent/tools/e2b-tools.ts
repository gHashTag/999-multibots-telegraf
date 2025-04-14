import { z } from 'zod'
import { createTool } from '@inngest/agent-kit'
// import type { NetworkContext } from '@inngest/agent-kit/router' // Removed problematic import
import { Sandbox, Process } from 'e2b'

const E2B_API_KEY = process.env.E2B_API_KEY

// Helper function to get or create a sandbox instance for the network context
async function getSandbox(network: any): Promise<Sandbox> {
  // Use any for network type for now
  // Assume network structure { state: { kv: ... } }
  if (!network?.state?.kv) {
    throw new Error('Invalid network context structure passed to getSandbox.')
  }

  let sandbox = network.state.kv.get('sandbox') as Sandbox | undefined

  if (!sandbox || !(await sandbox.keepAlive())) {
    if (!E2B_API_KEY) {
      throw new Error('E2B_API_KEY is not set in environment variables.')
    }
    console.log('Creating new E2B sandbox...')
    sandbox = await Sandbox.create({ apiKey: E2B_API_KEY })
    network.state.kv.set('sandbox', sandbox)
    console.log(`Sandbox created: ${sandbox.id}`)

    // Optional: Add listeners for sandbox events
    sandbox
      .on('close', () => {
        console.log(`Sandbox ${sandbox?.id} closed.`)
        network.state.kv.delete('sandbox')
      })
      .on('error', (error: Error) => {
        console.error(`Sandbox ${sandbox?.id} error:`, error)
      })
  }

  return sandbox
}

// Tool to run terminal commands in the sandbox
export const runTerminalCommandTool = createTool({
  name: 'runTerminalCommand',
  description: 'Run a terminal command in the E2B sandbox environment.',
  parameters: z.object({
    command: z.string().describe('The terminal command to execute.'),
    timeout: z
      .number()
      .optional()
      .default(60000)
      .describe('Timeout in milliseconds for the command execution.'),
  }),
  handler: async ({ command, timeout }, { network }) => {
    const buffers = { stdout: '', stderr: '' }
    try {
      console.log(`🚀 Running command: ${command}`)
      const sandbox = await getSandbox(network) // Pass network directly
      const process: Process = await sandbox.process.start({
        cmd: command,
        timeout: timeout,
        onStdout: (data: string) => {
          buffers.stdout += data
          console.log(`  [stdout] > ${data}`)
        },
        onStderr: (data: string) => {
          buffers.stderr += data
          console.error(`  [stderr] > ${data}`)
        },
      })

      await process.wait // Wait for the process to finish

      console.log(`✅ Command finished: ${command}`)
      return {
        stdout: process.output.stdout,
        stderr: process.output.stderr,
        exitCode: process.exitCode,
      }
    } catch (e: any) {
      const errorMsg = `❌ Command failed: ${command}\nError: ${e.message || e}\nstdout: ${buffers.stdout}\nstderr: ${buffers.stderr}`
      console.error(errorMsg)
      return {
        error: errorMsg,
        stdout: buffers.stdout,
        stderr: buffers.stderr,
      }
    }
  },
})

// Tool to create or update files in the sandbox
export const createOrUpdateFilesTool = createTool({
  name: 'createOrUpdateFiles',
  description: 'Create or update one or more files in the sandbox.',
  parameters: z.object({
    files: z.array(
      z.object({
        path: z
          .string()
          .describe(
            'The absolute path within the sandbox where the file should be written.'
          ),
        content: z.string().describe('The content to write to the file.'),
      })
    ),
  }),
  handler: async ({ files }, { network }) => {
    try {
      const paths = files.map(f => f.path)
      console.log(`💾 Writing files: ${paths.join(', ')}`)
      const sandbox = await getSandbox(network) // Pass network directly
      const promises = files.map(file =>
        sandbox.filesystem.write(file.path, file.content)
      )
      await Promise.all(promises)
      console.log(`✅ Files written successfully: ${paths.join(', ')}`)
      return `Files created or updated: ${paths.join(', ')}`
    } catch (e: any) {
      const errorMsg = `❌ Error writing files: ${e.message || e}`
      console.error(errorMsg)
      return { error: errorMsg }
    }
  },
})

// Tool to read files from the sandbox
export const readFilesTool = createTool({
  name: 'readFiles',
  description: 'Read one or more files from the sandbox.',
  parameters: z.object({
    files: z
      .array(z.string())
      .describe('An array of absolute paths to the files to read.'),
  }),
  handler: async ({ files }, { network }) => {
    try {
      console.log(`📖 Reading files: ${files.join(', ')}`)
      const sandbox = await getSandbox(network) // Pass network directly
      const contents: { path: string; content: string }[] = []
      for (const file of files) {
        try {
          const content = await sandbox.filesystem.read(file)
          contents.push({ path: file, content })
        } catch (readError: any) {
          console.warn(`⚠️ Could not read file ${file}: ${readError.message}`)
          contents.push({
            path: file,
            content: `Error reading file: ${readError.message}`,
          })
        }
      }
      console.log(`✅ Files read successfully: ${files.join(', ')}`)
      return JSON.stringify(contents)
    } catch (e: any) {
      const errorMsg = `❌ Error reading files: ${e.message || e}`
      console.error(errorMsg)
      return { error: errorMsg }
    }
  },
})

// Helper to potentially close the sandbox when the network finishes
export async function closeSandbox(network: any): Promise<void> {
  // Use any for network type
  if (!network?.state?.kv) {
    console.warn('closeSandbox called with invalid network context.')
    return
  }
  const sandbox = network.state.kv.get('sandbox') as Sandbox | undefined
  if (sandbox) {
    try {
      console.log(`Attempting to close sandbox: ${sandbox.id}`)
      await sandbox.close()
      network.state.kv.delete('sandbox')
      console.log(`Sandbox ${sandbox.id} closed successfully.`)
    } catch (error: any) {
      console.error(`Error closing sandbox ${sandbox.id}:`, error)
    }
  }
}

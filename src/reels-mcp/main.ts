// reels MCP server V1 entry point: stdio transport.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createReelsServer } from './server'

async function main(): Promise<void> {
  const server = createReelsServer()
  await server.connect(new StdioServerTransport())
  console.error('reels MCP V1 listening on stdio')
}

main().catch(error => {
  console.error(`reels MCP server failed: ${String(error)}`)
  process.exit(1)
})

// Локальный харнесс A2A/MCP — без Remotion и face-api. НЕ коммитить.
import { createServer } from 'node:http'
import { Pool } from 'pg'
import { handleA2A, handleA2ACard } from './src/agent/a2a'
import { handleMcp, handleMcpCard } from './src/agent/routes'

const PORT = Number(process.env.A2A_PORT || 3334)
const BASE = process.env.SELF_URL || `http://localhost:${PORT}`
let pool: Pool | null = null
const getPool = () => {
  if (!pool) {
    const cs = process.env.DATABASE_URL
    if (!cs) throw new Error('DATABASE_URL not set')
    const ssl = /localhost|127\.0\.0\.1|railway\.internal/.test(cs)
      ? false
      : { rejectUnauthorized: false }
    pool = new Pool({ connectionString: cs, ssl })
  }
  return pool
}
createServer(async (req, res) => {
  const u = (req.url || '').split('?')[0]
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    if (
      req.method === 'GET' &&
      (u === '/.well-known/agent-card.json' || u === '/.well-known/agent.json')
    )
      return handleA2ACard(res, BASE)
    if (u === '/a2a' && req.method === 'POST')
      return await handleA2A(req, res, getPool as any)
    if (u === '/mcp' && req.method === 'GET') return handleMcpCard(res)
    if (u === '/mcp' && req.method === 'POST')
      return await handleMcp(req, res, getPool as any)
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'not found',
        routes: ['/.well-known/agent-card.json', '/a2a', '/mcp'],
      })
    )
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(e).slice(0, 300) }))
  }
}).listen(PORT, () => console.log(`A2A/MCP local harness on ${BASE}`))

#!/usr/bin/env node
/**
 * kill-port.cjs - Kills processes listening on specified ports
 * Usage: node kill-port.cjs 3000 3001 8288
 */

const { execSync } = require('child_process')

const ports = process.argv.slice(2)

if (ports.length === 0) {
  console.log('Usage: node kill-port.cjs <port1> [port2] [port3] ...')
  process.exit(0)
}

for (const port of ports) {
  try {
    // Find process using the port
    const result = execSync(`lsof -ti:${port}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const pids = result.trim().split('\n').filter(Boolean)

    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGTERM')
        console.log(`Killed process ${pid} on port ${port}`)
      } catch (e) {
        // Process might have already exited
      }
    }
  } catch (e) {
    // No process on this port - that's fine
  }
}

process.exit(0)

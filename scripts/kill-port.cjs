const { execSync } = require('child_process')
const os = require('os')

/**
 * Kill process by port
 * @param {number} port - The port to kill
 */
function killPort(port) {
  const platform = os.platform()
  let command = ''

  try {
    if (platform === 'win32') {
      command = `netstat -ano | findstr :${port} | findstr LISTENING && FOR /F "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`
    } else {
      command = `lsof -i :${port} -t | xargs -r kill -9`
    }

    console.log(`Checking port ${port}...`)
    execSync(command, { stdio: 'pipe' })
    console.log(`Successfully killed process on port ${port}`)
  } catch (e) {
    console.error(`Error checking/killing port ${port}: ${e.message}`)
  }
}

// Get ports from arguments
const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('No ports specified')
  process.exit(0)
}

// Kill all specified ports
args.forEach(port => {
  killPort(parseInt(port, 10))
})

console.log('All ports checked')

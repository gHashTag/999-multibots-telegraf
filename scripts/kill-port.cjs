#!/usr/bin/env node

const { exec } = require('child_process');

// Get ports from command line arguments
const ports = process.argv.slice(2);

if (ports.length === 0) {
  console.log('Usage: node kill-port.cjs [port1] [port2] ...');
  process.exit(1);
}

// Function to kill process on specific port
function killPort(port) {
  return new Promise((resolve) => {
    // Kill process using lsof and kill command
    exec(`lsof -ti:${port} | xargs kill -9`, (error) => {
      if (error) {
        console.log(`No process found on port ${port} or failed to kill`);
      } else {
        console.log(`✓ Killed process on port ${port}`);
      }
      resolve();
    });
  });
}

// Kill all specified ports
async function killAllPorts() {
  console.log(`Killing processes on ports: ${ports.join(', ')}`);
  
  const promises = ports.map(port => killPort(port));
  await Promise.all(promises);
  
  console.log('Done');
}

killAllPorts().catch(console.error);
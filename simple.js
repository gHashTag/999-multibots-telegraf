// Ultra Simple Railway Test
const express = require('express')

console.log('🚀 ULTRA SIMPLE: Starting...')

const port = process.env.PORT || 8080
console.log(`🌐 Port: ${port}`)

const app = express()

app.get('/', (req, res) => {
  res.json({ 
    status: 'WORKING!',
    port: port,
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  })
})

app.get('/health', (req, res) => {
  res.json({ healthy: true })
})

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`)
})
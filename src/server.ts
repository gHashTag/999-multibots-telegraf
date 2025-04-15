import express from 'express'
import { logger } from '@/utils/logger'
import { API_PORT } from '@/config'
import api from './api'
import type { CustomRequest, CustomResponse } from '@/types/express'

const app = express()

// Middleware
app.use(express.json())

// API routes
app.use('/api', api)

// Error handling
app.use((err: Error, req: CustomRequest, res: CustomResponse) => {
  logger.error('❌ Server Error:', {
    description: 'Server request error',
    error: err.message,
  })

  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  })
})

// Start server
const port = API_PORT || 3000

app.listen(port, () => {
  logger.info('🚀 Server started:', {
    description: 'Server started successfully',
    port,
  })
})

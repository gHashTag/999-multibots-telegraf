import { serve } from 'inngest/express'
import { inngest } from './inngest-functions/clients'
import { SERVER_PORT } from './config'

const baseUrl = `http://localhost:${SERVER_PORT}/api/inngest`

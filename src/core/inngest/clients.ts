/**
 * Inngest Clients - Re-export from inngest_app
 *
 * Centralized exports for all inngest clients and instances
 * This file provides backward compatibility for imports from @/core/inngest/clients
 */

export { inngest, isInngestConfigured } from '@/inngest_app/inngestClient'
export { inngestProvider, InngestInstance } from '@/inngest_app/inngest-provider'

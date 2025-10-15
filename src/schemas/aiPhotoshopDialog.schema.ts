import { z } from 'zod'

/**
 * AI Photoshop Dialog Mode Schema
 * Comprehensive validation for dialog state management, user inputs, and transitions
 */

// ================== ENUMS AND CONSTANTS ==================

export const DialogStateEnum = z.enum([
  'idle',           // No active dialog
  'awaiting_input', // Waiting for user input (text, photo, command)
  'processing',     // AI processing user request
  'showing_results',// Displaying generated results
  'awaiting_choice',// User needs to make a choice (edit, save, new)
  'error'          // Error state requiring recovery
])

export const UserInputTypeEnum = z.enum([
  'text',          // Text prompt or command
  'photo',         // Image upload
  'command',       // Bot command (/start, /help, etc.)
  'callback',      // Inline button callback
  'voice',         // Voice message (future)
  'sticker'        // Sticker (future)
])

export const AIPhotoshopModelEnum = z.enum([
  'seedream',
  'nano_banana',
  'flux_max',
  'qwen_edit_plus'
])

export const AIPhotoshopStyleEnum = z.enum([
  'portrait',
  'artistic',
  'photorealistic',
  'fantasy',
  'cyberpunk',
  'vintage',
  'custom'
])

export const AIPhotoshopSizeEnum = z.enum([
  '1K',
  '2K',
  '4K',
  'custom'
])

export const ProcessingStepEnum = z.enum([
  'model_select',
  'style_select',
  'image_upload',
  'custom_prompt',
  'processing',
  'results_ready'
])

export const TransitionTriggerEnum = z.enum([
  'user_input',     // User provided input
  'ai_complete',    // AI processing completed
  'user_choice',    // User made a choice
  'error_occurred', // Error happened
  'timeout',        // Operation timed out
  'command',        // Bot command received
  'restart'         // Dialog restart requested
])

// ================== CORE SCHEMAS ==================

/**
 * Dialog State Schema - Complete state of the AI Photoshop dialog
 */
export const DialogStateSchema = z.object({
  // Core state
  currentState: DialogStateEnum.default('idle'),
  previousState: DialogStateEnum.optional(),
  sessionId: z.string().min(1).describe('Unique session identifier'),
  userId: z.string().regex(/^\d+$/, '🚨 Invalid user ID format').describe('Telegram user ID'),

  // Processing context
  processingStep: ProcessingStepEnum.optional(),
  isActive: z.boolean().default(false).describe('Is dialog currently active'),
  startTime: z.string().datetime().describe('Dialog start timestamp'),
  lastActivityTime: z.string().datetime().describe('Last user activity timestamp'),

  // AI Photoshop specific state
  selectedModel: AIPhotoshopModelEnum.optional(),
  selectedStyle: AIPhotoshopStyleEnum.optional(),
  selectedSize: AIPhotoshopSizeEnum.optional(),
  customDimensions: z.object({
    width: z.number().int().min(512).max(4096),
    height: z.number().int().min(512).max(4096)
  }).optional(),

  // Current context
  currentPrompt: z.string().max(2000).optional(),
  currentImageUrl: z.string().url().optional(),
  awaitingInput: z.boolean().default(false),

  // Results and history
  generatedResults: z.array(z.object({
    id: z.string().uuid(),
    url: z.string().url(),
    model: AIPhotoshopModelEnum,
    prompt: z.string(),
    timestamp: z.string().datetime(),
    style: AIPhotoshopStyleEnum.optional(),
    size: AIPhotoshopSizeEnum.optional()
  })).default([]),

  // Error handling
  lastError: z.object({
    code: z.string(),
    message: z.string(),
    timestamp: z.string().datetime(),
    recoverable: z.boolean().default(true)
  }).optional(),

  // Metadata
  totalInteractions: z.number().int().min(0).default(0),
  metadata: z.record(z.unknown()).default({})
}).strict()

/**
 * User Input Schema - Validates all types of user input
 */
export const UserInputSchema = z.object({
  // Input identification
  inputId: z.string().min(1).describe('Unique input identifier'),
  type: UserInputTypeEnum,
  timestamp: z.string().datetime(),
  userId: z.string().regex(/^\d+$/, '🚨 Invalid user ID format'),

  // Content validation
  content: z.object({
    // Text content (prompts, commands)
    text: z.string()
      .max(2000, '🚨 Text too long (max 2000 characters)')
      .optional()
      .refine(
        (text) => !text || text.trim().length > 0,
        '🚨 Text cannot be empty or whitespace'
      ),

    // Photo content
    photo: z.object({
      fileId: z.string().min(1, '🚨 File ID required'),
      url: z.string().url('🚨 Invalid photo URL'),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
      fileSize: z.number().int().min(1).optional()
    }).optional(),

    // Command content
    command: z.object({
      name: z.string().regex(/^\/\w+/, '🚨 Invalid command format'),
      args: z.array(z.string()).default([])
    }).optional(),

    // Callback content (inline buttons)
    callback: z.object({
      data: z.string().min(1, '🚨 Callback data required'),
      messageId: z.number().int().min(1)
    }).optional()
  }),

  // Context
  sessionId: z.string().min(1),
  messageId: z.number().int().min(1),
  chatId: z.number().int(),

  // Validation flags
  isValid: z.boolean().default(true),
  validationErrors: z.array(z.string()).default([])
}).strict().superRefine((data, ctx) => {
  // Ensure content matches input type
  const { type, content } = data

  switch (type) {
    case 'text':
      if (!content.text) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '🚨 Text content required for text input type',
          path: ['content', 'text']
        })
      }
      break
    case 'photo':
      if (!content.photo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '🚨 Photo content required for photo input type',
          path: ['content', 'photo']
        })
      }
      break
    case 'command':
      if (!content.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '🚨 Command content required for command input type',
          path: ['content', 'command']
        })
      }
      break
    case 'callback':
      if (!content.callback) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '🚨 Callback content required for callback input type',
          path: ['content', 'callback']
        })
      }
      break
  }
})

/**
 * Session Data Schema - Complete session information
 */
export const SessionDataSchema = z.object({
  // Session identification
  sessionId: z.string().min(1),
  userId: z.string().regex(/^\d+$/, '🚨 Invalid user ID format'),
  chatId: z.number().int(),
  username: z.string().optional(),

  // Session lifecycle
  startTime: z.string().datetime(),
  lastAccessTime: z.string().datetime(),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().optional(),

  // Dialog state
  dialogState: DialogStateSchema,

  // User preferences
  preferences: z.object({
    language: z.enum(['ru', 'en']).default('ru'),
    defaultModel: AIPhotoshopModelEnum.optional(),
    defaultStyle: AIPhotoshopStyleEnum.optional(),
    defaultSize: AIPhotoshopSizeEnum.optional(),
    autoSaveResults: z.boolean().default(true)
  }).default({}),

  // Session statistics
  stats: z.object({
    totalInputs: z.number().int().min(0).default(0),
    totalGenerations: z.number().int().min(0).default(0),
    totalErrors: z.number().int().min(0).default(0),
    averageResponseTime: z.number().min(0).optional()
  }).default({}),

  // Cache and temporary data
  cache: z.record(z.unknown()).default({}),
  temporaryData: z.record(z.unknown()).default({})
}).strict()

/**
 * State Transition Schema - Validates transitions between dialog states
 */
export const StateTransitionSchema = z.object({
  // Transition identification
  transitionId: z.string().uuid(),
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),

  // Transition details
  fromState: DialogStateEnum,
  toState: DialogStateEnum,
  trigger: TransitionTriggerEnum,

  // Transition context
  context: z.object({
    userInput: UserInputSchema.optional(),
    aiResponse: z.object({
      model: AIPhotoshopModelEnum.optional(),
      results: z.array(z.string().url()).optional(),
      processingTime: z.number().min(0).optional()
    }).optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      stackTrace: z.string().optional()
    }).optional()
  }).optional(),

  // Validation
  isValid: z.boolean().default(true),
  validationErrors: z.array(z.string()).default([])
}).strict().superRefine((data, ctx) => {
  // Validate state transition logic
  const { fromState, toState, trigger } = data

  // Define valid transitions
  const validTransitions: Record<string, string[]> = {
    'idle': ['awaiting_input'],
    'awaiting_input': ['processing', 'error'],
    'processing': ['showing_results', 'error'],
    'showing_results': ['awaiting_choice', 'awaiting_input', 'idle'],
    'awaiting_choice': ['processing', 'awaiting_input', 'idle', 'error'],
    'error': ['idle', 'awaiting_input']
  }

  if (!validTransitions[fromState]?.includes(toState)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `🚨 Invalid state transition from ${fromState} to ${toState}`,
      path: ['toState']
    })
  }
})

/**
 * Error Handling Schema - Comprehensive error management
 */
export const ErrorHandlingSchema = z.object({
  // Error identification
  errorId: z.string().uuid(),
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),

  // Error details
  type: z.enum([
    'validation_error',
    'processing_error',
    'network_error',
    'timeout_error',
    'user_error',
    'system_error'
  ]),
  code: z.string(),
  message: z.string().max(500),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),

  // Error context
  context: z.object({
    dialogState: DialogStateEnum,
    userInput: UserInputSchema.optional(),
    stackTrace: z.string().optional(),
    additionalInfo: z.record(z.unknown()).optional()
  }),

  // Recovery information
  recovery: z.object({
    isRecoverable: z.boolean().default(true),
    suggestedAction: z.string().optional(),
    fallbackState: DialogStateEnum.optional(),
    retryCount: z.number().int().min(0).default(0),
    maxRetries: z.number().int().min(0).default(3)
  }).default({}),

  // Resolution
  resolved: z.boolean().default(false),
  resolvedAt: z.string().datetime().optional(),
  resolutionNotes: z.string().optional()
}).strict()

// ================== TYPE EXPORTS ==================

export type DialogState = z.infer<typeof DialogStateSchema>
export type UserInput = z.infer<typeof UserInputSchema>
export type SessionData = z.infer<typeof SessionDataSchema>
export type StateTransition = z.infer<typeof StateTransitionSchema>
export type ErrorHandling = z.infer<typeof ErrorHandlingSchema>

export type DialogStateType = z.infer<typeof DialogStateEnum>
export type UserInputType = z.infer<typeof UserInputTypeEnum>
export type AIPhotoshopModel = z.infer<typeof AIPhotoshopModelEnum>
export type AIPhotoshopStyle = z.infer<typeof AIPhotoshopStyleEnum>
export type AIPhotoshopSize = z.infer<typeof AIPhotoshopSizeEnum>
export type ProcessingStep = z.infer<typeof ProcessingStepEnum>
export type TransitionTrigger = z.infer<typeof TransitionTriggerEnum>

// ================== UTILITY FUNCTIONS ==================

/**
 * Validates dialog state with detailed logging
 */
export function validateDialogState(input: unknown) {
  try {
    const validated = DialogStateSchema.parse(input)
    console.log('✅ [AI Photoshop Dialog] Dialog state validation successful:', {
      sessionId: validated.sessionId,
      currentState: validated.currentState,
      isActive: validated.isActive,
      selectedModel: validated.selectedModel,
      resultsCount: validated.generatedResults.length,
      totalInteractions: validated.totalInteractions
    })
    return { success: true, data: validated }
  } catch (error) {
    console.error('🚨 [AI Photoshop Dialog] Dialog state validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input)
    })
    return { success: false, error }
  }
}

/**
 * Validates user input with context-aware validation
 */
export function validateUserInput(input: unknown) {
  try {
    const validated = UserInputSchema.parse(input)
    console.log('✅ [AI Photoshop Dialog] User input validation successful:', {
      inputId: validated.inputId,
      type: validated.type,
      hasText: !!validated.content.text,
      hasPhoto: !!validated.content.photo,
      hasCommand: !!validated.content.command,
      hasCallback: !!validated.content.callback,
      sessionId: validated.sessionId
    })
    return { success: true, data: validated }
  } catch (error) {
    console.error('🚨 [AI Photoshop Dialog] User input validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input)
    })
    return { success: false, error }
  }
}

/**
 * Validates session data with comprehensive checks
 */
export function validateSessionData(input: unknown) {
  try {
    const validated = SessionDataSchema.parse(input)
    console.log('✅ [AI Photoshop Dialog] Session data validation successful:', {
      sessionId: validated.sessionId,
      userId: validated.userId,
      isActive: validated.isActive,
      dialogState: validated.dialogState.currentState,
      language: validated.preferences.language,
      totalInputs: validated.stats.totalInputs,
      totalGenerations: validated.stats.totalGenerations
    })
    return { success: true, data: validated }
  } catch (error) {
    console.error('🚨 [AI Photoshop Dialog] Session data validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input)
    })
    return { success: false, error }
  }
}

/**
 * Validates state transitions for dialog flow control
 */
export function validateStateTransition(input: unknown) {
  try {
    const validated = StateTransitionSchema.parse(input)
    console.log('✅ [AI Photoshop Dialog] State transition validation successful:', {
      transitionId: validated.transitionId,
      fromState: validated.fromState,
      toState: validated.toState,
      trigger: validated.trigger,
      sessionId: validated.sessionId
    })
    return { success: true, data: validated }
  } catch (error) {
    console.error('🚨 [AI Photoshop Dialog] State transition validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input)
    })
    return { success: false, error }
  }
}

/**
 * Validates error handling data for proper error management
 */
export function validateErrorHandling(input: unknown) {
  try {
    const validated = ErrorHandlingSchema.parse(input)
    console.log('✅ [AI Photoshop Dialog] Error handling validation successful:', {
      errorId: validated.errorId,
      type: validated.type,
      severity: validated.severity,
      isRecoverable: validated.recovery.isRecoverable,
      resolved: validated.resolved
    })
    return { success: true, data: validated }
  } catch (error) {
    console.error('🚨 [AI Photoshop Dialog] Error handling validation FAILED:', {
      error: error instanceof Error ? error.message : 'Unknown validation error',
      receivedData: typeof input === 'object' ?
        JSON.stringify(input, null, 2).slice(0, 300) + '...' :
        String(input)
    })
    return { success: false, error }
  }
}

// ================== DEFAULT CONFIGURATIONS ==================

/**
 * Default dialog state configuration
 */
export const DEFAULT_DIALOG_STATE: Partial<DialogState> = {
  currentState: 'idle',
  isActive: false,
  totalInteractions: 0,
  generatedResults: []
}

/**
 * Default session preferences
 */
export const DEFAULT_SESSION_PREFERENCES = {
  language: 'ru' as const,
  autoSaveResults: true
}

/**
 * Default error recovery configuration
 */
export const DEFAULT_ERROR_RECOVERY = {
  isRecoverable: true,
  retryCount: 0,
  maxRetries: 3
}

/**
 * State transition validation rules
 */
export const VALID_STATE_TRANSITIONS = {
  'idle': ['awaiting_input'],
  'awaiting_input': ['processing', 'error'],
  'processing': ['showing_results', 'error'],
  'showing_results': ['awaiting_choice', 'awaiting_input', 'idle'],
  'awaiting_choice': ['processing', 'awaiting_input', 'idle', 'error'],
  'error': ['idle', 'awaiting_input']
} as const
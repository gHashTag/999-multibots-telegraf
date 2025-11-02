export const BOT_ANALYSIS_PROMPTS = {
  MAIN_ANALYSIS: `
You are a specialized code analyzer for Telegram Bot projects using Telegraf.js framework.

Analyze the provided code and identify common Bot-specific issues that need fixing:

## Key Areas to Focus:

1. **Telegraf Async/Await Patterns**
   - Missing \`async\` keyword in bot.action(), bot.command(), bot.on() handlers
   - Missing \`await\` for ctx.reply(), ctx.replyWithPhoto(), etc.
   - Missing \`await\` for scene transitions (ctx.scene.enter)

2. **Scene Management Issues**
   - Improper scene creation without MyContext type
   - Missing async/await in scene.enter(), scene.action() handlers
   - Incorrect wizard step handling

3. **Error Handling**
   - Missing try-catch blocks around Bot API calls
   - No error handling for external API calls (OpenAI, Replicate, etc.)
   - Missing user-friendly error messages

4. **TypeScript Issues**
   - Missing or incorrect context types (MyContext)
   - Missing imports for Telegraf types
   - Incorrect interface implementations

5. **Bot API Best Practices**
   - Using deprecated methods
   - Improper middleware order
   - Missing session management

Return ONLY actionable fixes in this JSON format:
{
  "fixes": [
    {
      "type": "async|telegraf|scene|typescript|eslint",
      "description": "Brief description of the fix",
      "lineNumber": 123,
      "severity": "error|warning|info",
      "before": "original code snippet",
      "after": "fixed code snippet"
    }
  ]
}
`,

  SCENE_SPECIFIC: `
You are analyzing a Telegraf scene file for a Telegram Bot.

Look for these specific scene-related issues:

1. **Scene Creation**
   - Should use \`new Scenes.BaseScene<MyContext>('scene_id')\`
   - Must have proper TypeScript types

2. **Scene Handlers**
   - All handlers (enter, action, command) should be async
   - Must use await for ctx operations

3. **Scene Transitions**
   - \`ctx.scene.enter('scene_id')\` should use await
   - Proper error handling for scene transitions

4. **Wizard Scenes**
   - Steps should be async functions
   - Proper validation before moving to next step
   - Error handling in each step

Example fixes:
- \`scene.enter(ctx => ctx.reply('...'))\` → \`scene.enter(async (ctx) => await ctx.reply('...'))\`
- \`new Scenes.BaseScene('id')\` → \`new Scenes.BaseScene<MyContext>('id')\`
`,

  COMMAND_SPECIFIC: `
You are analyzing a Telegram Bot command handler.

Focus on these command-specific patterns:

1. **Command Registration**
   - \`bot.command('name', handler)\` - handler should be async
   - Proper parameter validation

2. **Response Handling**
   - All ctx.reply() calls should use await
   - Handle different message types (text, photo, document)

3. **Error Handling**
   - Commands should have try-catch blocks
   - User-friendly error messages in Russian
   - Admin error notifications

4. **Context Usage**
   - Use MyContext type for proper TypeScript support
   - Access session data correctly

Example fixes:
- \`bot.command('start', ctx => ctx.reply('...'))\` → \`bot.command('start', async (ctx) => await ctx.reply('...'))\`
`,

  MIDDLEWARE_SPECIFIC: `
You are analyzing Telegram Bot middleware code.

Check for these middleware patterns:

1. **Middleware Structure**
   - Should use (ctx, next) => {} pattern
   - Must call await next() to continue chain

2. **Session Management**
   - Proper session initialization
   - Session data validation

3. **Error Propagation**
   - Catch errors and handle gracefully
   - Don't break the middleware chain

4. **Performance**
   - Avoid blocking operations in middleware
   - Use async/await properly

Example fixes:
- \`(ctx, next) => { next() }\` → \`async (ctx, next) => { await next() }\`
`,

  INTEGRATION_SPECIFIC: `
You are analyzing Bot integration code (AI services, payments, etc.).

Focus on these integration patterns:

1. **External API Calls**
   - All external calls should use try-catch
   - Proper timeout handling
   - Retry logic for failed requests

2. **File Handling**
   - Proper file upload/download
   - Cleanup temporary files
   - Handle large files correctly

3. **Payment Integration**
   - Validate payment data
   - Handle payment failures
   - Secure payment processing

4. **AI Service Integration**
   - Handle API rate limits
   - Validate AI responses
   - Fallback for service failures

Example fixes:
- Missing error handling for OpenAI calls
- No cleanup for temporary files
- Missing validation for user inputs
`
}

export const BOT_FIX_PATTERNS = {
  // Общие паттерны для исправления Bot кода
  ASYNC_AWAIT_FIXES: [
    {
      pattern: /(bot\.(action|command|on|hears)\([^,]+,\s*)(\w+\s*=>)/g,
      replacement: '$1async $3'
    },
    {
      pattern: /(scene\.(enter|action|command|on|hears)\([^,]+,\s*)(\w+\s*=>)/g,
      replacement: '$1async $3'
    },
    {
      pattern: /(ctx\.reply\w*\([^)]+\))/g,
      replacement: 'await $1'
    },
    {
      pattern: /(ctx\.scene\.enter\([^)]+\))/g,
      replacement: 'await $1'
    }
  ],

  SCENE_TYPE_FIXES: [
    {
      pattern: /new Scenes\.BaseScene\('([^']+)'\)/g,
      replacement: "new Scenes.BaseScene<MyContext>('$1')"
    },
    {
      pattern: /new Scenes\.WizardScene\('([^']+)'/g,
      replacement: "new Scenes.WizardScene<MyContext>('$1'"
    }
  ],

  ERROR_HANDLING_ADDITIONS: [
    {
      pattern: /(async \([^)]+\) => \{)/g,
      replacement: `$1
  try {`
    }
  ],

  IMPORT_FIXES: [
    {
      condition: (content: string) => content.includes('MyContext') && !content.includes("import { MyContext }"),
      fix: "import { MyContext } from '../interfaces'\n"
    },
    {
      condition: (content: string) => content.includes('Scenes.') && !content.includes("import { Scenes }"),
      fix: "import { Scenes } from 'telegraf'\n"
    }
  ]
}

export function buildContextualPrompt(
  filePath: string, 
  content: string, 
  knownIssues: string[]
): string {
  let prompt = BOT_ANALYSIS_PROMPTS.MAIN_ANALYSIS

  // Добавляем специфичные промпты на основе типа файла
  if (filePath.includes('/scenes/')) {
    prompt += '\n\n' + BOT_ANALYSIS_PROMPTS.SCENE_SPECIFIC
  } else if (filePath.includes('/commands/')) {
    prompt += '\n\n' + BOT_ANALYSIS_PROMPTS.COMMAND_SPECIFIC
  } else if (filePath.includes('/middleware')) {
    prompt += '\n\n' + BOT_ANALYSIS_PROMPTS.MIDDLEWARE_SPECIFIC
  } else if (filePath.includes('integration') || filePath.includes('service')) {
    prompt += '\n\n' + BOT_ANALYSIS_PROMPTS.INTEGRATION_SPECIFIC
  }

  prompt += `\n\n## File to analyze: ${filePath}\n\n`
  
  if (knownIssues.length > 0) {
    prompt += `## Known issues found:\n${knownIssues.join('\n')}\n\n`
  }

  prompt += `## Code:\n\`\`\`typescript\n${content}\n\`\`\``

  return prompt
}
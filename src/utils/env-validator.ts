#!/usr/bin/env bun

/**
 * Environment Variable Validation and Secure Secrets Management
 * Validates production environment configuration and manages secrets securely
 */

import { z } from 'zod'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Environment validation schema
const ProductionEnvSchema = z.object({
  // Core environment
  NODE_ENV: z.literal('production'),
  
  // Webhook configuration
  WEBHOOK_DOMAIN: z.string().url().or(z.string().regex(/^https?:\/\/.+/)),
  WEBHOOK_PATH: z.string().default('/webhook'),
  WEBHOOK_PROTOCOL: z.enum(['http', 'https']).optional(),
  
  // Bot tokens (at least one required)
  BOT_TOKEN_1: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
  BOT_TOKEN_2: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_3: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_4: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_5: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_6: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_7: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_8: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_9: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_10: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  
  // Test bot configuration (should be empty in production)
  TEST_BOT_NAME: z.string().optional().transform(val => val || undefined),
  BOT_TOKEN_TEST_1: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  BOT_TOKEN_TEST_2: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/).optional(),
  
  // Optional API configurations
  OPENAI_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  
  // Security configurations
  BOT_FARM_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  
  // Monitoring and alerts
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_EMAIL: z.string().email().optional(),
})

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  secrets: string[]
  recommendations: string[]
}

interface SecretInfo {
  name: string
  value: string
  masked: string
  type: 'bot_token' | 'api_key' | 'webhook_secret' | 'other'
  required: boolean
}

class EnvironmentValidator {
  private secrets: SecretInfo[] = []
  
  /**
   * Validate environment variables against production schema
   */
  validateEnvironment(): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      secrets: [],
      recommendations: []
    }
    
    try {
      // Parse environment variables
      const envVars = this.loadEnvironmentVariables()
      const validatedEnv = ProductionEnvSchema.parse(envVars)
      
      console.log('✅ Environment validation passed')
      
      // Additional validations
      this.validateBotTokens(envVars, result)
      this.validateWebhookConfiguration(validatedEnv, result)
      this.validateSecuritySettings(envVars, result)
      this.validateTestModeDisabled(validatedEnv, result)
      
      // Collect secrets
      this.collectSecrets(envVars)
      result.secrets = this.secrets.map(s => s.name)
      
    } catch (error) {
      result.valid = false
      
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          result.errors.push(`${issue.path.join('.')}: ${issue.message}`)
        }
      } else {
        result.errors.push(`Validation error: ${error}`)
      }
    }
    
    return result
  }
  
  /**
   * Load environment variables from various sources
   */
  private loadEnvironmentVariables(): Record<string, any> {
    const envVars: Record<string, any> = { ...process.env }
    
    // Load from .env file if exists
    const envFilePath = join(process.cwd(), '.env')
    if (existsSync(envFilePath)) {
      const envContent = readFileSync(envFilePath, 'utf-8')
      const envLines = envContent.split('\n')
      
      for (const line of envLines) {
        const trimmedLine = line.trim()
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=')
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim()
          }
        }
      }
    }
    
    return envVars
  }
  
  /**
   * Validate bot token configuration
   */
  private validateBotTokens(envVars: Record<string, any>, result: ValidationResult): void {
    const botTokens = []
    
    for (let i = 1; i <= 10; i++) {
      const tokenKey = `BOT_TOKEN_${i}`
      const token = envVars[tokenKey]
      
      if (token) {
        botTokens.push({ key: tokenKey, token })
      }
    }
    
    if (botTokens.length === 0) {
      result.errors.push('No bot tokens configured')
      result.valid = false
    } else if (botTokens.length < 3) {
      result.warnings.push(`Only ${botTokens.length} bot tokens configured, consider adding more for redundancy`)
    }
    
    // Validate token format and uniqueness
    const tokenValues = new Set()
    for (const { key, token } of botTokens) {
      if (tokenValues.has(token)) {
        result.errors.push(`Duplicate bot token found: ${key}`)
        result.valid = false
      }
      tokenValues.add(token)
      
      // Validate token format
      if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(token)) {
        result.warnings.push(`Bot token ${key} may have invalid format`)
      }
    }
    
    console.log(`✅ Found ${botTokens.length} bot tokens`)
  }
  
  /**
   * Validate webhook configuration
   */
  private validateWebhookConfiguration(env: any, result: ValidationResult): void {
    // Check webhook domain accessibility
    if (env.WEBHOOK_DOMAIN) {
      const domain = env.WEBHOOK_DOMAIN.replace(/^https?:\/\//, '')
      
      if (domain.includes('localhost') || domain.includes('127.0.0.1')) {
        result.errors.push('Webhook domain cannot be localhost in production')
        result.valid = false
      }
      
      if (env.WEBHOOK_DOMAIN.startsWith('https://') && domain === 'test-render-farm.ru') {
        result.warnings.push('Domain test-render-farm.ru may not support HTTPS - consider using HTTP')
      }
    }
    
    console.log('✅ Webhook configuration validated')
  }
  
  /**
   * Validate security settings
   */
  private validateSecuritySettings(envVars: Record<string, any>, result: ValidationResult): void {
    // Check for webhook secrets
    const webhookSecrets = [
      'BOT_FARM_WEBHOOK_SECRET',
      'GITHUB_WEBHOOK_SECRET',
      'REPLICATE_WEBHOOK_SECRET'
    ]
    
    let secretCount = 0
    for (const secretKey of webhookSecrets) {
      if (envVars[secretKey]) {
        secretCount++
      }
    }
    
    if (secretCount === 0) {
      result.warnings.push('No webhook secrets configured - consider adding for enhanced security')
    }
    
    // Check for sensitive data in non-secret variables
    for (const [key, value] of Object.entries(envVars)) {
      if (typeof value === 'string') {
        if (value.includes('password') || value.includes('secret')) {
          if (!key.includes('SECRET') && !key.includes('KEY') && !key.includes('TOKEN')) {
            result.warnings.push(`Variable ${key} may contain sensitive data`)
          }
        }
      }
    }
    
    console.log('✅ Security settings validated')
  }
  
  /**
   * Validate test mode is properly disabled
   */
  private validateTestModeDisabled(env: any, result: ValidationResult): void {
    if (env.TEST_BOT_NAME) {
      result.errors.push('TEST_BOT_NAME must be empty in production')
      result.valid = false
    }
    
    if (env.BOT_TOKEN_TEST_1 || env.BOT_TOKEN_TEST_2) {
      result.warnings.push('Test bot tokens are present but should not be used in production')
    }
    
    console.log('✅ Test mode validation completed')
  }
  
  /**
   * Collect and categorize secrets
   */
  private collectSecrets(envVars: Record<string, any>): void {
    this.secrets = []
    
    for (const [key, value] of Object.entries(envVars)) {
      if (typeof value !== 'string' || !value) continue
      
      let secretType: SecretInfo['type'] = 'other'
      let required = false
      
      if (key.startsWith('BOT_TOKEN')) {
        secretType = 'bot_token'
        required = key === 'BOT_TOKEN_1'
      } else if (key.includes('API_KEY')) {
        secretType = 'api_key'
      } else if (key.includes('SECRET')) {
        secretType = 'webhook_secret'
      }
      
      if (secretType !== 'other') {
        this.secrets.push({
          name: key,
          value: value,
          masked: this.maskSecret(value),
          type: secretType,
          required
        })
      }
    }
  }
  
  /**
   * Mask secret values for safe logging
   */
  private maskSecret(value: string): string {
    if (value.length <= 8) {
      return '*'.repeat(value.length)
    }
    
    const visibleStart = Math.min(4, Math.floor(value.length * 0.1))
    const visibleEnd = Math.min(4, Math.floor(value.length * 0.1))
    
    return (
      value.substring(0, visibleStart) +
      '*'.repeat(value.length - visibleStart - visibleEnd) +
      value.substring(value.length - visibleEnd)
    )
  }
  
  /**
   * Generate secure environment file template
   */
  generateEnvTemplate(): string {
    return `# Production Environment Configuration
# Generated by Environment Validator

# Core Settings
NODE_ENV=production

# Webhook Configuration
WEBHOOK_DOMAIN=http://test-render-farm.ru
WEBHOOK_PATH=/webhook

# Bot Tokens (Required)
BOT_TOKEN_1=1234567890:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
BOT_TOKEN_2=
BOT_TOKEN_3=
BOT_TOKEN_4=
BOT_TOKEN_5=
BOT_TOKEN_6=
BOT_TOKEN_7=
BOT_TOKEN_8=
BOT_TOKEN_9=
BOT_TOKEN_10=

# Test Bot Configuration (Keep empty in production)
TEST_BOT_NAME=
BOT_TOKEN_TEST_1=
BOT_TOKEN_TEST_2=

# API Keys (Optional)
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# Webhook Secrets (Recommended)
BOT_FARM_WEBHOOK_SECRET=
GITHUB_WEBHOOK_SECRET=

# Monitoring and Alerts (Optional)
ALERT_WEBHOOK_URL=
ALERT_EMAIL=

# Generated on: ${new Date().toISOString()}
`
  }
  
  /**
   * Audit secrets for security issues
   */
  auditSecrets(): { issues: string[], recommendations: string[] } {
    const issues: string[] = []
    const recommendations: string[] = []
    
    for (const secret of this.secrets) {
      // Check for weak tokens
      if (secret.type === 'bot_token') {
        if (secret.value.length < 45) {
          issues.push(`Bot token ${secret.name} appears to be too short`)
        }
        
        if (!/^\d+:[A-Za-z0-9_-]{35}$/.test(secret.value)) {
          issues.push(`Bot token ${secret.name} has invalid format`)
        }
      }
      
      // Check for common patterns
      if (secret.value.includes('test') || secret.value.includes('demo')) {
        issues.push(`Secret ${secret.name} may be a test/demo value`)
      }
      
      if (secret.value === secret.value.toLowerCase() && secret.type === 'webhook_secret') {
        recommendations.push(`Webhook secret ${secret.name} should include mixed case characters`)
      }
    }
    
    return { issues, recommendations }
  }
}

// CLI Interface
class EnvironmentValidatorCLI {
  private validator = new EnvironmentValidator()
  
  async run(args: string[]): Promise<void> {
    const command = args[0] || 'validate'
    
    switch (command) {
      case 'validate':
        await this.validateCommand()
        break
        
      case 'template':
        await this.templateCommand()
        break
        
      case 'audit':
        await this.auditCommand()
        break
        
      case 'help':
        this.showHelp()
        break
        
      default:
        console.error(`❌ Unknown command: ${command}`)
        this.showHelp()
        process.exit(1)
    }
  }
  
  private async validateCommand(): Promise<void> {
    console.log('🔍 Validating Production Environment')
    console.log('===================================')
    
    const result = this.validator.validateEnvironment()
    
    // Show validation results
    if (result.valid) {
      console.log('✅ Environment validation passed')
    } else {
      console.log('❌ Environment validation failed')
    }
    
    // Show errors
    if (result.errors.length > 0) {
      console.log('\n🚨 Errors:')
      for (const error of result.errors) {
        console.log(`  ❌ ${error}`)
      }
    }
    
    // Show warnings
    if (result.warnings.length > 0) {
      console.log('\n⚠️ Warnings:')
      for (const warning of result.warnings) {
        console.log(`  ⚠️ ${warning}`)
      }
    }
    
    // Show secret summary
    if (result.secrets.length > 0) {
      console.log(`\n🔐 Found ${result.secrets.length} secrets`)
    }
    
    // Show recommendations
    if (result.recommendations.length > 0) {
      console.log('\n💡 Recommendations:')
      for (const rec of result.recommendations) {
        console.log(`  💡 ${rec}`)
      }
    }
    
    if (!result.valid) {
      process.exit(1)
    }
  }
  
  private async templateCommand(): Promise<void> {
    console.log('📝 Generating Environment Template')
    console.log('=================================')
    
    const template = this.validator.generateEnvTemplate()
    const templatePath = join(process.cwd(), '.env.template')
    
    writeFileSync(templatePath, template)
    console.log(`✅ Template written to: ${templatePath}`)
  }
  
  private async auditCommand(): Promise<void> {
    console.log('🔒 Auditing Secrets Security')
    console.log('============================')
    
    // First validate to collect secrets
    this.validator.validateEnvironment()
    
    const audit = this.validator.auditSecrets()
    
    if (audit.issues.length > 0) {
      console.log('\n🚨 Security Issues:')
      for (const issue of audit.issues) {
        console.log(`  ❌ ${issue}`)
      }
    }
    
    if (audit.recommendations.length > 0) {
      console.log('\n💡 Security Recommendations:')
      for (const rec of audit.recommendations) {
        console.log(`  💡 ${rec}`)
      }
    }
    
    if (audit.issues.length === 0 && audit.recommendations.length === 0) {
      console.log('✅ No security issues found')
    }
  }
  
  private showHelp(): void {
    console.log(`
🔒 Environment Variable Validator

Usage:
  bun run src/utils/env-validator.ts [command]

Commands:
  validate    Validate production environment (default)
  template    Generate .env template file
  audit       Audit secrets for security issues
  help        Show this help

Examples:
  bun run src/utils/env-validator.ts
  bun run src/utils/env-validator.ts validate
  bun run src/utils/env-validator.ts template
  bun run src/utils/env-validator.ts audit
`)
  }
}

// Main execution
if (import.meta.main) {
  const cli = new EnvironmentValidatorCLI()
  cli.run(process.argv.slice(2)).catch(error => {
    console.error('❌ CLI Error:', error)
    process.exit(1)
  })
}
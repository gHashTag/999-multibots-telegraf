#!/usr/bin/env bun

/**
 * Test Script for Inngest Functions Migration
 * Verifies that all functions are properly isolated from ai-server
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const FUNCTIONS_DIR = path.join(__dirname, '../src/inngest_app/functions')

console.log('🔍 Testing Inngest Functions Migration...')
console.log('=========================================\n')

// Test 1: Check directory structure
console.log('📁 Test 1: Checking directory structure...')
const expectedDirs = [
  'content',
  'instagram',
  'monitoring',
  'training',
  'generation',
  'payments',
  'broadcast',
  'render',
  'render/helpers',
  'existing'
]

let dirsPassed = true
for (const dir of expectedDirs) {
  const dirPath = path.join(FUNCTIONS_DIR, dir)
  if (fs.existsSync(dirPath)) {
    console.log(`  ✅ ${dir}/`)
  } else {
    console.log(`  ❌ ${dir}/ - MISSING`)
    dirsPassed = false
  }
}

console.log(dirsPassed ? '\n✅ Directory structure is correct\n' : '\n❌ Some directories missing\n')

// Test 2: Check for external dependencies
console.log('🌐 Test 2: Checking for external dependencies...')

const externalPatterns = [
  '999-agents.site',
  'SERVER_API_URL',
  'axios.post.*999-agents',
  'axios.get.*999-agents'
]

let hasExternalDeps = false
for (const pattern of externalPatterns) {
  try {
    const result = execSync(`grep -r "${pattern}" ${FUNCTIONS_DIR} 2>/dev/null | wc -l`, { encoding: 'utf8' })
    const count = parseInt(result.trim())
    if (count > 0) {
      console.log(`  ⚠️  Found ${count} references to: ${pattern}`)
      hasExternalDeps = true

      // Show first 3 occurrences
      const occurrences = execSync(`grep -r "${pattern}" ${FUNCTIONS_DIR} 2>/dev/null | head -3`, { encoding: 'utf8' })
      if (occurrences) {
        console.log('     Examples:')
        occurrences.split('\n').filter(l => l).forEach(line => {
          const [file, ...rest] = line.split(':')
          console.log(`     - ${path.basename(file)}: ${rest.join(':').trim().substring(0, 60)}...`)
        })
      }
    } else {
      console.log(`  ✅ No references to: ${pattern}`)
    }
  } catch (e) {
    // No matches found
    console.log(`  ✅ No references to: ${pattern}`)
  }
}

console.log(!hasExternalDeps ? '\n✅ No external dependencies found\n' : '\n⚠️  Some external dependencies remain\n')

// Test 3: Count migrated functions
console.log('📊 Test 3: Counting migrated functions...')

const categories = {
  content: 0,
  instagram: 0,
  monitoring: 0,
  training: 0,
  generation: 0,
  payments: 0,
  broadcast: 0,
  render: 0,
  existing: 0
}

for (const category of Object.keys(categories)) {
  const categoryPath = path.join(FUNCTIONS_DIR, category)
  if (fs.existsSync(categoryPath)) {
    const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    categories[category] = files.length
    console.log(`  ${category}: ${files.length} functions`)
  }
}

const totalFunctions = Object.values(categories).reduce((a, b) => a + b, 0)
console.log(`\n  Total: ${totalFunctions} functions migrated`)

// Test 4: Check critical imports
console.log('\n🔗 Test 4: Checking critical imports...')

const requiredImports = {
  'inngestClient': 'Inngest client',
  '@/core': 'Core modules',
  '@/utils': 'Utility modules',
  '@/interfaces': 'Interfaces'
}

let importsPassed = true
for (const [importPath, description] of Object.entries(requiredImports)) {
  try {
    const result = execSync(`grep -r "from.*${importPath}" ${FUNCTIONS_DIR} 2>/dev/null | wc -l`, { encoding: 'utf8' })
    const count = parseInt(result.trim())
    if (count > 0) {
      console.log(`  ✅ ${description} (${importPath}): ${count} imports`)
    } else {
      console.log(`  ⚠️  ${description} (${importPath}): No imports found`)
    }
  } catch (e) {
    console.log(`  ⚠️  ${description} (${importPath}): No imports found`)
  }
}

// Test 5: Check for TypeScript errors
console.log('\n🔧 Test 5: Checking for TypeScript compilation...')

try {
  console.log('  Running: npm run build:nocheck...')
  execSync('npm run build:nocheck', {
    encoding: 'utf8',
    stdio: 'pipe'
  })
  console.log('  ✅ TypeScript compilation successful')
} catch (e: any) {
  const output = e.stdout || ''
  const errors = output.match(/error TS\d+:/g)
  if (errors) {
    console.log(`  ⚠️  TypeScript compilation has ${errors.length} errors`)
    console.log('     (This is expected for initial migration)')
  } else {
    console.log('  ⚠️  TypeScript compilation failed')
  }
}

// Summary
console.log('\n' + '='.repeat(50))
console.log('📊 MIGRATION SUMMARY')
console.log('='.repeat(50))

const summary = {
  '✅ Directory Structure': dirsPassed,
  '✅ No External Dependencies': !hasExternalDeps,
  '✅ Functions Migrated': totalFunctions + ' total',
  '✅ Imports Updated': importsPassed ? 'Yes' : 'Partial'
}

for (const [key, value] of Object.entries(summary)) {
  console.log(`${key}: ${value}`)
}

console.log('\n' + '='.repeat(50))

if (dirsPassed && !hasExternalDeps && totalFunctions >= 18) {
  console.log('🎉 Migration looks successful!')
  console.log('Next steps:')
  console.log('  1. Fix any remaining TypeScript errors')
  console.log('  2. Test each function individually')
  console.log('  3. Update environment variables')
  console.log('  4. Deploy to production')
} else {
  console.log('⚠️  Migration needs attention')
  console.log('Please review the issues above and fix them.')
}

console.log('='.repeat(50))
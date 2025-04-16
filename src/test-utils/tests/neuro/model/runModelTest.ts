import { TestRunner } from '../../../core/TestRunner'
import './createModelTraining.test'

console.log('🚀 Starting Model Training Tests...')

const runner = new TestRunner('Model Training Test Runner')
runner.run().then(() => {
  console.log('✅ Tests completed')
  process.exit(0)
}).catch(error => {
  console.error('❌ Tests failed:', error)
  process.exit(1)
}) 
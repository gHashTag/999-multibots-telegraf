import { TestRunner } from '../core/TestRunner'
import assert from '../core/assert'

console.log('🚀 Starting Simple Test...')

const testRunner = new TestRunner('Simple Test')

testRunner.test('Simple addition test', () => {
  console.log('Running addition test')
  assert.isTrue(2 + 2 === 4, '2 + 2 should equal 4')
  console.log('Addition test completed')
})

console.log('Running all tests...')
testRunner.run()
console.log('All tests completed!') 
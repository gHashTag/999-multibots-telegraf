import { inngest } from '@/inngest-functions/clients'
import { balanceNotifierScheduledTask } from '@/inngest-functions/balanceNotifier'
import { BalanceNotifierService } from '@/services/balanceNotifierService'
import { logger } from '@/utils/logger'
import { TestResult } from '@/test-utils/core/types'
import { TestCategory } from '@/test-utils/core/categories'
import mockApi from '@/test-utils/core/mock'
import assert from '@/test-utils/core/assert'
import { InngestTestEngine } from '@/test-utils/inngest/inngest-test-engine'

/**
 * Test the balance notifier scheduled function
 */
export async function testBalanceNotifierScheduledTask(): Promise<TestResult> {
  const testName = 'Inngest: balanceNotifierScheduledTask'
  
  try {
    // Setup test environment
    const engine = new InngestTestEngine()
    
    // Register the balance notifier function with the engine
    engine.register('balance.notifications.daily', balanceNotifierScheduledTask)
    
    // Get bot names from environment or use test defaults
    const getBotNames = (): string[] => {
      // For testing, always use these three bots to ensure consistency
      return ['main', 'MetaMuse_Manifest_bot', 'neuro_blogger_bot']
    }
    
    // Override the function that gets bot names for the test
    const originalGetBotNames = process.env.BALANCE_NOTIFICATION_BOTS
    process.env.BALANCE_NOTIFICATION_BOTS = 'main,MetaMuse_Manifest_bot,neuro_blogger_bot'
    
    // Clear any previous mock calls
    mockApi.method(BalanceNotifierService, 'checkAllUsersBalances').mockClear()
    
    // Mock the BalanceNotifierService.checkAllUsersBalances method
    const mockCheckAllUsersBalances = mockApi.method(BalanceNotifierService, 'checkAllUsersBalances', async (botName: string) => {
      if (botName === 'main') {
        return { checked: 10, notified: 3 };
      } else if (botName === 'MetaMuse_Manifest_bot') {
        return { checked: 5, notified: 1 };
      } else if (botName === 'neuro_blogger_bot') {
        return { checked: 3, notified: 0 };
      } else {
        return { checked: 0, notified: 0 };
      }
    })
    
    // Create an event to trigger the scheduled function
    const event = {
      name: 'balance.notifications.daily',
      data: {} // Empty data for scheduled cron event
    }
    
    // Send the event to the engine
    const result = await engine.send(event)
    
    // Restore original environment variable
    if (originalGetBotNames === undefined) {
      delete process.env.BALANCE_NOTIFICATION_BOTS
    } else {
      process.env.BALANCE_NOTIFICATION_BOTS = originalGetBotNames
    }
    
    // Verify results
    assert.isTrue(result.success, `${testName} - Function should execute successfully`)
    
    // Get the calls to checkAllUsersBalances
    const calls = mockCheckAllUsersBalances.mock.calls
    
    // Check that there were exactly 3 calls
    assert.equal(calls.length, 3, `${testName} - checkAllUsersBalances should be called 3 times`)
    
    // Verify the bot names passed to checkAllUsersBalances
    const botNames = calls.map(call => call[0]).sort()
    assert.deepEqual(botNames, ['MetaMuse_Manifest_bot', 'main', 'neuro_blogger_bot'].sort(), 
      `${testName} - checkAllUsersBalances should be called for all 3 bots`)
    
    // Verify that each bot was called once
    assert.equal(
      calls.filter(call => call[0] === 'main').length, 
      1, 
      `${testName} - checkAllUsersBalances should be called once for 'main' bot`
    )
    
    assert.equal(
      calls.filter(call => call[0] === 'MetaMuse_Manifest_bot').length, 
      1, 
      `${testName} - checkAllUsersBalances should be called once for 'MetaMuse_Manifest_bot' bot`
    )
    
    assert.equal(
      calls.filter(call => call[0] === 'neuro_blogger_bot').length, 
      1, 
      `${testName} - checkAllUsersBalances should be called once for 'neuro_blogger_bot' bot`
    )
    
    // Check the function result
    if (result.event?.result) {
      const functionResult = result.event.result
      
      // Verify the totals
      assert.equal(functionResult.totalCheckedUsers, 18, `${testName} - Total checked users should be 18`)
      assert.equal(functionResult.totalNotifiedUsers, 4, `${testName} - Total notified users should be 4`)
    } else {
      throw new Error('Function result not found in event data')
    }
    
    return { 
      name: testName, 
      success: true, 
      message: 'Balance notifier scheduled task test passed'
    }
    
  } catch (error: any) {
    logger.error('❌ Balance notifier scheduled task test failed', {
      description: 'Test failed with error',
      error: error instanceof Error ? error.message : String(error),
    })
    
    return { 
      name: testName, 
      success: false, 
      message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

// Add metadata to the test
testBalanceNotifierScheduledTask.meta = { category: TestCategory.Inngest }

/**
 * Test the balance notifier scheduled function with error handling
 */
export async function testBalanceNotifierWithError(): Promise<TestResult> {
  const testName = 'Inngest: balanceNotifierScheduledTask with error handling'
  
  try {
    // Setup test environment
    const engine = new InngestTestEngine()
    
    // Register the balance notifier function with the engine
    engine.register('balance.notifications.daily', balanceNotifierScheduledTask)
    
    // Mock the BalanceNotifierService.checkAllUsersBalances method with one failed bot
    mockApi.method(BalanceNotifierService, 'checkAllUsersBalances', async (botName: string) => {
      if (botName === 'main') {
        return { checked: 10, notified: 3 };
      } else if (botName === 'MetaMuse_Manifest_bot') {
        // Simulate an error with this bot
        throw new Error('Simulated error checking balances');
      } else if (botName === 'neuro_blogger_bot') {
        return { checked: 3, notified: 0 };
      } else {
        return { checked: 0, notified: 0 };
      }
    })
    
    // Create an event to trigger the scheduled function
    const event = {
      name: 'balance.notifications.daily',
      data: {} // Empty data for scheduled cron event
    }
    
    // Send the event to the engine
    const result = await engine.send(event)
    
    // Function should still succeed overall, even with one bot failure
    assert.isTrue(result.success, `${testName} - Function should execute successfully despite a bot error`)
    
    // Verify that checkAllUsersBalances was called for each bot
    assert.equal(mockApi.method(BalanceNotifierService, 'checkAllUsersBalances').mock.calls.length, 3, 
      `${testName} - checkAllUsersBalances should be called 3 times`)
    
    // Check the function result
    if (result.event?.result) {
      const functionResult = result.event.result
      
      // Verify the totals (should only include successful bots)
      assert.equal(functionResult.totalCheckedUsers, 13, `${testName} - Total checked users should be 13 (excludes failed bot)`)
      assert.equal(functionResult.totalNotifiedUsers, 3, `${testName} - Total notified users should be 3 (excludes failed bot)`)
      
      // Verify error tracking
      assert.equal(functionResult.failedBots, 1, `${testName} - Should report 1 failed bot`)
      assert.equal(functionResult.successfulBots, 2, `${testName} - Should report 2 successful bots`)
      assert.isTrue(Array.isArray(functionResult.errors), `${testName} - Should include errors array`)
      assert.isTrue(functionResult.errors.length > 0, `${testName} - Should have at least one error`)
    } else {
      throw new Error('Function result not found in event data')
    }
    
    return { 
      name: testName, 
      success: true, 
      message: 'Balance notifier error handling test passed'
    }
    
  } catch (error: any) {
    logger.error('❌ Balance notifier error handling test failed', {
      description: 'Test failed with error',
      error: error instanceof Error ? error.message : String(error),
    })
    
    return { 
      name: testName, 
      success: false, 
      message: `Test failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

// Add metadata to the test
testBalanceNotifierWithError.meta = { category: TestCategory.Inngest }

/**
 * Run all balance notifier tests
 * This function can be used to run all tests related to balance notifications
 */
export async function runBalanceNotifierTests(options: { verbose?: boolean } = {}): Promise<TestResult[]> {
  const tests = [
    testBalanceNotifierScheduledTask,
    testBalanceNotifierWithError,
    // Add more balance notifier tests here as they are developed
  ]
  
  const results: TestResult[] = []
  
  for (const test of tests) {
    const result = await test()
    results.push(result)
    
    if (options.verbose) {
      logger.info(`Test: ${result.name}`, {
        description: 'Test result',
        success: result.success,
        message: result.message,
        error: result.error ? String(result.error) : undefined,
      })
    }
  }
  
  const successCount = results.filter(r => r.success).length
  const totalCount = results.length
  
  logger.info(`Balance Notifier Tests: ${successCount}/${totalCount} passed`, {
    description: 'Balance notifier tests summary',
    success_count: successCount,
    total_count: totalCount,
    failed_tests: results.filter(r => !r.success).map(r => r.name),
  })
  
  return results
}

// Export the test as default
export default testBalanceNotifierScheduledTask 
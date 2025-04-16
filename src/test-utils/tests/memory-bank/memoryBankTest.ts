import { TestResult } from '@/test-utils/types'
import { logger } from '@/utils/logger'
import {
  mcp_allpepper_memory_bank_list_project_files,
  mcp_allpepper_memory_bank_list_projects,
  mcp_allpepper_memory_bank_memory_bank_read,
  mcp_allpepper_memory_bank_memory_bank_update,
  mcp_allpepper_memory_bank_memory_bank_write,
} from '@/core/mcp/agent/memory-bank/types'

export async function runMemoryBankTest(): Promise<TestResult> {
  try {
    logger.info('🚀 Starting Memory Bank test...')

    // Write test
    await mcp_allpepper_memory_bank_memory_bank_write({
      projectName: 'test-project',
      fileName: 'test.md',
      content: 'Test content',
    })
    logger.info('✅ Write test completed')

    // Read test
    const content = await mcp_allpepper_memory_bank_memory_bank_read({
      projectName: 'test-project',
      fileName: 'test.md',
    })
    if (content !== 'Test content') {
      throw new Error('Content mismatch')
    }
    logger.info('✅ Read test completed')

    // Update test
    await mcp_allpepper_memory_bank_memory_bank_update({
      projectName: 'test-project',
      fileName: 'test.md',
      content: 'Updated content',
    })
    const updatedContent = await mcp_allpepper_memory_bank_memory_bank_read({
      projectName: 'test-project',
      fileName: 'test.md',
    })
    if (updatedContent !== 'Updated content') {
      throw new Error('Updated content mismatch')
    }
    logger.info('✅ Update test completed')

    // List projects test
    const projects = await mcp_allpepper_memory_bank_list_projects({
      random_string: 'test',
    })
    if (!projects.includes('test-project')) {
      throw new Error('Project not found')
    }
    logger.info('✅ List projects test completed')

    // List files test
    const files = await mcp_allpepper_memory_bank_list_project_files({
      projectName: 'test-project',
    })
    if (!files.includes('test.md')) {
      throw new Error('File not found')
    }
    logger.info('✅ List files test completed')

    logger.info('🎉 All Memory Bank tests passed successfully!')
    return {
      success: true,
      message: 'Memory Bank tests completed successfully',
      name: 'Memory Bank Test',
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    logger.error(`❌ Memory Bank test failed: ${errorMessage}`)
    return {
      success: false,
      message: `Memory Bank test failed: ${errorMessage}`,
      name: 'Memory Bank Test',
    }
  }
}

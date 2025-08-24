import express, { Router } from 'express'
import { logger } from '@/utils/logger'

const router = Router()

/**
 * Mock Dart AI API endpoints for development and testing
 * These endpoints simulate the Dart AI Task Manager API
 */

// Mock data storage (in production this would be a real database)
const mockSpaces = [
  {
    id: 'default',
    name: 'Default Space',
    description: 'Default workspace for tasks',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]

const mockTasks: any[] = []

// GET /api/dart-ai/spaces - Get all spaces
router.get('/dart-ai/spaces', (req: any, res: any) => {
  try {
    logger.info('🎯 [Dart AI API] GET /spaces')
    res.json({
      success: true,
      data: mockSpaces
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error getting spaces:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// GET /api/dart-ai/tasks/:spaceId - Get all tasks in space
router.get('/dart-ai/tasks/:spaceId', (req: any, res: any) => {
  try {
    const { spaceId } = req.params
    logger.info(`🎯 [Dart AI API] GET /tasks/${spaceId}`)
    
    const spaceTasks = mockTasks.filter(task => task.spaceId === spaceId)
    
    res.json({
      success: true,
      data: spaceTasks
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error getting tasks:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// GET /api/dart-ai/tasks/:spaceId/:taskId - Get specific task
router.get('/dart-ai/tasks/:spaceId/:taskId', (req: any, res: any) => {
  try {
    const { spaceId, taskId } = req.params
    logger.info(`🎯 [Dart AI API] GET /tasks/${spaceId}/${taskId}`)
    
    const task = mockTasks.find(t => t.id === taskId && t.spaceId === spaceId)
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      })
    }
    
    res.json({
      success: true,
      data: task
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error getting task:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// POST /api/dart-ai/tasks/:spaceId - Create new task
router.post('/dart-ai/tasks/:spaceId', (req: any, res: any) => {
  try {
    const { spaceId } = req.params
    const { title, description, priority = 'medium', status = 'todo' } = req.body
    
    logger.info(`🎯 [Dart AI API] POST /tasks/${spaceId} - Creating: ${title}`)
    
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      })
    }
    
    const newTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spaceId,
      title,
      description: description || '',
      priority,
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: null,
      dueDate: null,
      tags: []
    }
    
    mockTasks.push(newTask)
    
    res.status(201).json({
      success: true,
      data: newTask
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error creating task:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// PUT /api/dart-ai/tasks/:spaceId/:taskId - Update task
router.put('/dart-ai/tasks/:spaceId/:taskId', (req: any, res: any) => {
  try {
    const { spaceId, taskId } = req.params
    const updates = req.body
    
    logger.info(`🎯 [Dart AI API] PUT /tasks/${spaceId}/${taskId}`)
    
    const taskIndex = mockTasks.findIndex(t => t.id === taskId && t.spaceId === spaceId)
    
    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      })
    }
    
    mockTasks[taskIndex] = {
      ...mockTasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    
    res.json({
      success: true,
      data: mockTasks[taskIndex]
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error updating task:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// DELETE /api/dart-ai/tasks/:spaceId/:taskId - Delete task
router.delete('/dart-ai/tasks/:spaceId/:taskId', (req: any, res: any) => {
  try {
    const { spaceId, taskId } = req.params
    logger.info(`🎯 [Dart AI API] DELETE /tasks/${spaceId}/${taskId}`)
    
    const taskIndex = mockTasks.findIndex(t => t.id === taskId && t.spaceId === spaceId)
    
    if (taskIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      })
    }
    
    mockTasks.splice(taskIndex, 1)
    
    res.json({
      success: true,
      data: { deleted: true }
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error deleting task:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// POST /api/dart-ai/github-issue - Create task from GitHub issue
router.post('/dart-ai/github-issue', (req: any, res: any) => {
  try {
    const { issue, spaceId = 'default' } = req.body
    
    logger.info(`🎯 [Dart AI API] POST /github-issue - GitHub Issue #${issue?.number}`)
    
    if (!issue || !issue.title) {
      return res.status(400).json({
        success: false,
        error: 'Issue data is required'
      })
    }
    
    const newTask = {
      id: `github_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      spaceId,
      title: `GitHub Issue #${issue.number}: ${issue.title}`,
      description: issue.body || '',
      priority: issue.labels?.includes('high-priority') ? 'high' : 'medium',
      status: 'todo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedTo: null,
      dueDate: null,
      tags: issue.labels || [],
      githubIssue: {
        number: issue.number,
        repository: issue.repository,
        url: `https://github.com/${issue.repository}/issues/${issue.number}`
      }
    }
    
    mockTasks.push(newTask)
    
    res.status(201).json({
      success: true,
      data: newTask
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error creating GitHub task:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

// POST /api/dart-ai/bulk-sync - Bulk synchronization
router.post('/dart-ai/bulk-sync', (req: any, res: any) => {
  try {
    const { tasks = [], spaceId = 'default' } = req.body
    
    logger.info(`🎯 [Dart AI API] POST /bulk-sync - Syncing ${tasks.length} tasks`)
    
    let created = 0
    let updated = 0
    const errors: any[] = []
    
    for (const taskData of tasks) {
      try {
        const newTask = {
          id: `bulk_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          spaceId,
          ...taskData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        mockTasks.push(newTask)
        created++
      } catch (error) {
        errors.push({
          task: taskData,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }
    
    res.json({
      success: true,
      data: {
        created,
        updated,
        errors
      }
    })
  } catch (error) {
    logger.error('❌ [Dart AI API] Error in bulk sync:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    })
  }
})

export default router
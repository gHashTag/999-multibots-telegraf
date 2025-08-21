import { jest } from '@jest/globals'
// Global test setup
// Mock core bot module to prevent actual bot initialization logs
jest.mock('@/core/bot', () => ({
  defaultBot: {},
  bots: [],
  pulseBot: {},
  getBotNameByToken: jest.fn(),
  getTokenByBotName: jest.fn(),
  createBotByName: jest.fn(),
  getBotByName: jest.fn(),
}))

// Глобальные моки и настройки для Jest

// Подавляем вывод логов приложения во время тестов
import logger, { botLogger, securityLogger } from '../../src/utils/logger'

// Suppress console output during tests
jest.spyOn(console, 'log').mockImplementation(() => {})
jest.spyOn(console, 'info').mockImplementation(() => {})
jest.spyOn(console, 'warn').mockImplementation(() => {})
jest.spyOn(console, 'error').mockImplementation(() => {})
// Suppress logger output
jest.spyOn(logger, 'info').mockImplementation(() => {})
jest.spyOn(logger, 'warn').mockImplementation(() => {})
jest.spyOn(logger, 'error').mockImplementation(() => {})
// Suppress botLogger output
jest.spyOn(botLogger, 'info').mockImplementation(() => {})
jest.spyOn(botLogger, 'warn').mockImplementation(() => {})
jest.spyOn(botLogger, 'error').mockImplementation(() => {})
jest.spyOn(botLogger, 'debug').mockImplementation(() => {})
// Suppress securityLogger output
jest.spyOn(securityLogger, 'info').mockImplementation(() => {})
jest.spyOn(securityLogger, 'warn').mockImplementation(() => {})
jest.spyOn(securityLogger, 'error').mockImplementation(() => {})

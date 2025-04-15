/**
 * Core testing utilities index
 * Provides centralized exports for all core testing functionality
 */

// Mock utilities
export * from './mockFunction';
export * from './mockContext';
export * from './mockHelper';

// Test runners and setup
export * from './TestRunner';
export * from './TestDiscovery';
export * from './TestReporter';
export * from './setupTests';
export * from './environment';

// Assertions and utilities
export * from './assertions';
export * from './utils';
export * from './categories';

// Scene testing
export * from './TelegramSceneTester';
export * from './invokeHandler';

// Core functionality
export * from './MockManager';
export * from './SnapshotManager';
export * from './ReportGenerator';

// Test configuration
export * from './config';

// Default exports
export { default as mockFunction } from './mockFunction';
export { default as mockContext } from './mockContext'; 
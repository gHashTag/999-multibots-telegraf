import { describe, it, expect } from '@jest/globals';
import { get100Command, selectModelCommand, priceCommand } from '../../src/commands';

describe('commands index re-exports', () => {
  it('should export get100Command', () => {
    expect(typeof get100Command).toBe('function');
  });

  it('should export selectModelCommand', () => {
    expect(typeof selectModelCommand).toBe('function');
  });

  it('should export priceCommand', () => {
    expect(typeof priceCommand).toBe('function');
  });
});
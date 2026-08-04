import { describe, expect, test } from 'bun:test';
import { makeDecision } from './service';

describe('clarification service exports', () => {
  test('exposes makeDecision as a function', () => {
    expect(typeof makeDecision).toBe('function');
  });
});

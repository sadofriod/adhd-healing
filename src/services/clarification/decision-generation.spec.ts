import { describe, expect, test } from 'bun:test';
import { generateDecisionText } from './decision-generation';

describe('generateDecisionText', () => {
  test('is exported as a function', () => {
    expect(typeof generateDecisionText).toBe('function');
  });
});

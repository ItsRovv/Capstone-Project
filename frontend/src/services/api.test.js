import { apiError } from './api';

describe('apiError', () => {
  test('extracts message from response data', () => {
    const err = { response: { data: { message: 'Email taken' } } };
    expect(apiError(err)).toBe('Email taken');
  });

  test('falls back to err.message', () => {
    const err = { message: 'Network Error' };
    expect(apiError(err)).toBe('Network Error');
  });

  test('falls back to custom default', () => {
    expect(apiError(null, 'Custom fallback')).toBe('Custom fallback');
  });
});

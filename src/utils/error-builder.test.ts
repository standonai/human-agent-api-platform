import { describe, it, expect } from 'vitest';
import { ErrorBuilder, createErrorResponse } from './error-builder.js';
import { ErrorCode } from '../types/errors.js';

describe('ErrorBuilder', () => {
  it('should build a basic error response', () => {
    const response = new ErrorBuilder(
      ErrorCode.INVALID_PARAMETER,
      'Invalid parameter value',
      'req_123'
    ).build();

    expect(response.error).toEqual({
      code: 'INVALID_PARAMETER',
      message: 'Invalid parameter value',
      request_id: 'req_123',
    });
  });

  it('should add target field', () => {
    const response = new ErrorBuilder(
      ErrorCode.INVALID_PARAMETER,
      'Invalid parameter value',
      'req_123'
    )
      .withTarget('limit')
      .build();

    expect(response.error.target).toBe('limit');
  });

  it('should add error details with suggestions', () => {
    const response = new ErrorBuilder(
      ErrorCode.INVALID_PARAMETER,
      'The limit parameter is out of range',
      'req_123'
    )
      .withTarget('limit')
      .withDetail(
        'VALUE_OUT_OF_RANGE',
        'limit must be between 1 and 100',
        'Set limit to a value between 1 and 100',
        'limit'
      )
      .build();

    expect(response.error.details).toHaveLength(1);
    expect(response.error.details?.[0]).toEqual({
      code: 'VALUE_OUT_OF_RANGE',
      message: 'limit must be between 1 and 100',
      suggestion: 'Set limit to a value between 1 and 100',
      target: 'limit',
    });
  });

  it('should add documentation URL', () => {
    const response = new ErrorBuilder(
      ErrorCode.INVALID_PARAMETER,
      'Invalid parameter value',
      'req_123'
    )
      .withDocUrl('https://docs.example.com')
      .build();

    expect(response.error.doc_url).toBe('https://docs.example.com/errors/INVALID_PARAMETER');
  });

  it('should chain multiple operations', () => {
    const response = new ErrorBuilder(
      ErrorCode.INVALID_PARAMETER,
      'Multiple validation errors',
      'req_123'
    )
      .withTarget('request_body')
      .withDetail('MISSING_FIELD', 'name is required', 'Add a name field to the request', 'name')
      .withDetail('INVALID_FORMAT', 'email must be valid', 'Provide a valid email address', 'email')
      .withDocUrl('https://docs.example.com')
      .build();

    expect(response.error.details).toHaveLength(2);
    expect(response.error.doc_url).toBeDefined();
    expect(response.error.target).toBe('request_body');
  });
});

describe('createErrorResponse', () => {
  it('should create a simple error response', () => {
    const response = createErrorResponse(
      ErrorCode.RESOURCE_NOT_FOUND,
      'User not found',
      'req_456'
    );

    expect(response.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(response.error.message).toBe('User not found');
    expect(response.error.request_id).toBe('req_456');
  });

  it('should create an error with options', () => {
    const response = createErrorResponse(
      ErrorCode.INVALID_PARAMETER,
      'Validation failed',
      'req_789',
      {
        target: 'limit',
        details: [
          {
            code: 'VALUE_OUT_OF_RANGE',
            message: 'limit must be between 1 and 100',
            suggestion: 'Set limit to 100 or use pagination',
          },
        ],
      }
    );

    expect(response.error.target).toBe('limit');
    expect(response.error.details).toHaveLength(1);
  });
});

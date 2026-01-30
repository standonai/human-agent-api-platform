import { describe, it, expect } from 'vitest';
import { openAPIToZod, createParameterValidator } from './openapi-to-zod.js';

describe('openAPIToZod', () => {
  it('should convert string schema', () => {
    const schema = openAPIToZod({ type: 'string' });
    expect(schema.parse('test')).toBe('test');
    expect(() => schema.parse(123)).toThrow();
  });

  it('should convert number schema', () => {
    const schema = openAPIToZod({ type: 'number' });
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse('42')).toThrow();
  });

  it('should convert integer schema', () => {
    const schema = openAPIToZod({ type: 'integer' });
    expect(schema.parse(42)).toBe(42);
    expect(() => schema.parse(42.5)).toThrow();
  });

  it('should handle minimum and maximum', () => {
    const schema = openAPIToZod({
      type: 'integer',
      minimum: 1,
      maximum: 100,
    });

    expect(schema.parse(50)).toBe(50);
    expect(() => schema.parse(0)).toThrow();
    expect(() => schema.parse(101)).toThrow();
  });

  it('should handle string length constraints', () => {
    const schema = openAPIToZod({
      type: 'string',
      minLength: 2,
      maxLength: 10,
    });

    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse('a')).toThrow();
    expect(() => schema.parse('a'.repeat(11))).toThrow();
  });

  it('should handle email format', () => {
    const schema = openAPIToZod({
      type: 'string',
      format: 'email',
    });

    expect(schema.parse('test@example.com')).toBe('test@example.com');
    expect(() => schema.parse('invalid')).toThrow();
  });

  it('should handle enum values', () => {
    const schema = openAPIToZod({
      type: 'string',
      enum: ['active', 'inactive', 'pending'],
    });

    expect(schema.parse('active')).toBe('active');
    expect(() => schema.parse('invalid')).toThrow();
  });

  it('should handle object schema', () => {
    const schema = openAPIToZod({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });

    expect(schema.parse({ name: 'John', age: 30 })).toEqual({
      name: 'John',
      age: 30,
    });

    expect(schema.parse({ name: 'John' })).toEqual({ name: 'John' });

    expect(() => schema.parse({})).toThrow();
  });

  it('should handle array schema', () => {
    const schema = openAPIToZod({
      type: 'array',
      items: { type: 'string' },
    });

    expect(schema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(() => schema.parse([1, 2, 3])).toThrow();
  });

  it('should handle nullable', () => {
    const schema = openAPIToZod({
      type: 'string',
      nullable: true,
    });

    expect(schema.parse('test')).toBe('test');
    expect(schema.parse(null)).toBe(null);
  });

  it('should handle nested objects', () => {
    const schema = openAPIToZod({
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
          required: ['name', 'email'],
        },
      },
      required: ['user'],
    });

    const valid = {
      user: {
        name: 'John',
        email: 'john@example.com',
      },
    };

    expect(schema.parse(valid)).toEqual(valid);

    expect(() => schema.parse({ user: { name: 'John' } })).toThrow();
  });

  it('should handle default values', () => {
    const schema = openAPIToZod({
      type: 'object',
      properties: {
        limit: { type: 'integer', default: 20 },
      },
    });

    expect(schema.parse({})).toEqual({ limit: 20 });
    expect(schema.parse({ limit: 50 })).toEqual({ limit: 50 });
  });
});

describe('createParameterValidator', () => {
  it('should create validator from parameters', () => {
    const parameters = [
      {
        name: 'limit',
        in: 'query',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
        },
      },
      {
        name: 'status',
        in: 'query',
        required: true,
        schema: {
          type: 'string',
          enum: ['active', 'inactive'],
        },
      },
    ];

    const validator = createParameterValidator(parameters);

    expect(validator.parse({ status: 'active' })).toEqual({ status: 'active' });
    expect(validator.parse({ status: 'active', limit: 50 })).toEqual({
      status: 'active',
      limit: 50,
    });

    expect(() => validator.parse({})).toThrow();
    expect(() => validator.parse({ status: 'invalid' })).toThrow();
  });
});

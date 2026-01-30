import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../server.js';

describe('Converter API Routes', () => {
  const validSpec = {
    openapi: '3.1.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
    },
    paths: {
      '/users': {
        get: {
          operationId: 'listUsers',
          summary: 'List users',
          description: 'Get all users',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              description: 'Max results',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
            },
          },
        },
      },
    },
  };

  describe('POST /api/convert', () => {
    it('should convert OpenAPI spec to both formats', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({ spec: validSpec, format: 'both' })
        .expect(200);

      expect(response.body).toHaveProperty('openai');
      expect(response.body).toHaveProperty('anthropic');
      expect(response.body.operationsCount).toBe(1);
      expect(response.body.apiTitle).toBe('Test API');
    });

    it('should convert to OpenAI format only', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({ spec: validSpec, format: 'openai' })
        .expect(200);

      expect(response.body).toHaveProperty('openai');
      expect(response.body).not.toHaveProperty('anthropic');
      expect(response.body.openai).toBeInstanceOf(Array);
      expect(response.body.openai[0]).toHaveProperty('type', 'function');
      expect(response.body.openai[0].function.name).toBe('listUsers');
    });

    it('should convert to Anthropic format only', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({ spec: validSpec, format: 'anthropic' })
        .expect(200);

      expect(response.body).toHaveProperty('anthropic');
      expect(response.body).not.toHaveProperty('openai');
      expect(response.body.anthropic).toBeInstanceOf(Array);
      expect(response.body.anthropic[0].name).toBe('listUsers');
      expect(response.body.anthropic[0]).toHaveProperty('input_schema');
    });

    it('should return error for missing spec', async () => {
      const response = await request(app)
        .post('/api/convert')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('MISSING_REQUIRED_FIELD');
      expect(response.body.error.target).toBe('spec');
    });

    it('should return error for invalid OpenAPI version', async () => {
      const invalidSpec = { ...validSpec, openapi: '2.0' };
      const response = await request(app)
        .post('/api/convert')
        .send({ spec: invalidSpec })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_FORMAT');
    });

    it('should filter by tags', async () => {
      const specWithTags = {
        ...validSpec,
        paths: {
          '/users': {
            get: {
              ...validSpec.paths['/users'].get,
              tags: ['users'],
            },
          },
          '/posts': {
            get: {
              operationId: 'listPosts',
              summary: 'List posts',
              tags: ['posts'],
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const response = await request(app)
        .post('/api/convert')
        .send({
          spec: specWithTags,
          format: 'openai',
          filter: { tags: ['users'] },
        })
        .expect(200);

      expect(response.body.operationsCount).toBe(1);
      expect(response.body.openai[0].function.name).toBe('listUsers');
    });

    it('should filter by methods', async () => {
      const specWithMethods = {
        ...validSpec,
        paths: {
          '/users': {
            get: validSpec.paths['/users'].get,
            post: {
              operationId: 'createUser',
              summary: 'Create user',
              responses: { '201': { description: 'Created' } },
            },
          },
        },
      };

      const response = await request(app)
        .post('/api/convert')
        .send({
          spec: specWithMethods,
          format: 'openai',
          filter: { methods: ['GET'] },
        })
        .expect(200);

      expect(response.body.operationsCount).toBe(1);
      expect(response.body.openai[0].function.name).toBe('listUsers');
    });
  });

  describe('POST /api/convert/validate', () => {
    it('should validate a valid OpenAPI spec', async () => {
      const response = await request(app)
        .post('/api/convert/validate')
        .send({ spec: validSpec })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.operationsCount).toBe(1);
      expect(response.body.operations).toHaveLength(1);
    });

    it('should return validation errors for invalid spec', async () => {
      const invalidSpec = { openapi: '3.1.0' }; // Missing info and paths

      const response = await request(app)
        .post('/api/convert/validate')
        .send({ spec: invalidSpec })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.issues.length).toBeGreaterThan(0);
    });

    it('should warn about missing operationId', async () => {
      const specWithoutOpId = {
        ...validSpec,
        paths: {
          '/users': {
            get: {
              summary: 'List users',
              responses: { '200': { description: 'Success' } },
            },
          },
        },
      };

      const response = await request(app)
        .post('/api/convert/validate')
        .send({ spec: specWithoutOpId })
        .expect(200);

      const warnings = response.body.issues.filter(
        (i: any) => i.severity === 'warning'
      );
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/convert/info', () => {
    it('should return converter information', async () => {
      const response = await request(app)
        .get('/api/convert/info')
        .expect(200);

      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('supportedFormats');
      expect(response.body.supportedFormats).toContain('openai');
      expect(response.body.supportedFormats).toContain('anthropic');
    });
  });
});

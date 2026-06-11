/**
 * Auth Routes Integration Tests
 *
 * Tests: registration, login, token refresh, /me endpoint.
 * Uses a fresh temp database for each test run.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { randomBytes } from 'crypto';
import { mkdirSync, rmSync } from 'fs';
import path from 'path';
import { initializeDatabase } from '../db/database.js';
import { initializeDefaultUsers } from '../auth/user-store.js';
import { resetLoginAttemptGuards } from '../auth/login-attempt-guard.js';
import authRoutes from './auth-routes.js';
import { errorHandler } from '../middleware/error-handler.js';
import { requestIdMiddleware } from '../middleware/request-id.js';

// Minimal express app for route testing (no rate limit, no TLS)
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(requestIdMiddleware);
  app.use('/api/auth', authRoutes);
  app.use(errorHandler({ docBaseUrl: 'https://docs.example.com' }));
  return app;
}

const tmpDir = path.join('/tmp', `auth-test-${randomBytes(4).toString('hex')}`);
const dbPath = path.join(tmpDir, 'test.db');

let app: express.Application;

beforeAll(async () => {
  mkdirSync(tmpDir, { recursive: true });
  process.env.DATABASE_URL = dbPath;
  process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long!!';
  await initializeDatabase();
  await initializeDefaultUsers();
  app = buildApp();
});

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ok */ }
  delete process.env.DATABASE_URL;
  delete process.env.LOGIN_MAX_ATTEMPTS;
  delete process.env.LOGIN_ATTEMPT_WINDOW_MS;
  delete process.env.LOGIN_LOCKOUT_DURATION_MS;
});

describe('POST /api/auth/register', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'x@x.com' }); // missing name and password

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBeDefined();
    expect(res.body.error.details[0].suggestion).toBeDefined();
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'notanemail', password: 'password123', name: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].suggestion).toBeTruthy();
  });

  it('returns 201 with tokens on successful registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'newuser@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe('newuser@example.com');
  });

  it('returns 409 when email already exists', async () => {
    const email = `dup-${Date.now()}@example.com`;

    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password123', name: 'First' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'password456', name: 'Second' });

    expect(res.status).toBe(409);
    expect(res.body.error.details[0].suggestion).toBeTruthy();
  });
});

describe('POST /api/auth/login', () => {
  const testEmail = `login-test-${Date.now()}@example.com`;

  beforeAll(() => {
    process.env.LOGIN_MAX_ATTEMPTS = '2';
    process.env.LOGIN_ATTEMPT_WINDOW_MS = '60000';
    process.env.LOGIN_LOCKOUT_DURATION_MS = '60000';
  });

  beforeAll(async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: testEmail, password: 'mypassword', name: 'Login User' });
  });

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail }); // no password

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].suggestion).toBeDefined();
  });

  it('returns 401 for invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.details[0].suggestion).toBeTruthy();
  });

  it('returns 200 with tokens for valid credentials', async () => {
    await resetLoginAttemptGuards();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'mypassword' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  it('returns 429 and Retry-After once lockout threshold is exceeded', async () => {
    const email = `locked-${Date.now()}@example.com`;
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'mypassword', name: 'Locked User' });

    const first = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrongpassword' });

    const second = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrongpassword' });

    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'mypassword' });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBeDefined();
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    await resetLoginAttemptGuards();
  });
});

describe('GET /api/auth/me', () => {
  let accessToken: string;

  beforeAll(async () => {
    const email = `me-test-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'pass123456', name: 'Me User' });
    accessToken = res.body.data.accessToken;
  });

  it('returns 401 without auth header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.details[0].suggestion).toBeDefined();
  });

  it('returns 200 with user data when authenticated', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBeDefined();
    // password hash must NOT be exposed
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].suggestion).toBeDefined();
  });

  it('returns 401 for an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.value.here' });

    expect(res.status).toBe(401);
    expect(res.body.error.details[0].suggestion).toBeTruthy();
  });
});

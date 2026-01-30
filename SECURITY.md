# Security Assessment & Implementation Guide

## ⚠️ Current Security Status

**CRITICAL: This platform is NOT production-ready from a security perspective.**

While it demonstrates excellent API design patterns for human-agent collaboration, it **lacks essential security features** needed for production deployment.

## 🔴 Critical Security Gaps

### 1. Authentication & Authorization - **MISSING**

**Current State:**
- ❌ No authentication whatsoever
- ❌ No API keys, JWT, or OAuth2
- ❌ No user sessions
- ❌ No authorization checks
- ❌ Anyone can call any endpoint

**Risk Level:** 🔴 **CRITICAL**

**Impact:**
- Anyone can create/read/delete users
- No access control
- No audit trail of who did what
- Trivial to abuse

**Example Attack:**
```bash
# Anyone can do this:
curl -X POST http://api.example.com/api/users \
  -d '{"email": "admin@example.com", "name": "Fake Admin", "role": "admin"}'

# ✅ Success - just created an admin account!
```

---

### 2. Agent Identity Spoofing - **VULNERABLE**

**Current State:**
```typescript
// Agent identification via header (can be spoofed)
const agentId = req.headers['x-agent-id'];  // ❌ No verification!
```

**Risk Level:** 🔴 **CRITICAL**

**Attack Scenario:**
```bash
# Attacker pretends to be ChatGPT to bypass rate limits
curl -H "X-Agent-ID: gpt-4-official" /api/users
# Platform treats this as legitimate GPT-4 traffic
```

---

### 3. CORS Configuration - **TOO PERMISSIVE**

**Current State:**
```xml
<!-- Gateway CORS policy -->
<allowed-origins>
  <origin>*</origin>  <!-- ❌ Allows ANY origin -->
</allowed-origins>
```

**Risk Level:** 🟠 **HIGH**

**Impact:**
- Any website can call your API from browser
- Enables CSRF attacks
- Credentials can be stolen

---

### 4. Secrets Management - **INSECURE**

**Current State:**
```bash
# .env file with plain text secrets
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AZURE_CLIENT_SECRET=your-client-secret
GATEWAY_API_KEY=super-secret-key
```

**Risk Level:** 🔴 **CRITICAL**

**Impact:**
- Secrets committed to git (even with .gitignore)
- Secrets in container images
- Secrets in logs/error messages
- Easy to leak via environment dumps

---

### 5. HTTPS/TLS - **NOT ENFORCED**

**Current State:**
```typescript
// Server runs on HTTP
app.listen(3000);  // ❌ No HTTPS
```

**Risk Level:** 🔴 **CRITICAL**

**Impact:**
- Credentials sent in plain text
- Man-in-the-middle attacks
- Traffic can be intercepted
- Fails PCI/HIPAA compliance

---

### 6. Security Headers - **MISSING**

**Current State:**
```bash
# Response headers (current)
Content-Type: application/json
X-Request-ID: req_abc123

# Missing critical security headers:
# ❌ Strict-Transport-Security
# ❌ Content-Security-Policy
# ❌ X-Frame-Options
# ❌ X-Content-Type-Options
# ❌ Referrer-Policy
```

**Risk Level:** 🟠 **HIGH**

---

### 7. Input Validation - **INCOMPLETE**

**Current State:**
```typescript
// Basic Zod validation exists
const schema = z.object({
  email: z.string().email(),
  name: z.string(),
});
```

**Missing:**
- ❌ No input sanitization (XSS prevention)
- ❌ No SQL injection prevention
- ❌ No command injection checks
- ❌ No path traversal prevention
- ❌ No file upload validation
- ❌ No request size limits

**Risk Level:** 🟠 **HIGH**

---

### 8. Error Information Disclosure - **LEAKING**

**Current State:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Database connection failed at /src/db/connection.ts:45",
    "details": {
      "stack": "Error: Connection refused...",
      "query": "SELECT * FROM users WHERE..."
    }
  }
}
```

**Risk Level:** 🟠 **HIGH**

**Information Leaked:**
- Internal file paths
- Stack traces
- Database structure
- SQL queries
- Library versions

---

### 9. Rate Limiting - **INSUFFICIENT**

**Current State:**
```typescript
// Basic fixed window: 100 req/min globally
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
```

**Missing:**
- ❌ No per-user rate limits
- ❌ No per-IP limits
- ❌ No distributed rate limiting (Redis)
- ❌ No adaptive/smart rate limiting
- ❌ No DDoS protection
- ❌ No cost-based rate limiting

**Risk Level:** 🟡 **MEDIUM**

**Attack:**
```bash
# Attacker can exhaust rate limit for all users
for i in {1..100}; do
  curl http://api.example.com/api/users &
done
# Legitimate users now get 429 errors
```

---

### 10. Audit Logging - **MISSING**

**Current State:**
- ✅ Request IDs exist
- ❌ No audit trail
- ❌ No "who did what when" logs
- ❌ No compliance logging (GDPR, SOC2)

**Risk Level:** 🟠 **HIGH**

**Impact:**
- Can't investigate security incidents
- Can't prove compliance
- Can't detect anomalies
- Can't track data access

---

## 🛡️ Security Implementation Roadmap

### Phase 1: Critical Security (Week 1-2)

#### 1.1 Implement Authentication

**JWT-based Authentication:**

```typescript
// src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface JWTPayload {
  userId: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  iat: number;
  exp: number;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        suggestion: 'Include Authorization: Bearer <token> header',
        doc_url: 'https://docs.example.com/auth'
      }
    });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    // Attach user to request
    req.user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired',
          suggestion: 'Refresh your token using /api/auth/refresh',
          doc_url: 'https://docs.example.com/auth/refresh'
        }
      });
    }

    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
        suggestion: 'Obtain a new token via /api/auth/login',
      }
    });
  }
}

// Apply to protected routes
app.use('/api/users', requireAuth);
```

**Environment:**
```bash
# Generate with: openssl rand -base64 32
JWT_SECRET=your-256-bit-secret-here
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d
```

#### 1.2 Implement Authorization (RBAC)

```typescript
// src/middleware/authorization.ts
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `This action requires ${allowedRoles.join(' or ')} role`,
          suggestion: `Contact your administrator to upgrade your role`,
          target: 'user.role',
          details: [{
            code: 'INSUFFICIENT_PERMISSIONS',
            message: `Your role: ${req.user.role}, Required: ${allowedRoles.join(', ')}`
          }]
        }
      });
    }

    next();
  };
}

// Usage
app.delete('/api/users/:id',
  requireAuth,
  requireRole('admin'),  // Only admins can delete
  deleteUser
);

app.post('/api/users',
  requireAuth,
  requireRole('admin', 'developer'),  // Admins and developers can create
  createUser
);
```

#### 1.3 Secure Agent Authentication

```typescript
// src/middleware/agent-auth.ts
import crypto from 'crypto';

interface AgentCredentials {
  agentId: string;
  apiKey: string;
  hash: string;  // SHA-256 of apiKey
  active: boolean;
  createdAt: Date;
  lastUsed: Date;
}

// Agent registry (use database in production)
const agentRegistry = new Map<string, AgentCredentials>();

export function registerAgent(agentId: string): string {
  // Generate cryptographically secure API key
  const apiKey = crypto.randomBytes(32).toString('base64');
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  agentRegistry.set(agentId, {
    agentId,
    apiKey: '', // Don't store raw key
    hash,
    active: true,
    createdAt: new Date(),
    lastUsed: new Date(),
  });

  return apiKey;  // Return once, never stored
}

export function requireAgentAuth(req: Request, res: Response, next: NextFunction) {
  const agentId = req.headers['x-agent-id'] as string;
  const apiKey = req.headers['x-agent-key'] as string;

  if (!agentId || !apiKey) {
    return res.status(401).json({
      error: {
        code: 'AGENT_AUTH_REQUIRED',
        message: 'Agent authentication required',
        suggestion: 'Include X-Agent-ID and X-Agent-Key headers',
        doc_url: 'https://docs.example.com/agents/auth'
      }
    });
  }

  const agent = agentRegistry.get(agentId);

  if (!agent || !agent.active) {
    return res.status(401).json({
      error: {
        code: 'UNKNOWN_AGENT',
        message: 'Agent not registered or deactivated',
        suggestion: 'Register your agent at /api/agents/register'
      }
    });
  }

  // Verify API key
  const providedHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  if (providedHash !== agent.hash) {
    return res.status(401).json({
      error: {
        code: 'INVALID_AGENT_KEY',
        message: 'Invalid agent API key',
        suggestion: 'Verify your X-Agent-Key header is correct'
      }
    });
  }

  // Update last used
  agent.lastUsed = new Date();

  // Attach agent to request
  req.agent = { id: agentId };

  next();
}

// Usage
app.post('/api/users',
  requireAgentAuth,  // Verify agent identity
  createUser
);
```

#### 1.4 Enable HTTPS

```typescript
// src/server.ts
import https from 'https';
import fs from 'fs';

const app = express();

if (process.env.NODE_ENV === 'production') {
  // Enforce HTTPS
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });

  // Start HTTPS server
  const options = {
    key: fs.readFileSync(process.env.SSL_KEY_PATH!),
    cert: fs.readFileSync(process.env.SSL_CERT_PATH!),
  };

  https.createServer(options, app).listen(443, () => {
    console.log('🔒 HTTPS server running on port 443');
  });
} else {
  // Development: HTTP is okay
  app.listen(3000);
}
```

**Environment:**
```bash
# Production
SSL_KEY_PATH=/etc/ssl/private/server.key
SSL_CERT_PATH=/etc/ssl/certs/server.crt

# Or use Let's Encrypt
# Automated with certbot
```

#### 1.5 Add Security Headers

```typescript
// src/middleware/security-headers.ts
import helmet from 'helmet';

app.use(helmet({
  // HSTS: Force HTTPS for 1 year
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },

  // CSP: Prevent XSS
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Dashboard needs inline styles
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },

  // Prevent clickjacking
  frameguard: { action: 'deny' },

  // Prevent MIME sniffing
  noSniff: true,

  // Remove X-Powered-By
  hidePoweredBy: true,

  // Referrer policy
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
```

**Install:**
```bash
npm install helmet
```

#### 1.6 Fix CORS Configuration

```typescript
// src/middleware/cors.ts
import cors from 'cors';

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,  // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'API-Version',
    'X-Agent-ID',
    'X-Agent-Key',  // Add agent auth
    'X-Request-ID',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  maxAge: 86400,  // 24 hours
}));
```

**Environment:**
```bash
# Production - specific origins only
ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com

# Development - localhost only
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

#### 1.7 Secrets Management

**Use HashiCorp Vault:**

```typescript
// src/config/secrets.ts
import vault from 'node-vault';

const vaultClient = vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
});

export async function getSecret(path: string): Promise<string> {
  const { data } = await vaultClient.read(path);
  return data.value;
}

// Usage
const jwtSecret = await getSecret('secret/data/api/jwt-secret');
const awsKey = await getSecret('secret/data/aws/access-key');
```

**Or use AWS Secrets Manager:**

```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

export async function getSecret(secretName: string): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString!;
}

// Usage
const jwtSecret = await getSecret('prod/api/jwt-secret');
```

**Environment:**
```bash
# Never commit these
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=s.xxxxxxxxxxxxxxxxx

# Or AWS
AWS_SECRETS_REGION=us-east-1
# Use IAM role for authentication (no keys in env)
```

---

### Phase 2: Enhanced Security (Week 3-4)

#### 2.1 Input Sanitization

```bash
npm install xss validator dompurify
```

```typescript
// src/middleware/sanitize.ts
import xss from 'xss';
import validator from 'validator';

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Sanitize all string inputs
  function sanitize(obj: any): any {
    if (typeof obj === 'string') {
      return xss(obj);  // Remove XSS
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  }

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
}

// Apply globally
app.use(express.json({ limit: '10mb' }));  // Limit request size
app.use(sanitizeInput);
```

#### 2.2 SQL Injection Prevention

```typescript
// Even with in-memory store, prepare for database
import { escape } from 'mysql2';

// Bad (vulnerable)
const query = `SELECT * FROM users WHERE email = '${email}'`;

// Good (parameterized)
const query = 'SELECT * FROM users WHERE email = ?';
db.query(query, [email]);

// Or use ORM (Prisma, TypeORM)
const user = await prisma.user.findUnique({
  where: { email },  // Automatically parameterized
});
```

#### 2.3 Request Size Limits

```typescript
// src/middleware/request-limits.ts
import express from 'express';

app.use(express.json({
  limit: '10mb',  // Max JSON body size
  verify: (req, res, buf, encoding) => {
    if (buf.length > 10 * 1024 * 1024) {  // 10MB
      throw new Error('Request body too large');
    }
  }
}));

app.use(express.urlencoded({
  limit: '10mb',
  extended: true,
}));

// Query string limit
app.use((req, res, next) => {
  const querySize = JSON.stringify(req.query).length;
  if (querySize > 10000) {  // 10KB
    return res.status(413).json({
      error: {
        code: 'QUERY_TOO_LARGE',
        message: 'Query string exceeds maximum size',
        suggestion: 'Use POST request with body instead'
      }
    });
  }
  next();
});
```

#### 2.4 Distributed Rate Limiting

```bash
npm install rate-limit-redis ioredis
```

```typescript
// src/middleware/rate-limit-distributed.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Per-user rate limiting
export const userRateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:user:',
  }),
  windowMs: 60 * 1000,  // 1 minute
  max: 100,
  keyGenerator: (req) => req.user?.id || req.ip,  // Per user or IP
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this user',
      suggestion: 'Wait 60 seconds before retrying',
      details: [{
        retryAfter: 60
      }]
    }
  }
});

// Per-IP rate limiting (DDoS protection)
export const ipRateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:ip:',
  }),
  windowMs: 60 * 1000,
  max: 1000,  // Higher limit
  keyGenerator: (req) => req.ip,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP',
      suggestion: 'Implement authentication to get higher limits'
    }
  }
});

// Agent-specific rate limiting
export const agentRateLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:agent:',
  }),
  windowMs: 60 * 1000,
  max: 500,  // Higher for agents
  keyGenerator: (req) => req.agent?.id || 'anonymous',
  skip: (req) => !req.agent,  // Only apply to authenticated agents
});

// Apply in order
app.use(ipRateLimiter);  // Protect from IP-based attacks
app.use('/api', userRateLimiter);  // Per-user limits
app.use('/api', agentRateLimiter);  // Agent limits
```

#### 2.5 Audit Logging

```typescript
// src/middleware/audit-log.ts
interface AuditLog {
  timestamp: Date;
  userId?: string;
  agentId?: string;
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  requestId: string;
  userAgent: string;
  duration: number;
  error?: string;
}

export function auditLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  // Capture response
  res.on('finish', () => {
    const duration = Date.now() - start;

    const log: AuditLog = {
      timestamp: new Date(),
      userId: req.user?.id,
      agentId: req.agent?.id,
      ip: req.ip,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      requestId: req.id,
      userAgent: req.headers['user-agent'] || '',
      duration,
    };

    // Log to secure storage (S3, CloudWatch, etc.)
    writeAuditLog(log);

    // Alert on suspicious activity
    if (res.statusCode === 401 || res.statusCode === 403) {
      detectAnomalies(log);
    }
  });

  next();
}

async function writeAuditLog(log: AuditLog) {
  // Write to write-only audit database
  // Or send to SIEM (Splunk, Datadog, etc.)
  // Never allow modification/deletion

  console.log('[AUDIT]', JSON.stringify(log));

  // Example: Write to S3
  // await s3.putObject({
  //   Bucket: 'audit-logs',
  //   Key: `${log.timestamp.toISOString()}-${log.requestId}.json`,
  //   Body: JSON.stringify(log),
  // });
}

function detectAnomalies(log: AuditLog) {
  // Detect brute force attacks
  // Detect unusual access patterns
  // Alert security team

  if (log.statusCode === 401) {
    // Count failed auth attempts
    // Block IP after 5 failures
  }
}
```

#### 2.6 Error Sanitization

```typescript
// src/middleware/error-handler.ts
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Log full error internally
  console.error('[ERROR]', {
    error: err.message,
    stack: err.stack,
    requestId: req.id,
    userId: req.user?.id,
  });

  // Send sanitized error to client
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isDevelopment
        ? err.message  // Development: show details
        : 'An internal error occurred',  // Production: generic message
      request_id: req.id,
      // ❌ Never send in production:
      // stack: err.stack,
      // query: req.query,
      // body: req.body,
    }
  });
});
```

---

### Phase 3: Advanced Security (Week 5-6)

#### 3.1 Intrusion Detection

```typescript
// src/security/intrusion-detection.ts
interface SecurityEvent {
  type: 'brute_force' | 'sql_injection' | 'xss' | 'path_traversal' | 'anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  userId?: string;
  details: string;
  timestamp: Date;
}

const failedLogins = new Map<string, number>();
const blockedIPs = new Set<string>();

export function detectBruteForce(ip: string): boolean {
  const attempts = (failedLogins.get(ip) || 0) + 1;
  failedLogins.set(ip, attempts);

  // Block after 5 failed attempts
  if (attempts >= 5) {
    blockedIPs.add(ip);
    alertSecurityTeam({
      type: 'brute_force',
      severity: 'high',
      ip,
      details: `${attempts} failed login attempts`,
      timestamp: new Date(),
    });
    return true;
  }

  return false;
}

export function detectSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/i,
    /(UNION.*SELECT)/i,
    /('|"|\-\-|;|\/\*|\*\/)/,
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

export function detectPathTraversal(path: string): boolean {
  return /(\.\.|\/\/|\\\\)/.test(path);
}

export function intrusionDetection(req: Request, res: Response, next: NextFunction) {
  // Check if IP is blocked
  if (blockedIPs.has(req.ip)) {
    return res.status(403).json({
      error: {
        code: 'IP_BLOCKED',
        message: 'Your IP has been temporarily blocked due to suspicious activity',
        suggestion: 'Contact support if you believe this is an error'
      }
    });
  }

  // Detect SQL injection attempts
  const allInput = JSON.stringify({ ...req.body, ...req.query, ...req.params });
  if (detectSQLInjection(allInput)) {
    alertSecurityTeam({
      type: 'sql_injection',
      severity: 'critical',
      ip: req.ip,
      userId: req.user?.id,
      details: `SQL injection attempt: ${allInput.substring(0, 100)}`,
      timestamp: new Date(),
    });

    return res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid input detected'
      }
    });
  }

  // Detect path traversal
  if (detectPathTraversal(req.path)) {
    alertSecurityTeam({
      type: 'path_traversal',
      severity: 'high',
      ip: req.ip,
      details: `Path traversal attempt: ${req.path}`,
      timestamp: new Date(),
    });

    return res.status(400).json({
      error: {
        code: 'INVALID_PATH',
        message: 'Invalid path'
      }
    });
  }

  next();
}

function alertSecurityTeam(event: SecurityEvent) {
  // Send to SIEM
  // Send to PagerDuty/OpsGenie
  // Send email/Slack notification
  console.error('[SECURITY]', event);
}
```

#### 3.2 Dependency Scanning

```bash
# Add to CI/CD pipeline
npm audit --production
npm audit fix

# Or use Snyk
npm install -g snyk
snyk test
snyk monitor
```

**GitHub Actions:**
```yaml
# .github/workflows/security.yml
name: Security Scan

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run npm audit
        run: npm audit --production --audit-level=high

      - name: Run Snyk scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

      - name: Run OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          path: '.'
          format: 'HTML'
```

#### 3.3 Container Security

**Dockerfile Security:**
```dockerfile
# Use specific version (not latest)
FROM node:18.19.0-alpine

# Run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Don't include secrets
# Use build args for non-sensitive config only

# Scan for vulnerabilities
# docker scan api-platform:latest

# Use read-only filesystem
# docker run --read-only api-platform
```

**Scan images:**
```bash
# Trivy scanner
trivy image api-platform:latest

# Snyk container scan
snyk container test api-platform:latest
```

---

## 🎯 Security Checklist

### Before Production Deploy:

- [ ] **Authentication implemented** (JWT/OAuth2)
- [ ] **Authorization implemented** (RBAC)
- [ ] **Agent authentication** (API keys, not spoofable headers)
- [ ] **HTTPS enforced** (TLS 1.2+)
- [ ] **Security headers** (Helmet.js)
- [ ] **CORS properly configured** (specific origins, not *)
- [ ] **Secrets in vault** (not .env files)
- [ ] **Input sanitized** (XSS, SQL injection prevention)
- [ ] **Rate limiting** (distributed via Redis)
- [ ] **Request size limits** (prevent memory exhaustion)
- [ ] **Audit logging** (compliance ready)
- [ ] **Error sanitization** (no info disclosure)
- [ ] **Dependency scanning** (npm audit, Snyk)
- [ ] **Container scanning** (Trivy, Snyk)
- [ ] **Intrusion detection** (brute force, SQL injection)
- [ ] **WAF configured** (Cloudflare, AWS WAF)
- [ ] **DDoS protection** (Cloudflare, AWS Shield)
- [ ] **Penetration testing** (third-party audit)
- [ ] **Security monitoring** (SIEM integration)
- [ ] **Incident response plan** (documented)
- [ ] **Compliance verified** (GDPR, SOC2, HIPAA if needed)

---

## 🔐 Security Best Practices

### 1. Principle of Least Privilege
- Grant minimum permissions needed
- Use separate API keys per agent/service
- Rotate keys regularly

### 2. Defense in Depth
- Multiple layers of security
- Authentication + Authorization + Rate Limiting + WAF
- Fail securely (deny by default)

### 3. Security by Design
- Consider security from day 1
- Threat modeling
- Regular security reviews

### 4. Monitoring & Response
- Real-time security monitoring
- Automated alerts
- Incident response plan
- Regular security drills

### 5. Compliance
- GDPR data protection
- SOC 2 controls
- HIPAA if health data
- PCI DSS if payment data

---

## 🚨 Emergency Response

### If Compromised:

1. **Immediately:**
   - Revoke all API keys and tokens
   - Block malicious IPs
   - Enable maintenance mode

2. **Investigate:**
   - Review audit logs
   - Identify scope of breach
   - Document timeline

3. **Remediate:**
   - Patch vulnerabilities
   - Rotate all secrets
   - Deploy fixes

4. **Notify:**
   - Affected users (GDPR requires 72 hours)
   - Regulators if required
   - Security team/management

5. **Prevent:**
   - Post-mortem analysis
   - Update security controls
   - Retrain team

---

## 📊 Security Metrics to Track

- Failed authentication attempts per IP
- Rate limit violations
- SQL injection attempts detected
- XSS attempts detected
- Blocked IPs
- Mean time to detect (MTTD)
- Mean time to respond (MTTR)
- Vulnerability remediation time
- Security test coverage

---

## 💡 Conclusion

**Current platform: 🔴 NOT PRODUCTION SECURE**

**After Phase 1-3: 🟢 PRODUCTION READY**

This platform demonstrates excellent API design patterns but requires significant security hardening before production use. Follow the phased implementation plan to achieve enterprise-grade security.

**Estimated effort:**
- Phase 1 (Critical): 2 weeks
- Phase 2 (Enhanced): 2 weeks
- Phase 3 (Advanced): 2 weeks
- Total: **6 weeks** for full security implementation

**Cost:**
- Security tools (Snyk, etc.): ~$500/month
- Secrets management (Vault): ~$200/month
- WAF (Cloudflare): ~$200/month
- Penetration testing: ~$10,000 one-time
- **Total first year: ~$25,000**

**ROI:**
- Prevent data breach (avg cost: $4.45M per IBM 2023)
- Maintain compliance (avoid fines)
- Customer trust
- **Invaluable**

---

**Next Steps:**
1. Review this security assessment
2. Prioritize based on threat model
3. Implement Phase 1 (critical security)
4. Schedule penetration test
5. Continuous security monitoring

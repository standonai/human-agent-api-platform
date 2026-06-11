import { Request, Response, NextFunction } from 'express';

function isHttpsRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  return false;
}

export function enforceHttpsIfConfigured(req: Request, res: Response, next: NextFunction): void {
  if (process.env.ENFORCE_HTTPS !== 'true') {
    next();
    return;
  }

  if (isHttpsRequest(req)) {
    next();
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const host = req.headers.host;
    if (host) {
      res.redirect(308, `https://${host}${req.originalUrl}`);
      return;
    }
  }

  res.status(400).json({
    error: {
      code: 'HTTPS_REQUIRED',
      message: 'HTTPS is required for this endpoint',
    },
  });
}

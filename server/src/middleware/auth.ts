import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser, Role } from '../types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser, secret: string, expiresIn: string): string {
  return jwt.sign({ sub: String(user.id), name: user.name, email: user.email, role: user.role }, secret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function authenticate(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    try {
      const payload = jwt.verify(header.slice(7), secret) as jwt.JwtPayload;
      req.user = { id: Number(payload.sub), name: payload.name, email: payload.email, role: payload.role };
      next();
    } catch {
      res.status(401).json({ error: 'Session expired, please sign in again' });
    }
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have access to this action' });
      return;
    }
    next();
  };
}

import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import { getOrCreateTokenSecret } from './config.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 小时

export const TEACHER_PASSWORD = '123456';

export interface Session {
  role: 'teacher' | 'admin';
  exp: number;
}

/**
 * 签名密钥：独立的 crypto 随机 32 字节（首次生成持久化到 config.json），
 * 任何接口都不返回该值（deviceId 已从 status 响应中移除），离线无法推导伪造。
 */
function secret(): string {
  return getOrCreateTokenSecret();
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function signToken(role: Session['role']): string {
  const payload: Session = { role, exp: Date.now() + TOKEN_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): Session | null {
  try {
    const [body, sig] = token.split('.');
    const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    if (!safeEqual(sig, expect)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as Session;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const session = verifyToken(token);
  if (!session) {
    res.status(401).json({ error: '未登录或登录已过期' });
    return;
  }
  (req as Request & { session?: Session }).session = session;
  next();
}

export function requireRole(roles: Session['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = (req as Request & { session?: Session }).session;
    if (!session || !roles.includes(session.role)) {
      res.status(403).json({ error: '无权限' });
      return;
    }
    next();
  };
}

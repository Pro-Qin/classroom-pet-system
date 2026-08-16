import type { NextFunction, Request, Response } from 'express';

/** 写操作限流：每 IP 每分钟最多 max 次 POST/PUT/DELETE/PATCH（防滥用/防爆破） */
export function writeRateLimit(max = 120, windowMs = 60_000) {
  const buckets = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase())) {
      const ip = req.ip ?? 'unknown';
      const now = Date.now();
      const arr = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs);
      if (arr.length >= max) {
        res.status(429).json({ error: '操作过于频繁，请稍后再试' });
        return;
      }
      arr.push(now);
      buckets.set(ip, arr);
    }
    next();
  };
}

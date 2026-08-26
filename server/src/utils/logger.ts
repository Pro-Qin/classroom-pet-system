import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const LOG_DIR = path.join(DATA_DIR, 'logs');
const MAX_LOG_BYTES = 1024 * 1024 * 1024; // 默认 1GB，超出自动删除最旧日志

function ensureLogDir(): void {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rotate(): void {
  ensureLogDir();
  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => /\.log$/.test(f))
    .map((f) => ({ f, size: safeSize(path.join(LOG_DIR, f)) }))
    .sort((a, b) => a.f.localeCompare(b.f)); // 旧→新
  let total = files.reduce((s, x) => s + x.size, 0);
  while (files.length > 0 && total > MAX_LOG_BYTES) {
    const old = files.shift()!;
    total -= old.size;
    try {
      fs.unlinkSync(path.join(LOG_DIR, old.f));
    } catch { /* ignore */ }
  }
}

function safeSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

export function log(level: 'info' | 'warn' | 'error', message: string): void {
  rotate();
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  fs.appendFileSync(path.join(LOG_DIR, `${today()}.log`), line, 'utf-8');
  if (level === 'error') console.error(message);
  else if (level === 'warn') console.warn(message);
  else console.log(message);
}

export const logger = {
  info: (msg: string) => log('info', msg),
  warn: (msg: string) => log('warn', msg),
  error: (msg: string) => log('error', msg),
};

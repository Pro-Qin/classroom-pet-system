import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const LOG_DIR = path.join(DATA_DIR, 'logs');
const MAX_LOG_FILES = 30;

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
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .sort();
  while (files.length > MAX_LOG_FILES) {
    const old = files.shift()!;
    try {
      fs.unlinkSync(path.join(LOG_DIR, old));
    } catch {
      /* ignore */
    }
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

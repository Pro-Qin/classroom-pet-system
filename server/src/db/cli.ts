import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { closeDb } from './connection.js';

migrate();
seed();
console.log('[db] migrate + seed ok');
closeDb();

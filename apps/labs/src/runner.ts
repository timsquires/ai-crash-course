import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

// Load environment variables from apps/labs/.env if present
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run lab <week>/<script> or <script> (defaults to week-1)');
  process.exit(1);
}

const normalized = arg.includes('/') ? arg : `week-1/${arg}`;
const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', normalized.endsWith('.ts') ? normalized : `${normalized}.ts`);

const run = async () => {
  const mod = await import(scriptPath);
  if (typeof (mod as any).default === 'function') {
    await (mod as any).default();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

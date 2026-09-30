import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');

// Load a local .env file when present; Vercel supplies the same variables directly.
try {
  const envText = await readFile(path.join(root, '.env'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.STRIVER_SUPABASE_URL || '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.STRIVER_SUPABASE_PUBLISHABLE_KEY || '';
if (supabaseUrl && !/^https:\/\/[\w.-]+\.supabase\.co$/.test(supabaseUrl)) {
  throw new Error('STRIVER_SUPABASE_URL must be your HTTPS Supabase project URL.');
}
if (publishableKey && !publishableKey.startsWith('sb_publishable_')) {
  throw new Error('Use the Supabase publishable key here, never a secret/service_role key.');
}

await mkdir(out, { recursive: true });
for (const name of ['index.html', 'styles.css', 'curriculum.js', 'manifest.webmanifest', 'service-worker.js', 'src', 'icons']) {
  await cp(path.join(root, name), path.join(out, name), { recursive: true });
}
await writeFile(path.join(out, 'config.js'), `window.STRIVER_CONFIG = ${JSON.stringify({ supabaseUrl, supabaseAnonKey: publishableKey })};\n`);
console.log(`Built static app to ${out}${supabaseUrl && publishableKey ? ' (cloud sync configured)' : ' (cloud sync disabled: missing Supabase public settings)'}`);

// A Tempo · tools/construeix.mjs — La còpia de l'app que es publica (dist/): la mateixa, però amb el JavaScript i el CSS
// minificats (sense comentaris ni espais, i amb noms curts dins de cada funció), perquè el mòbil en baixi i en llegeixi la meitat.
//
//   npm install --no-save esbuild@0.24.0 && node tools/construeix.mjs [carpeta]   (per defecte, dist)
//
// Cada fitxer de js/ es minifica per separat, amb la mateixa adreça i la mateixa empremta (?v=…, vegeu tools/stamp.py): així
// el treballador de servei continua desant-los un a un, i després d'un canvi el mòbil només en torna a baixar els que han
// canviat. Els noms de dalt de tot de cada fitxer no es toquen (els scripts clàssics se'ls comparteixen entre ells).
// Ho fa servir la publicació (.github/workflows/publica.yml) i les proves de la interfície, que es passen sobre aquesta còpia.
import { transform } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, process.argv[2] || 'dist');
// El que no és de l'app: el codi de les proves, les eines, els scripts de GitHub, les regles i la documentació.
const SKIP = new Set(['.git', '.github', 'tests', 'tools', 'node_modules', 'dist', 'README.md', 'firebase.json', '.firebaserc', 'firestore.rules', 'tsconfig.json', 'package.json', 'package-lock.json']);

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const name of readdirSync(ROOT)) {
  if (SKIP.has(name) || name.startsWith('.') || name.endsWith('.py')) continue;
  cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
}

let before = 0, after = 0;
async function minify(file, loader) {
  const src = readFileSync(file, 'utf8');
  // Sense «format», esbuild tracta el fitxer com un script clàssic: no canvia els noms de dalt de tot ni hi posa cap embolcall.
  const { code } = await transform(src, { loader, minify: true, target: loader === 'js' ? 'es2021' : undefined, charset: 'utf8', legalComments: 'none' });
  writeFileSync(file, code);
  before += Buffer.byteLength(src); after += Buffer.byteLength(code);
}
const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(join(OUT, 'js'))) if (f.endsWith('.js')) await minify(f, 'js');
for (const f of walk(join(OUT, 'css'))) if (f.endsWith('.css')) await minify(f, 'css');
await minify(join(OUT, 'sw.js'), 'js');
console.log(`${relative(ROOT, OUT)}/: JavaScript i CSS de ${Math.round(before / 1024)} KB a ${Math.round(after / 1024)} KB`);

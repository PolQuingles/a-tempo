// Proves de la lògica amb Node: carrega els fitxers de l'app en ordre (com index.html, sense l'arrencada) dins d'un entorn
// sense navegador (entorn.js) i executa proves.js.
//   node tests/logica/run.js                 → les proves
//   node tests/logica/run.js --norma <json>  → la norma de l'app per a cada cas del fitxer (per a test_norma.py)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const files = [...html.matchAll(/<script src="(js\/[\w.-]+\.js)\?v=[\w-]+"><\/script>/g)].map(m => m[1]).filter(f => !f.endsWith('24-arrencada.js'));
const ctx = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, TextEncoder, TextDecoder, Intl, structuredClone });
const run = (file, code) => vm.runInContext(code ?? fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
run('tests/logica/entorn.js');
for (const f of files) run(f);

const i = process.argv.indexOf('--norma');
if (i > 0) {
  // Cada cas: { config, members, productions, attendance, checks: [[producció, membre]] } → [estat o null] per cada comprovació.
  const cases = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  ctx.CASES = cases;
  const out = run('norma', `CASES.map(c => {
    S.config = { minAttendance: 80, ...c.config }; applyGroupConfig();
    S.members = new Map(c.members.map(m => [m.id, m])); S.productions = new Map(c.productions.map(p => [p.id, p]));
    S.attendance = new Map(Object.entries(c.attendance)); ARCH.docs = new Map();
    return c.checks.map(([pid, mid]) => { const r = ruleStatus(pid, S.members.get(mid)); return r && { status: r.status, att: r.att, abs: r.abs, remaining: r.remaining, cur: r.cur, best: r.best }; });
  })`);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
run('tests/logica/proves.js');
const res = run('proves', 'runProves()');
console.log(res.lines.join('\n'));
process.exit(res.fail ? 1 : 0);

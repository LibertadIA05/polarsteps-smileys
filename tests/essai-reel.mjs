// Essai réel : 5 vrais textes (absents des exemples), smileys retirés, repassés dans Claude.
// Usage : node tests/essai-reel.mjs <steps_j64.json> <rapport.html>   (clé dans ANTHROPIC_API_KEY)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import Anthropic from '@anthropic-ai/sdk';

const require = createRequire(import.meta.url);
const S = require('../core.js');
const C = require('../consigne.js');
globalThis.window = globalThis;
await import('../exemples.js');
const EXEMPLES = globalThis.EXEMPLES;

const [, , stepsFile, rapport] = process.argv;
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
const exJours = new Set(EXEMPLES.map((e) => e.texte));
const CHOIX = [29, 50, 52, 63, 71].filter((i) => !exJours.has(steps[i].texte));

const sansSmileys = (s) => s.replace(new RegExp('[ \\t]*(?:' + S.EMOJI_RE.source + ')+', 'gu'), '');
const client = new Anthropic();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const lignes = [];
let total = { in: 0, out: 0, cacheR: 0, cacheW: 0 };
for (const i of CHOIX) {
  const st = steps[i];
  const saisie = sansSmileys(st.texte);
  const t0 = Date.now();
  const msg = await client.beta.messages.stream(C.parametres(saisie, EXEMPLES)).finalMessage();
  const duree = ((Date.now() - t0) / 1000).toFixed(0);
  const propose = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const r = S.merge(saisie, propose);
  const u = msg.usage;
  total.in += u.input_tokens; total.out += u.output_tokens;
  total.cacheR += u.cache_read_input_tokens || 0; total.cacheW += u.cache_creation_input_tokens || 0;
  const res = {
    jour: st.jour, lieu: st.lieu, duree, stop: msg.stop_reason,
    intact: S.sameWords(saisie, r.text), repares: r.repaired,
    smileys: r.added, smileysMarina: S.countEmojis(st.texte),
    parasSans: S.paragraphsWithout(r.text), blonde: (r.text.match(/👱/gu) || []).length,
    chars: saisie.length, saisie, resultat: r.text, original: st.texte,
  };
  lignes.push(res);
  console.log(`jour ${res.jour} ${res.lieu} : ${duree}s, intact=${res.intact}, réparés=${res.repares}, smileys ${res.smileys} (Marina ${res.smileysMarina}), paragraphes sans smiley=${res.parasSans}, blonde=${res.blonde}, stop=${res.stop}`);
}
// Prix Sonnet 5.5 : 2 $/M entrée, 10 $/M sortie, lecture cache 0,20 $/M, écriture cache 2,5 $/M (1,25x).
const cout = (total.in * 2 + total.out * 10 + total.cacheR * 0.2 + total.cacheW * 2.5) / 1e6;
console.log(`coût total ≈ ${cout.toFixed(3)} $ pour ${lignes.length} textes`, total);

const html = `<!doctype html><meta charset="utf-8"><title>Essai réel</title>
<style>body{font-family:system-ui;max-width:1100px;margin:auto;padding:16px}td,th{border:1px solid #ccc;padding:4px 8px}table{border-collapse:collapse}
.c{display:grid;grid-template-columns:1fr 1fr;gap:12px}.c pre{white-space:pre-wrap;background:#f6f6f6;padding:10px;font-size:14px}</style>
<h1>Essai réel sur ${lignes.length} textes</h1><p>Coût total ≈ ${cout.toFixed(3)} $</p>
<table><tr><th>Jour</th><th>Lieu</th><th>Durée</th><th>Texte intact</th><th>Réparations</th><th>Smileys app</th><th>Smileys Marina</th><th>Paragraphes sans smiley</th><th>👱‍♀️</th></tr>
${lignes.map((l) => `<tr><td>${l.jour}</td><td>${esc(l.lieu)}</td><td>${l.duree}s</td><td>${l.intact ? '✅' : '❌'}</td><td>${l.repares}</td><td>${l.smileys}</td><td>${l.smileysMarina}</td><td>${l.parasSans}</td><td>${l.blonde}</td></tr>`).join('')}</table>
${lignes.map((l) => `<h2>Jour ${l.jour} · ${esc(l.lieu)}</h2><div class="c"><div><h3>Application</h3><pre>${esc(l.resultat)}</pre></div><div><h3>Marina (original)</h3><pre>${esc(l.original)}</pre></div></div>`).join('')}`;
fs.writeFileSync(rapport, html);
console.log('rapport :', rapport);

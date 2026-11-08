// Cœur de l'application : repérer les smileys et garantir que le texte d'origine reste intact.
// Fonctions pures, utilisées par la page et par les tests (node).
(function (root) {
  'use strict';

  // Un "smiley" = un emoji complet : drapeau, touche (1️⃣), ou pictogramme avec ses variantes
  // (couleur de peau, ZWJ comme 🚶‍♀️ ou 👨‍👩‍👧). Les caractères de liaison isolés comptent aussi.
  const EMOJI_RE = /(?:\p{RI}\p{RI}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{EMod})?(?:‍\p{Extended_Pictographic}(?:️|\p{EMod})?)*|[️‍⃣]|\p{EMod})/gu;

  // Retire les smileys d'un texte.
  // Renvoie { chars: [...caractères sans smiley], anchors: Map(index -> smileys placés juste avant chars[index]), clusters: [...] }
  function strip(s) {
    const chars = [];
    const anchors = new Map();
    const clusters = [];
    let last = 0;
    EMOJI_RE.lastIndex = 0;
    let m;
    while ((m = EMOJI_RE.exec(s)) !== null) {
      for (const c of s.slice(last, m.index)) chars.push(c);
      const k = chars.length;
      anchors.set(k, (anchors.get(k) || '') + m[0]);
      if (!/^[️‍⃣]$/u.test(m[0])) clusters.push(m[0]);
      last = m.index + m[0].length;
    }
    for (const c of s.slice(last)) chars.push(c);
    return { chars, anchors, clusters };
  }

  function countEmojis(s) {
    return strip(s).clusters.length;
  }

  // Diff de Myers (O(ND)) entre deux tableaux de caractères.
  // Renvoie une liste d'opérations ['eq'|'del'|'ins', i, j] dans l'ordre, ou null si trop différent.
  function diff(a, b, maxD) {
    const N = a.length, M = b.length;
    const MAX = Math.min(N + M, maxD || 2000);
    const trace = [];
    let prev = { off: 1, v: new Int32Array(3) }; // V[1] = 0
    let found = -1;
    for (let d = 0; d <= MAX; d++) {
      const cur = { off: d + 1, v: new Int32Array(2 * d + 3) };
      for (let k = -d; k <= d; k += 2) {
        let x;
        if (k === -d || (k !== d && prev.v[k - 1 + prev.off] < prev.v[k + 1 + prev.off])) {
          x = prev.v[k + 1 + prev.off];
        } else {
          x = prev.v[k - 1 + prev.off] + 1;
        }
        let y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        cur.v[k + cur.off] = x;
        if (x >= N && y >= M) { found = d; break; }
      }
      trace.push(cur);
      prev = cur;
      if (found >= 0) break;
    }
    if (found < 0) return null;

    const ops = [];
    let x = N, y = M;
    for (let d = found; d > 0; d--) {
      const p = trace[d - 1];
      const k = x - y;
      let prevK;
      if (k === -d || (k !== d && p.v[k - 1 + p.off] < p.v[k + 1 + p.off])) prevK = k + 1;
      else prevK = k - 1;
      const prevX = p.v[prevK + p.off];
      const prevY = prevX - prevK;
      while (x > prevX && y > prevY) { x--; y--; ops.push(['eq', x, y]); }
      if (x === prevX) { y--; ops.push(['ins', x, y]); }
      else { x--; ops.push(['del', x, y]); }
    }
    while (x > 0 && y > 0) { x--; y--; ops.push(['eq', x, y]); }
    return ops.reverse();
  }

  function multisetIncludes(big, small) {
    const count = new Map();
    for (const c of big) count.set(c, (count.get(c) || 0) + 1);
    for (const c of small) {
      const n = count.get(c) || 0;
      if (n === 0) return false;
      count.set(c, n - 1);
    }
    return true;
  }

  // Reporte les smileys proposés par Claude sur le texte d'ORIGINE.
  // Garantie : en retirant les smileys (et les espaces posées juste à côté), on retrouve l'original au caractère près.
  // Renvoie { text, added, repaired } ; repaired = nombre d'endroits où Claude avait touché au texte (remis d'origine).
  function merge(original, proposal) {
    const o = strip(original);
    const p = strip(proposal);
    const ops = diff(o.chars, p.chars, 3000);
    if (!ops) return { text: original, added: 0, repaired: -1 };

    // Si Claude a gardé tous les smileys d'origine, on ne garde que les siens (évite les doublons).
    const keepOriginalAnchors = !multisetIncludes(p.clusters, o.clusters);
    const out = [];
    const emittedOut = new Set();
    const emittedOrig = new Set();
    let repaired = 0;
    let inChange = false;

    const emitOut = (k) => {
      if (emittedOut.has(k)) return '';
      emittedOut.add(k);
      const e = p.anchors.get(k) || '';
      out.push(e);
      return e;
    };
    const emitOrig = (j, alreadyThere) => {
      if (!keepOriginalAnchors || emittedOrig.has(j)) return;
      emittedOrig.add(j);
      const e = o.anchors.get(j);
      if (e && !(alreadyThere && alreadyThere.includes(e))) out.push(e);
    };
    const isSpace = (c) => /^[ \t  ]$/u.test(c);

    for (const [op, j, k] of ops) {
      if (op === 'eq') {
        inChange = false;
        const e = emitOut(k);
        emitOrig(j, e);
        out.push(o.chars[j]);
      } else if (op === 'del') {
        // Claude avait supprimé ce caractère : on le remet.
        if (!inChange) { repaired++; inChange = true; }
        emitOrig(j, '');
        out.push(o.chars[j]);
      } else {
        const e = emitOut(k);
        const c = p.chars[k];
        if (isSpace(c) && (e || p.anchors.has(k + 1))) {
          out.push(c); // espace posée à côté d'un smiley : on la garde
        } else if (!(isSpace(c))) {
          if (!inChange) { repaired++; inChange = true; }
        }
      }
    }
    const tail = emitOut(p.chars.length);
    emitOrig(o.chars.length, tail);

    const text = out.join('');
    const added = Math.max(0, countEmojis(text) - o.clusters.length);
    return { text, added, repaired };
  }

  // Vérifie la garantie : le texte d'origine sans smileys == le résultat sans smileys, espaces ignorées autour des smileys.
  function sameWords(a, b) {
    // Lettres, ponctuation et retours à la ligne comparés ; seules les espaces horizontales sont ignorées.
    const norm = (s) => strip(s).chars.join('').replace(/[ \t  ]+/g, '').trim();
    return norm(a) === norm(b);
  }

  // Paragraphes (lignes non vides) sans aucun smiley.
  function paragraphsWithout(text) {
    return text.split(/\n/).filter((l) => l.trim().length > 25 && countEmojis(l) === 0).length;
  }

  const api = { EMOJI_RE, strip, diff, merge, sameWords, countEmojis, paragraphsWithout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Smileys = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

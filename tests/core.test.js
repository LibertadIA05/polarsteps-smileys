// Tests du garde-fou : node tests/core.test.js <steps.json>
const assert = require('assert');
const fs = require('fs');
const S = require('../core.js');

let ok = 0, ko = 0;
function t(name, fn) {
  try { fn(); ok++; } catch (e) { ko++; console.log('ÉCHEC', name, '\n ', e.message); }
}

// Ce que Marina tape : le texte sans smileys (et sans l'espace qui les précédait).
function sansSmileys(s) {
  return s.replace(new RegExp('[ \\t]*(?:' + S.EMOJI_RE.source + ')+', 'gu'), '');
}

t('smiley simple', () => {
  const r = S.merge('Du pain.', 'Du pain 🥖.');
  assert.strictEqual(r.text, 'Du pain 🥖.');
  assert.strictEqual(r.added, 1);
  assert.strictEqual(r.repaired, 0);
});

t('emojis composés gardés entiers', () => {
  const r = S.merge('On marche. On rit', 'On marche 🚶‍♀️🚶‍♂️. On rit 😂🇧🇷');
  assert.strictEqual(r.text, 'On marche 🚶‍♀️🚶‍♂️. On rit 😂🇧🇷');
  assert.strictEqual(r.added, 4);
});

t('faute volontaire corrigée par Claude -> remise', () => {
  const r = S.merge('C’était smuculent !', 'C’était succulent 🤤 !');
  assert.strictEqual(r.text, 'C’était smuculent 🤤 !');
  assert.ok(r.repaired >= 1);
});

t('phrase d’introduction ajoutée par Claude -> retirée', () => {
  const r = S.merge('On part.', 'Voici ton texte :\nOn part 🚀.');
  assert.strictEqual(r.text, 'On part 🚀.');
});

t('mot supprimé par Claude -> remis', () => {
  const r = S.merge('On a TRÈS faim.', 'On a faim 🤤.');
  assert.ok(S.sameWords('On a TRÈS faim.', r.text), r.text);
  assert.ok(r.text.includes('🤤'));
});

t('retours à la ligne fusionnés par Claude -> remis', () => {
  const src = 'Ligne une.\n\nLigne deux.';
  const r = S.merge(src, 'Ligne une 😴. Ligne deux 😂.');
  assert.ok(S.sameWords(src, r.text), JSON.stringify(r.text));
  assert.strictEqual(r.text.split('\n').length, 3);
});

t('smileys déjà tapés : gardés, pas doublés', () => {
  const r = S.merge('Au dodo 😴 enfin.', 'Au dodo 😴💤 enfin 🥱.');
  assert.strictEqual(r.text, 'Au dodo 😴💤 enfin 🥱.');
});

t('smiley déjà tapé oublié par Claude -> remis', () => {
  const r = S.merge('Au dodo 😴 enfin.', 'Au dodo enfin 🥱.');
  assert.ok(r.text.includes('😴') && r.text.includes('🥱'), r.text);
});

t('réponse sans rapport -> texte d’origine', () => {
  const src = 'abc '.repeat(50);
  const r = S.merge(src, 'Désolé, je ne peux pas.');
  assert.ok(S.sameWords(src, r.text));
});

// Sur les 76 vrais textes : on retire les smileys puis on reporte ceux d'origine.
const file = process.argv[2];
if (file) {
  const steps = JSON.parse(fs.readFileSync(file, 'utf8'));
  let parfait = 0;
  steps.forEach((st, i) => {
    t(`vrai texte ${i} (jour ${st.jour})`, () => {
      const saisie = sansSmileys(st.texte);
      const r = S.merge(saisie, st.texte);
      assert.ok(S.sameWords(saisie, r.text), 'mots modifiés');
      assert.strictEqual(S.countEmojis(r.text), S.countEmojis(st.texte), 'nombre de smileys');
      assert.strictEqual(r.repaired, 0, 'réparations inattendues');
      if (r.text === st.texte) parfait++;
    });
  });
  console.log(`identiques au caractère près : ${parfait}/${steps.length}`);
}

console.log(`${ok} réussis, ${ko} en échec`);
process.exit(ko ? 1 : 0);

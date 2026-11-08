# Smileys Polarsteps

Ajoute les smileys dans un texte Polarsteps, sans changer un seul mot.

**Ouvrir :** https://libertadia05.github.io/polarsteps-smileys/
Sur iPhone : Safari → Partager → « Sur l'écran d'accueil ». Sur Android : Chrome → ⋮ → « Installer l'application ».

## Utilisation

1. La première fois, coller la clé API Anthropic (`sk-ant-…`). Elle reste dans le téléphone uniquement.
2. Coller le texte du jour → « Ajouter les smileys ✨ ».
3. Retoucher si besoin → « Copier » → coller dans Polarsteps. « Refaire » donne une autre proposition.

## Comment ça marche

- `consigne.js` : les règles données à Claude (Sonnet 5.5) : émotions d'abord, un smiley répété pour compter, 👱‍♀️ pour les bêtises, au moins 1 smiley par paragraphe (2 si plus de ~10 lignes).
- `exemples.js` : 15 textes de Marina (jours 64 à 126 du voyage Amérique Latine) pris comme modèle.
- `core.js` : le garde-fou. Les smileys proposés par Claude sont reportés sur le texte d'origine : si Claude change un mot, une faute voulue ou un retour à la ligne, le texte d'origine est remis.
- Tests : `node tests/core.test.js` (garde-fou) ; `node tests/essai-reel.mjs <steps.json> <rapport.html>` (essai avec l'API, clé dans `ANTHROPIC_API_KEY`).

Coût : environ 0,04 $ par texte.

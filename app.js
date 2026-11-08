// Interface : coller le texte, ajouter les smileys avec Claude, copier.
import Anthropic from 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.3.0/+esm';

const { merge, sameWords } = window.Smileys;
const { parametres } = window.Consigne;
const EXEMPLES = window.EXEMPLES;

const CLE = 'smileys.cle';
const BROUILLON = 'smileys.brouillon';

const lire = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const ecrire = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* stockage indisponible */ } };

const $ = (id) => document.getElementById(id);
const el = {
  cleCarte: $('cle-carte'), cleChamp: $('cle-champ'), cleOk: $('cle-ok'), cleErreur: $('cle-erreur'),
  travail: $('travail'), source: $('source'), compteur: $('compteur'), go: $('go'),
  resultat: $('resultat'), statut: $('statut'), sortie: $('sortie'),
  copier: $('copier'), refaire: $('refaire'), nouveau: $('nouveau'),
  reglages: $('reglages'), changerCle: $('changer-cle'),
};

let enCours = null;

function afficherCle(visible) {
  el.cleCarte.hidden = !visible;
  el.travail.hidden = visible;
  el.reglages.hidden = visible;
  if (visible) setTimeout(() => el.cleChamp.focus(), 50);
}

function majCompteur() {
  const n = el.source.value.trim().length;
  el.compteur.textContent = n ? `${n} caractères` : '';
  el.go.disabled = n === 0 || !!enCours;
}

function statut(type, texte) {
  el.statut.className = `statut ${type}`;
  el.statut.textContent = texte;
}

function occupe(oui) {
  el.go.disabled = oui || el.source.value.trim().length === 0;
  el.refaire.disabled = oui;
  el.copier.disabled = oui;
  el.go.classList.toggle('chargement', oui);
  el.go.textContent = oui ? 'Claude réfléchit…' : 'Ajouter les smileys ✨';
  el.sortie.readOnly = oui;
}

function messageErreur(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'La clé API est refusée. Vérifie-la dans les réglages (en bas de la page).';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Cette clé n’a pas le droit d’utiliser ce modèle.';
  if (err instanceof Anthropic.RateLimitError) return 'Trop de demandes d’un coup, ou plafond de dépense atteint. Réessaie dans une minute.';
  if (err instanceof Anthropic.APIConnectionError) return 'Pas de connexion internet. Réessaie quand tu as du réseau.';
  if (err instanceof Anthropic.InternalServerError) return 'Claude est surchargé en ce moment. Réessaie dans une minute.';
  if (err instanceof Anthropic.APIError) return `Erreur de Claude (${err.status || '?'}) : ${err.message}`;
  return `Erreur inattendue : ${err && err.message ? err.message : err}`;
}

async function lancer() {
  const texte = el.source.value;
  if (!texte.trim() || enCours) return;
  const cle = lire(CLE);
  if (!cle) { afficherCle(true); return; }

  el.resultat.hidden = false;
  el.sortie.value = '';
  statut('attente', 'Claude place les smileys…');
  occupe(true);
  el.resultat.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const client = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true });
  try {
    const stream = client.beta.messages.stream(parametres(texte, EXEMPLES));
    enCours = stream;
    stream.on('text', (bout) => {
      el.sortie.value += bout;
      el.sortie.scrollTop = el.sortie.scrollHeight;
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === 'refusal') {
      el.sortie.value = texte;
      statut('alerte', 'Claude a refusé ce texte. Ton texte d’origine est remis tel quel.');
      return;
    }
    const propose = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const r = merge(texte, propose);
    el.sortie.value = r.text;

    if (r.repaired < 0 || !sameWords(texte, r.text)) {
      el.sortie.value = texte;
      statut('alerte', 'Claude a trop changé le texte : rien n’a été ajouté. Appuie sur « Refaire ».');
    } else if (r.repaired > 0) {
      statut('ok', `✅ ${r.added} smileys ajoutés. Claude avait touché à ton texte à ${r.repaired} endroit${r.repaired > 1 ? 's' : ''} : c’est remis comme tu l’avais écrit.`);
    } else {
      statut('ok', `✅ ${r.added} smileys ajoutés, ton texte est intact.`);
    }
    if (msg.stop_reason === 'max_tokens') statut('alerte', 'Texte trop long : la fin n’a pas reçu de smileys.');
  } catch (err) {
    el.sortie.value = texte;
    statut('alerte', messageErreur(err));
    if (err instanceof Anthropic.AuthenticationError) {
      ecrire(CLE, '');
      el.cleErreur.textContent = 'Claude refuse cette clé. Colle une clé valide (elle commence par « sk-ant- »).';
      afficherCle(true);
    }
  } finally {
    enCours = null;
    occupe(false);
  }
}

async function copier() {
  const t = el.sortie.value;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    el.sortie.readOnly = false;
    el.sortie.select();
    document.execCommand('copy');
  }
  el.copier.textContent = 'Copié ✓';
  setTimeout(() => { el.copier.textContent = 'Copier'; }, 1800);
}

function enregistrerCle() {
  const v = el.cleChamp.value.trim();
  if (!/^sk-ant-/.test(v)) {
    el.cleErreur.textContent = 'Une clé Anthropic commence par « sk-ant- ».';
    return;
  }
  ecrire(CLE, v);
  el.cleChamp.value = '';
  el.cleErreur.textContent = '';
  afficherCle(false);
}

el.source.value = lire(BROUILLON);
el.source.addEventListener('input', () => { ecrire(BROUILLON, el.source.value); majCompteur(); });
el.go.addEventListener('click', lancer);
el.refaire.addEventListener('click', lancer);
el.copier.addEventListener('click', copier);
el.nouveau.addEventListener('click', () => {
  el.source.value = '';
  ecrire(BROUILLON, '');
  el.resultat.hidden = true;
  majCompteur();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  el.source.focus();
});
el.cleOk.addEventListener('click', enregistrerCle);
el.cleChamp.addEventListener('keydown', (e) => { if (e.key === 'Enter') enregistrerCle(); });
el.changerCle.addEventListener('click', () => {
  if (lire(CLE) && !confirm('Effacer la clé enregistrée sur ce téléphone ?')) return;
  ecrire(CLE, '');
  afficherCle(true);
});

afficherCle(!lire(CLE));
majCompteur();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

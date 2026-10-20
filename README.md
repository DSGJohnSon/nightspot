# NightSpot

Jeu de soirée sur grand écran : la TV affiche la partie, les téléphones servent de buzzers.
Premier module : **Guess the Clip** — une capture de clip s'affiche, chacun cherche le morceau sur son
téléphone, puis le clip prend vie sur la TV.

## Démarrer

Prérequis : Node 22+, pnpm, et pour ajouter des clips : `yt-dlp` **à jour** (`yt-dlp -U`) et `ffmpeg`.

```bash
pnpm install
pnpm dev            # serveur sur :3001, front sur :5173
```

1. Sur la TV (ou le PC branché dessus) : ouvre `http://localhost:5173/tv`, règle la partie, **Créer la partie**.
2. Les téléphones, **sur le même Wi-Fi**, scannent le QR code (il pointe vers l'IP locale du PC).
3. **Lancer la partie**. Entrée / Espace / → font avancer les écrans.

> Windows peut demander d'autoriser Node sur le réseau privé : accepte, sinon les téléphones ne
> joignent pas le PC. Si le QR code affiche la mauvaise IP, définis `PUBLIC_URL=http://<ip>:5173`.

### Configuration (`apps/server/.env`, non versionné)

```ini
ADMIN_PASSWORD=...        # active l'espace admin (/admin) ; sans lui, l'admin est fermé
YTDLP_PATH=...            # facultatif, si yt-dlp / ffmpeg ne sont pas dans le PATH
FFMPEG_PATH=...
PUBLIC_URL=...            # facultatif, adresse publique pour le QR code
```

## Espace admin — `http://localhost:5173/admin`

- **Ajouter des clips** : colle des liens YouTube et/ou des lignes « Artiste – Titre » (une par ligne ;
  puces, numéros, « (année) » et « [thèmes] » ignorés). Pour une ligne de texte, le clip officiel est
  cherché sur YouTube (titre de la chanson présent, « official », chaîne de l'artiste ou VEVO, vues ;
  paroles, reprises, live et pistes « - Topic » écartés), avec « Changer de vidéo » si le choix est
  mauvais. Une erreur passagère de YouTube se rattrape avec « Réessayer ». Certaines vidéos (souvent
  VEVO / grands labels, ex. Disney) sont protégées contre le téléchargement : l'analyse récupère alors
  les infos via le lecteur web et les images générées par YouTube, et l'on peut coller sa propre
  capture d'écran (Ctrl+V) — aussi possible dans la fiche d'un clip. Pour chaque clip, le serveur récupère les
  infos de la vidéo, trouve le morceau sur Deezer (titre, artiste, featuring, année, IDs pour valider
  les réponses), les vues YouTube, et extrait 4 captures candidates aux moments les plus revus
  (pics de la courbe « Most replayed », espacés d'au moins 15 s, hors début et fin ; à défaut des
  repères fixes). Chaque capture indique son origine, la courbe est affichée avec les captures
  (clic = choisir un instant), et on peut écouter le reveal sous la capture puis l'arrêter.
  Tu choisis la capture (ou un instant précis), vérifies les champs,
  coches les thèmes et confirmes. Si la détection s'est trompée de morceau, une recherche Deezer
  dans la fiche permet de choisir le bon (ou « saisie manuelle » s'il n'existe pas sur Deezer).
- **Catalogue** : recherche, filtres, édition (champs, nouvelle capture, départ du clip au reveal,
  difficulté forcée), suppression, date du dernier passage.
- **Thèmes** : création, renommage, suppression. Un clip peut avoir plusieurs thèmes.
- **Mettre à jour les vues** : relit les vues YouTube de tout le catalogue et recalcule les difficultés.
- **Régler les seuils** : vues minimales de chaque niveau, avec la répartition du catalogue en direct
  (enregistrés dans `data/settings.json`). Deux propositions automatiques : « niveaux équilibrés »
  (autant de clips par niveau) ou « échelle des vues » (paliers logarithmiques réguliers entre le clip
  le plus vu et le moins vu). Rien n'est enregistré sans validation ; les seuils restent fixes ensuite.

## Comment ça marche

```
TV  (/tv/:code)   ──┐                         ┌── moteur de session (phases, timer, scores)
                    ├── Socket.IO ── serveur ─┤
Tél (/play/:code) ──┘                         └── modules de jeu (guess-the-clip…)

HTTP : /api/search (proxy Deezer) · /api/catalog (filtres) · /api/admin/* · /media/:code/:round
```

- **Le serveur fait autorité** : il horodate les réponses, corrige et calcule les points.
  Les téléphones ne reçoivent jamais la réponse ni la capture avant le reveal.
- **Déroulé d'une manche** : `prepare` (la TV précharge la capture) → `question` (chrono, qui
  s'arrête dès que tous les joueurs connectés ont répondu) → `reveal` (le clip YouTube démarre à
  l'instant de la capture, les réponses de chacun s'affichent pendant la durée réglée) → `scores`
  (le classement remplace les réponses, le clip continue jusqu'à ce que l'hôte passe à la suite).
- **Création de partie** : longueur, chrono, durée des réponses (30 s par défaut, valeur libre
  possible), type de recherche, et filtres thèmes / époques / difficultés avec le nombre de clips
  disponibles. Dans l'admin, l'aperçu du reveal montre ces 30 s par une barre verte.
- **Recherche des joueurs** : Deezer (rapide, données propres, sans quota). Les clips du catalogue
  absents de Deezer (ajoutés sans correspondance, ex. chansons de YouTubeurs) sont ajoutés en tête des
  résultats, sans pochette pour ne rien dévoiler.
- **Points** : titre 600, artiste 400 (validé par ID Deezer, feat. compris), × bonus de vitesse
  (100 % → 50 % sur la durée du chrono) × **difficulté**.
- **Difficulté** : d'après les vues YouTube du clip et des seuils fixes, réglables dans l'admin
  (par défaut ≥ 1 Md Facile ×1, ≥ 300 M Moyen ×1,25, ≥ 100 M Difficile ×1,5, ≥ 20 M Expert ×1,75,
  en dessous Impossible ×2). Le niveau d'un clip ne dépend que de lui. Une difficulté forcée dans
  l'admin l'emporte (utile pour les titres récents ou très connus chez vous mais peu vus).
- **Bonus année** : pendant le reveal, chacun peut tenter l'année de sortie (une seule tentative) :
  pile +100, à 1 an +50, à 2 ans +25, crédités tout de suite et annoncés en grand sur la TV.
  L'année et les tentatives restent cachées jusqu'au classement. Pas de multiplicateur.
- **Pas de répétitions** : chaque clip joué est noté dans `data/history.json` ; le tirage prend
  d'abord les clips jamais joués, puis les plus anciens. Supprimer le fichier remet tout à zéro.
- **Joueurs hors ligne** : signalés sur la TV en moins de 20 s ; la manche ne les attend pas.
- **Reconnexion** : chaque téléphone garde un jeton ; un téléphone sorti de veille reprend sa place.

### Données (`apps/server/data/`)

`clips.json` (catalogue, une ligne par clip), `themes.json`, `media/` (captures, non versionnées),
`history.json` et `drafts.json` (propres à chaque machine). `year` = année de **première sortie**
du titre (album ou single). `pnpm clips:enrich` complète en lot ce qui manque (IDs Deezer, vues,
captures) pour des clips ajoutés à la main dans `clips.json`.

Si l'extraction échoue avec une erreur 403, mets `yt-dlp` à jour (`yt-dlp -U`).

### Ajouter un module

Un module implémente `GameModule` (`apps/server/src/modules/types.ts`) : tirer des questions selon
les filtres, donner leur difficulté, fournir l'image et la solution, évaluer une réponse. Le moteur
gère tout le reste (joueurs, timer, vitesse, difficulté, bonus année, classement). Il s'enregistre
dans `modules/registry.ts`.

## Vérifier

```bash
pnpm typecheck
pnpm --filter @nightspot/server smoke   # une partie complète simulée contre un serveur lancé
```

Pour tester sans toucher aux vraies données, copie `apps/server/data` ailleurs et lance un serveur
dessus : `DATA_DIR=/tmp/ns PORT=3002 pnpm start`, puis
`DATA_DIR=/tmp/ns SMOKE_URL=http://127.0.0.1:3002 pnpm --filter @nightspot/server smoke`
(et `API_URL=http://127.0.0.1:3002` pour brancher le front Vite dessus).

## Structure

```
apps/server     Fastify + Socket.IO, moteur de session, modules, admin, proxy Deezer, scripts
apps/web        Vite + React + Tailwind : TV (/tv), téléphone (/join, /play), admin (/admin)
packages/shared types, événements Socket.IO, barème, normalisation des titres, schémas Zod
```

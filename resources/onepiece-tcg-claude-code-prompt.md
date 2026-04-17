# One Piece TCG Simulator — Prompt maître pour Claude Code

## Contexte général

Tu es mon assistant de développement pour un simulateur complet du jeu de cartes **One Piece TCG**,
jouable en 1v1 dans le navigateur. Tu vas m'aider à construire ce projet étape par étape.

Règles de collaboration :
- Tu respectes scrupuleusement l'architecture et la stack ci-dessous, sans les remettre en question.
- À chaque étape, tu me fournis les fichiers à créer/modifier ET les commandes à lancer.
- Tu ne passes à l'étape suivante que lorsque je t'ai confirmé que les critères d'acceptation sont validés.
- Si quelque chose est ambigu (règle de jeu, choix d'implémentation), tu me poses une question avant d'implémenter.
- Tu ne fais jamais d'hypothèses silencieuses.

---

## 1. Objectifs du projet

- Simuler le One Piece TCG officiel en 1v1 (Leader, DON!!, phases, effets, KO, dégâts, etc.).
- Respecter au maximum les règles officielles.
- Avoir un **moteur de jeu totalement indépendant du rendu**, pour pouvoir changer de moteur graphique
  plus tard (2D → 3D, Pixi → Three.js, etc.) sans toucher à la logique de jeu.
- Rendu initial en **2D animée avec PixiJS**, mais architecture prête à évoluer vers la 3D (Pixi3D ou Three.js).
- Jouable d'abord en **local / hotseat**, puis plus tard en **multijoueur réseau**.

---

## 2. Stack technique (non négociable)

| Couche | Technologie |
|---|---|
| Langage | TypeScript partout (moteur, client, serveur) |
| Monorepo | pnpm workspaces |
| Bundler / dev server | Vite |
| Tests | Vitest |
| Rendu 2D | PixiJS 8.x |
| Animations | GSAP |
| UI (menus, lobby, deckbuilder) | React 18 |
| Backend (plus tard) | Node.js + Socket.IO |
| Données cartes (plus tard) | OPTCGDB / optcgapi.com |
| Pipeline effets (plus tard) | LLM (Claude/OpenAI) → JSON DSL → validator TS |

---

## 3. Structure cible du monorepo

```
onepiece-tcg/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json

  packages/
    game-engine/
      src/
        index.ts
        types/
        core/
        rules/
        effects/
      tests/
      package.json
      tsconfig.json

    cards-dsl/              ← Étape 7
      src/
        schema/
        parser/
      package.json
      tsconfig.json

  apps/
    client/
      src/
        main.tsx
        ui/
        pixi/
      package.json
      tsconfig.json
      vite.config.ts

    server/                 ← Étape 8
      src/
        index.ts
        websocket/
      package.json
      tsconfig.json
```

---

## 4. Architecture du moteur de jeu (game-engine)

### Principe fondamental

```
applyAction(state: GameState, action: GameAction): GameState | GameError
```

Fonction **pure** (ou quasi-pure). Aucune dépendance à Pixi, React, ou au DOM.
Toute logique de jeu passe par cette fonction. Jamais de logique cachée dans le rendu.

### Concepts clés

**GameState** — état complet de la partie :
- Les deux joueurs et leurs zones respectives
- Phase en cours
- Joueur actif, numéro de tour
- Historique des actions (pour replay / debug)

**PlayerState** — état isolé d'un joueur :
- Zones : `leader`, `life`, `deck`, `hand`, `board`, `donDeck`, `donArea`, `trash`

**Card** :
- Données statiques : `id`, `name`, `color`, `cost`, `power`, `type`
  (Leader | Character | Event | Stage), mots-clés (Rush, Blocker, Banish, etc.), texte d'effet
- Données dynamiques : zone actuelle, power modifié, marqueurs, état reposé/actif (rested/active),
  DON!! attachés

**GameAction** — ce qu'un joueur tente de faire :
`StartGame`, `DrawCard`, `DrawPhase`, `PlayCharacterFromHand`, `PlayEvent`,
`AssignDon`, `ReturnDon`, `DeclareAttack`, `DeclareBlock`, `ActivateEffect`,
`EndPhase`, `EndTurn`

**GamePhase** :
`Refresh` → `Draw` → `DON!!` → `Main` → `End`

**GameError** — erreur typée retournée quand une action est illégale :
`NOT_YOUR_TURN`, `INSUFFICIENT_DON`, `INVALID_TARGET`, `DECK_EMPTY`, etc.

### Règles officielles à implémenter progressivement

- **Phase Refresh** : dépliage du Leader et des cartes reposées, récupération des DON!! actifs.
- **Phase Draw** : le joueur actif pioche 1 carte (sauf au tour 1 du joueur qui commence).
- **Phase DON!!** : le joueur actif pioche 2 DON!! depuis son donDeck et les place en donArea.
- **Phase Main** : jouer des cartes (coût en DON!!), attaquer, activer des effets.
  - Jouer un Character : payer son coût en DON!!, le poser sur le board en état actif.
  - Jouer un Event : payer son coût, résoudre l'effet, envoyer à la trash.
  - Jouer un Stage : payer son coût, remplacer le stage actuel.
  - Déclarer une attaque : reposer l'attaquant, choisir une cible (Character ou Leader adverse).
  - Assigner des DON!! à une carte : augmente le power temporairement.
  - Bloquer : utiliser un Character avec le mot-clé Blocker pour rediriger l'attaque.
- **Phase End** : le joueur actif retourne tous ses DON!! en donArea (dé-assignment),
  main réduite à 10 cartes max.
- **Condition de victoire** : un joueur perd quand son Leader subit des dégâts alors que sa zone Life est vide,
  ou quand il doit piocher depuis un deck vide.
- **Dégâts** : quand une attaque non bloquée touche le Leader, on révèle la carte du dessus de Life.
  Si c'est un Trigger, son effet peut s'activer.

---

## 5. Détail des étapes de développement

---

### ÉTAPE 1 — Setup monorepo + squelette game-engine

**Objectif** : avoir un monorepo TypeScript fonctionnel avec un game-engine compilable et testable.

**À produire** :
- `package.json` racine (pnpm workspaces, scripts globaux)
- `pnpm-workspace.yaml`
- `tsconfig.base.json` (strict, paths, etc.)
- `packages/game-engine/package.json` (Vitest, pas de dépendances DOM)
- `packages/game-engine/tsconfig.json` (extends base)
- `packages/game-engine/src/types/index.ts` :
  - `CardId`, `PlayerId` (branded types)
  - `Zone` (union : `'deck' | 'hand' | 'board' | 'donDeck' | 'donArea' | 'life' | 'leader' | 'trash'`)
  - `CardType` (`'Leader' | 'Character' | 'Event' | 'Stage'`)
  - `Card` (données statiques + dynamiques minimales)
  - `GameState` simplifié (deck + hand + discard par joueur pour commencer)
  - `GameAction` : `DrawCard` pour commencer
  - `GameError` typée
- `packages/game-engine/src/core/applyAction.ts` : gère `DrawCard`
- `packages/game-engine/src/index.ts` : exporte tout
- `packages/game-engine/tests/drawCard.test.ts` :
  - Test 1 : `DrawCard` → `deck.length` diminue de 1
  - Test 2 : `DrawCard` → `hand.length` augmente de 1
  - Test 3 : `DrawCard` sur deck vide → retourne `GameError` (`DECK_EMPTY`)

**Critères d'acceptation** :
- [ ] `pnpm install` à la racine fonctionne sans erreur
- [ ] `pnpm --filter game-engine test` : tous les tests passent
- [ ] `pnpm --filter game-engine build` : compile sans erreur TypeScript
- [ ] Aucune dépendance à Pixi / React / DOM dans `game-engine`
- [ ] `GameError` est un type discriminé (pas un simple `throw`)

---

### ÉTAPE 2 — Modélisation complète des zones et phases One Piece TCG

**Objectif** : étendre `GameState` pour couvrir toutes les zones officielles et implémenter
les premières actions du jeu réel.

**À produire** :
- Étendre `types/index.ts` :
  - `PlayerState` avec toutes les zones : `leader`, `life`, `deck`, `hand`, `board`, `donDeck`, `donArea`, `trash`
  - `GamePhase` : `'Refresh' | 'Draw' | 'DON' | 'Main' | 'End'`
  - `GameState` complet : `phase`, `activePlayer`, `turnNumber`, `players`
  - `GameAction` étendu : `StartGame`, `DrawPhase`, `PlayCharacterFromHand`,
    `AssignDon`, `ReturnDon`, `EndPhase`
- Implémenter ces actions dans `applyAction` :
  - `StartGame` : mélange les decks, distribue 5 cartes en main, place le Leader, initialise 5 Life,
    met 10 cartes dans donDeck
  - `DrawPhase` : pioche 1 carte
  - `PlayCharacterFromHand` : vérifie le coût DON, retire les DON!!, déplace la carte sur le board
  - `AssignDon` : déplace 1 DON!! depuis donArea vers la carte cible
  - `ReturnDon` : retire tous les DON!! assignés et les remet en donArea
  - `EndPhase` : avance la phase, change le joueur actif si nécessaire
- Tests couvrant chaque action et chaque `GameError` associée

**Critères d'acceptation** :
- [ ] `GameState` reflète toutes les zones officielles
- [ ] `StartGame` produit un état initial conforme aux règles
- [ ] Chaque action illégale retourne une `GameError` typée correcte
- [ ] Les tests couvrent les cas nominaux ET les cas d'erreur
- [ ] Aucune régression sur les tests de l'Étape 1
- [ ] Compilation sans erreur

---

### ÉTAPE 3 — Phases complètes : Refresh, DON!!, End

**Objectif** : implémenter les phases manquantes pour avoir une boucle de tour complète.

**À produire** :
- `packages/game-engine/src/rules/phases.ts` :
  - `applyRefreshPhase` : déplie le Leader + cartes reposées, récupère les DON!! actifs
  - `applyDonPhase` : pioche 2 DON!! depuis donDeck → donArea
  - `applyEndPhase` : retourne les DON!! assignés, défausse jusqu'à 10 cartes si main > 10
- Intégrer ces fonctions dans `applyAction` via `EndPhase`
- `packages/game-engine/src/rules/turnManager.ts` :
  - Gère l'enchaînement des phases dans le bon ordre
  - Gère le passage du tour à l'adversaire
- Tests couvrant la boucle de tour complète (tour 1 joueur A → tour 1 joueur B → tour 2 joueur A)

**Critères d'acceptation** :
- [ ] Un tour complet peut se dérouler via `applyAction` uniquement
- [ ] La séquence des phases est correcte et ne peut pas être sautée
- [ ] Les DON!! sont bien gérés (pioche, assignation, retour en fin de tour)
- [ ] La règle "pas de pioche au tour 1 du premier joueur" est respectée
- [ ] Tests couvrant la boucle complète
- [ ] Aucune régression

---

### ÉTAPE 4 — Système de combat (attaque, blocage, dégâts, KO)

**Objectif** : implémenter la mécanique de combat centrale du One Piece TCG.

**À produire** :
- Ajouter les actions : `DeclareAttack`, `DeclareBlock`, `ResolveCombat`
- `packages/game-engine/src/rules/combat.ts` :
  - Calcul du power total (power de base + DON!! assignés + éventuels modificateurs)
  - Résolution de l'attaque :
    - Si attaque bloquée : comparaison des powers, la carte avec le power le plus faible est KO
    - Si attaque sur un Character non bloqué : le Character est KO si power attaquant > power défenseur
    - Si attaque sur le Leader non bloquée : révèle le top de la zone Life, gère les Triggers
  - Gestion du KO : carte envoyée à la trash
  - Gestion des dégâts Leader : révèle 1 carte depuis Life, si Life vide → défaite
- `packages/game-engine/src/rules/victory.ts` : `checkVictoryCondition(state): PlayerId | null`
- Tests de combat :
  - Attaque sur Character → KO si power suffisant
  - Attaque sur Leader → dégât pris, carte Life révélée
  - Blocage correct / incorrect
  - Condition de victoire déclenchée

**Critères d'acceptation** :
- [ ] Le système de combat respecte les règles officielles
- [ ] Les Triggers depuis la zone Life sont détectés (même si non résolus encore)
- [ ] La condition de victoire est vérifiée après chaque action pertinente
- [ ] KO envoie bien la carte en trash
- [ ] Tests couvrant tous les cas de combat
- [ ] Aucune régression

---

### ÉTAPE 5 — Client Vite + React + canvas PixiJS (plateau minimal)

**Objectif** : afficher un plateau 2D minimal qui reflète un `GameState` réel issu du moteur.

**À produire** :
- `apps/client/` complet avec Vite + React 18 + TypeScript
- `apps/client/src/pixi/PixiApp.ts` :
  - Initialise une `Application` PixiJS 8 (WebGL + canvas fallback)
  - Expose une méthode `render(state: GameState): void`
  - Ne contient aucune logique de jeu
- `apps/client/src/pixi/zones/` :
  - Un fichier par zone (HandZone, BoardZone, DonZone, LeaderZone, LifeZone)
  - Chaque zone sait se positionner et afficher ses cartes
- `apps/client/src/pixi/CardSprite.ts` :
  - Rectangle coloré + texte (nom, power, coût) en placeholder
  - Prêt à recevoir une texture plus tard
- `apps/client/src/ui/GameCanvas.tsx` :
  - Composant React qui monte le canvas Pixi dans un `useEffect`
  - Reçoit `GameState` en prop, appelle `pixiApp.render(state)` à chaque changement
  - React ne touche pas au cycle de rendu interne de Pixi
- `apps/client/src/ui/GameUI.tsx` :
  - Indicateurs HTML/CSS en overlay : joueur actif, phase, nombre de cartes, DON!! disponibles
- Un `GameState` de test initialisé via `StartGame` du moteur passé au canvas

**Critères d'acceptation** :
- [ ] `pnpm --filter client dev` lance le client sur localhost sans erreur
- [ ] Le canvas PixiJS affiche les zones des deux joueurs (haut/bas)
- [ ] Les cartes placeholder sont visibles dans hand, board, donArea, leader, life
- [ ] Le `GameState` affiché provient du `game-engine` (import du package)
- [ ] L'overlay React affiche la phase et le joueur actif
- [ ] React et Pixi sont bien isolés (React ne gère pas le contenu du canvas)

---

### ÉTAPE 6 — Boucle d'interaction complète (actions joueur → moteur → rendu)

**Objectif** : rendre le jeu interactif en local/hotseat pour les deux joueurs.

**À produire** :
- Rendre les cartes cliquables dans PixiJS (`pointerdown`) :
  - Clic sur carte en main → `PlayCharacterFromHand` ou sélection pour autre usage
  - Clic sur DON!! → `AssignDon` à la carte cible
  - Clic sur carte du board → `DeclareAttack`
  - Clic sur carte adverse → cible d'une attaque ou d'un effet
- `apps/client/src/ui/ActionPanel.tsx` :
  - Boutons HTML : "Fin de phase", "Passer le tour", "Déclarer une attaque"
  - Affiche les actions disponibles selon la phase en cours
- Gestion du flux d'état dans React :
  - `useState<GameState>` à la racine
  - Chaque interaction crée une `GameAction` → `applyAction` → nouveau state → re-render Pixi
  - Si `applyAction` retourne une `GameError`, afficher un message à l'utilisateur
- Animations GSAP :
  - Carte jouée depuis la main : glissement vers le board
  - Carte KO : fondu + déplacement vers la trash
  - Dégât Leader : flash sur la zone Life

**Critères d'acceptation** :
- [ ] Une partie hotseat complète peut se jouer (jusqu'à la condition de victoire)
- [ ] Toute action passe par `applyAction` (aucune mutation directe du state)
- [ ] Les `GameError` sont affichées à l'utilisateur de manière lisible
- [ ] Les animations GSAP fonctionnent sur les actions principales
- [ ] Le changement de joueur en hotseat est clair (indication visuelle)
- [ ] Aucune logique de jeu dans le rendu Pixi ou les composants React

---

### ÉTAPE 7 — Système d'effets de cartes + DSL

**Objectif** : permettre aux cartes d'avoir des effets interprétables par le moteur.

**À produire** :
- `packages/cards-dsl/src/schema/effectSchema.ts` :
  - Schéma JSON TypeScript pour représenter les effets de cartes
  - Couvre : `OnPlay`, `OnAttack`, `OnKO`, `Trigger`, `Blocker`, `Rush`, `Banish`, effets conditionnels
  - Chaque effet est une structure typée, pas du texte libre
- `packages/cards-dsl/src/parser/effectParser.ts` :
  - Valide un objet JSON contre le schéma
  - Retourne des erreurs de validation typées
- `packages/game-engine/src/effects/effectResolver.ts` :
  - Prend un effet DSL + un `GameState` + une cible
  - Retourne un nouveau `GameState`
  - Gère les effets courants : piocher des cartes, KO une carte, booster le power,
    retourner une carte en main, chercher dans le deck
- Jeu de données de test : 10 cartes avec des effets variés encodés en DSL
- Tests de résolution d'effets

**Critères d'acceptation** :
- [ ] Le schéma DSL couvre les types d'effets les plus courants du One Piece TCG
- [ ] Le validator rejette les effets malformés avec des erreurs claires
- [ ] L'`effectResolver` résout correctement les 10 cartes de test
- [ ] Les effets sont bien intégrés dans la boucle `applyAction`
- [ ] Aucune régression

---

### ÉTAPE 8 — Pipeline LLM pour générer les effets depuis le texte des cartes

**Objectif** : automatiser la conversion du texte officiel des cartes en DSL d'effets.

**Contexte** : ce pipeline tourne **hors runtime** (phase de pré-processing), pas pendant les parties.

**À produire** :
- Script `packages/cards-dsl/src/pipeline/fetchCards.ts` :
  - Appelle l'API OPTCGDB (optcgapi.com) pour récupérer les données des cartes
  - Stocke les données brutes en JSON
- Script `packages/cards-dsl/src/pipeline/generateEffects.ts` :
  - Pour chaque carte, envoie le texte d'effet à un LLM (Claude via API Anthropic)
  - Prompt système : tu es un parseur d'effets de cartes One Piece TCG, retourne uniquement du JSON
    conforme au schéma DSL fourni
  - Récupère la réponse, la valide via `effectParser`
  - En cas d'échec de validation, log l'erreur + la carte pour révision manuelle
- Script `packages/cards-dsl/src/pipeline/validateAll.ts` :
  - Valide l'ensemble des effets générés en batch
  - Produit un rapport : X cartes valides, Y cartes à réviser
- Les effets générés sont stockés dans `packages/cards-dsl/data/effects/`

**Critères d'acceptation** :
- [ ] Le script de fetch récupère les cartes depuis OPTCGDB sans erreur
- [ ] Le pipeline LLM génère du JSON valide pour au moins 80% des cartes testées
- [ ] Les cartes avec effets invalides sont loggées clairement pour révision manuelle
- [ ] Le validator batch produit un rapport lisible
- [ ] Le pipeline est entièrement scriptable (une commande pour tout lancer)
- [ ] **Le LLM n'est jamais appelé pendant une partie** (uniquement en pré-processing)

---

### ÉTAPE 9 — Backend Node.js + Socket.IO (multijoueur en ligne)

**Objectif** : permettre des parties 1v1 en ligne avec un serveur autoritatif.

**À produire** :
- `apps/server/` avec Node.js + TypeScript + Socket.IO
- Architecture serveur autoritatif :
  - Le serveur importe `game-engine` et maintient le `GameState` côté serveur
  - Les clients envoient des `GameAction` au serveur via WebSocket
  - Le serveur applique `applyAction`, valide, et broadcast le nouvel état aux deux clients
  - Le client n'applique jamais `applyAction` directement en multijoueur (uniquement pour l'optimistic UI éventuel)
- Gestion des rooms : création, rejoindre une partie, reconnexion
- `apps/client/src/network/socketClient.ts` :
  - Gère la connexion Socket.IO
  - Envoie les actions, reçoit les états
  - S'intègre dans le même flux `useState<GameState>` React qu'en local

**Critères d'acceptation** :
- [ ] Deux navigateurs distincts peuvent jouer une partie complète en ligne
- [ ] Le serveur est autoritatif : une action illégale côté client est rejetée
- [ ] La reconnexion à une partie en cours fonctionne
- [ ] Le code client peut fonctionner en mode local (hotseat) ou réseau sans changer de logique
- [ ] Aucune régression sur les parties locales

---

## 6. Comment travailler ensemble

1. **On commence par l'Étape 1.**
2. Tu me fournis tous les fichiers et commandes nécessaires.
3. Je valide les critères d'acceptation de mon côté (tests qui passent, compilation OK).
4. Je te confirme que l'étape est validée. Seulement à ce moment tu passes à la suivante.
5. Si un critère ne passe pas, tu corriges avant d'avancer.
6. Tu ne proposes jamais de simplification qui casserait l'architecture (ex : mettre de la logique dans le rendu).
7. Si tu as plusieurs façons d'implémenter quelque chose d'important, tu me proposes les options
   avec les trade-offs avant de choisir.

---

**Commence par l'Étape 1.**

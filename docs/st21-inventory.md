# ST-21 — Inventaire complet des cartes et mécaniques

> Généré le 2026-05-07. Sources : `packages/data/raw/ST-21.json`, `packages/data/effects/ST21-*.json`, `resources/rules/qa_st-21.md`, `packages/game-engine/src/types/index.ts`, `packages/game-engine/src/effects/effectResolver.ts`.

---

## Section 1 — Toutes les cartes

> Les variantes `_p1` (alternative art) sont des doublons exacts des cartes de base. Seules les cartes canoniques (sans suffixe) sont listées ici.

| id | nom | type | coût | puissance | effet |
|----|-----|------|------|-----------|-------|
| ST21-001 | Monkey.D.Luffy | Leader | 5 | 5000 | [DON!! x1] [Activate: Main] [Once Per Turn] Give up to 2 rested DON!! cards to 1 of your Characters. |
| ST21-002 | Usopp | Character | 2 | 3000 | [DON!! x2] [Opponent's Turn] This Character gains +2000 power. |
| ST21-003 | Sanji | Character | 2 | 3000 | [On Play] Select up to 1 of your {Straw Hat Crew} type Characters with 6000 power or more. If the selected Character attacks during this turn, your opponent cannot activate [Blocker]. |
| ST21-004 | Jewelry Bonney | Character | 1 | 3000 | [DON!! x2] [On K.O.] Draw 1 card. |
| ST21-005 | Jinbe | Character | 2 | 4000 | — (aucun effet) |
| ST21-006 | Stussy | Character | 3 | 5000 | — (aucun effet) |
| ST21-007 | Sentomaru | Character | 2 | 2000 | [Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.) |
| ST21-008 | Tony Tony.Chopper | Character | 4 | 6000 | — (aucun effet) |
| ST21-009 | Nami | Character | 3 | 1000 | [Activate: Main] [Once Per Turn] Give up to 2 rested DON!! cards to 1 of your {Straw Hat Crew} type Leader or Character cards. |
| ST21-010 | Nico Robin | Character | 3 | 4000 | [DON!! x2] [When Attacking] K.O. up to 1 of your opponent's Characters with 4000 power or less. |
| ST21-011 | Franky | Character | 3 | 4000 | [DON!! x2] [Opponent's Turn] All of your {Straw Hat Crew} type Characters with 4000 base power or less gain +1000 power. |
| ST21-012 | Brook | Character | 3 | 4000 | [When Attacking] Give up to 2 rested DON!! cards to your Leader or 1 of your Characters. |
| ST21-013 | Vegapunk | Character | 1 | 3000 | — (aucun effet) |
| ST21-014 | Monkey.D.Luffy | Character | 5 | 6000 | [Rush] [When Attacking] Give up to 1 rested DON!! card to your Leader or 1 of your Characters. |
| ST21-015 | Roronoa Zoro | Character | 4 | 5000 | [DON!! x2] This Character gains [Rush]. [On K.O.] Play up to 1 red Character card with 6000 power or less other than [Roronoa Zoro] from your hand. |
| ST21-016 | Gum-Gum Dawn Whip | Event | 2 | — | [Main] Up to 1 of your Leader or Character cards gains +1000 power during this turn. Then, up to 1 of your opponent's Characters with 4000 power or less cannot activate [Blocker] during this turn. [Trigger] K.O. up to 1 of your opponent's Characters with 4000 power or less. |
| ST21-017 | Gum-Gum Mole Pistol | Event | 4 | — | [Main] Give up to 1 of your opponent's Characters −5000 power during this turn. Then, if you have a Character with 6000 power or more, K.O. up to 1 of your opponent's Characters with 2000 power or less. [Trigger] Activate this card's [Main] effect. |

**Résumé de la section :** 17 cartes canoniques (1 Leader, 13 Characters, 2 Events, 0 Stage). Les variantes _p1 portent le même contenu de jeu.

---

## Section 2 — Mécaniques par groupe

### 2.1 — Rush

**Cartes concernées :** ST21-014 (keyword natif), ST21-015 (acquis via [DON!! x2] Activated)

**Statut engine :** ✅ Supporté

- `CardKeyword: 'Rush'` défini dans `types/index.ts`.
- `GiveKeyword` + `duration: 'Permanent'` utilisé pour ST21-015 ([DON!! x2] gives permanent Rush).
- Traitement Rush (attaque dès le tour de jeu) géré dans `applyAction.ts`.

---

### 2.2 — Blocker

**Cartes concernées :** ST21-007 (Sentomaru)

**Statut engine :** ✅ Supporté

- `CardKeyword: 'Blocker'` défini dans `types/index.ts`.
- Keyword déclaré dans le champ `keywords` de la carte via le DSL.
- Géré dans `applyAction.ts` (DeclareBlock action).
- **Note DSL :** Le fichier `ST21-007.json` actuel a `"keywords": []` — le keyword Blocker est absent. Il devrait être `"keywords": ["Blocker"]`. Bug de migration DSL.

---

### 2.3 — DON!! Manipulation (Activate: Main — Give rested DON)

**Cartes concernées :** ST21-001 (Leader), ST21-009 (Nami), ST21-012 (Brook via OnAttack), ST21-014 (Luffy via OnAttack)

**Statut engine :** ✅ Supporté

- `EffectAction: AttachDon` avec `from: 'rested'` et `target: ChooseOwnCharacter / ChooseOwnCharacterOrLeader`.
- Trigger `Activated` géré dans `resolveEffects` (condition `HasRestingDon` / `HasAttachedDon`).
- ST21-001 utilise `HasAttachedDon` (le Leader lui-même doit avoir un DON attaché) — condition correctement implémentée.
- ST21-009 filtre par subType `Straw Hat Crew` via `ChooseOwnCharacterOrLeader.subType` — supporté dans `selectTargets`.

---

### 2.4 — Passive PowerBoost [Opponent's Turn]

**Cartes concernées :** ST21-002 (Usopp, +2000 self), ST21-011 (Franky, +1000 tous Straw Hat Crew ≤4000 power)

**Statut engine :** ⚠️ Partiellement implémenté

**ST21-002 :** Utilise trigger `Activated` + condition `HasRestingDon: 2` + `PowerBoost(+2000, Self, EndOfOpponentTurn)`. La durée `EndOfOpponentTurn` est supportée (stockée dans `powerModifierOT`, nettoyée en début de tour suivant via `clearEndOfOpponentTurnModifiers`). **Fonctionnel.**

**ST21-011 :** Utilise `PowerBoost` avec `target: { scope: 'AllOwnCharacters', type: 'Straw Hat Crew', maxPower: 4000 }`. **Problème critique :** le sélecteur `AllOwnCharacters` dans `effectResolver.ts` ne supporte que `maxPower` — il ignore complètement le champ `type` (subType filtering). Seul `maxPower` est filtré ; la restriction au subtype `Straw Hat Crew` n'est pas appliquée.

---

### 2.5 — On K.O. — Draw

**Cartes concernées :** ST21-004 (Jewelry Bonney)

**Statut engine :** ✅ Supporté

- Trigger `OnKO` + condition `HasRestingDon: 2` + action `DrawCard(1)`.
- `OnKO` est déclenché dans `effectResolver.ts` (case 'KO') après `sendToTrash`.
- La condition DON est évaluée au moment de la résolution.

---

### 2.6 — On K.O. — Play from Hand

**Cartes concernées :** ST21-015 (Roronoa Zoro)

**Statut engine :** ✅ Supporté

- Trigger `OnKO` + action `PlayFromHand` avec filtre `{ name: 'Roronoa Zoro' }`.
- Le filtre `excludeSelf` n'est pas dans le DSL actuel mais la règle QA précise que seuls les "Roronoa Zoro" d'autres sets sont valides — le filtre `name: 'Roronoa Zoro'` sans `excludeSelf` inclut toutes les cartes nommées Roronoa Zoro (cartes avec un ID différent, donc pas de doublon physique).
- `PlayFromHand` déclenche `pendingOnKOInteraction` → géré via `ResolveOnKOInteraction`.

---

### 2.7 — When Attacking — KO conditionnel

**Cartes concernées :** ST21-010 (Nico Robin)

**Statut engine :** ✅ Supporté

- Trigger `OnAttack` + condition `HasRestingDon: 2` + action `KO(ChooseOpponentCharacter, maxPower: 4000)`.
- `OnAttack` est déclenché dans `applyAction.ts` (DeclareAttack handler) via `resolveEffects`.
- `ChooseOpponentCharacter` avec `maxPower` filtré — prise en charge dans `selectTargets`.

---

### 2.8 — When Attacking — Give rested DON

**Cartes concernées :** ST21-012 (Brook, 2 DON), ST21-014 (Luffy, 1 DON)

**Statut engine :** ✅ Supporté

- Trigger `OnAttack` + action `AttachDon(count, from: 'rested', ChooseOwnCharacterOrLeader)`.
- ST21-012 n'a pas de condition DON explicite (trigger direct sans HasRestingDon) — fonctionnel si des DON reposés sont disponibles.

---

### 2.9 — Trigger (Life trigger)

**Cartes concernées :** ST21-016 (KO ≤4000), ST21-017 (Activate Main effect)

**Statut engine :** ✅ Supporté

- Trigger `Trigger` géré dans `applyAction.ts` lors d'un dommage sur le Leader.
- ST21-016 Trigger : `KO(ChooseOpponentCharacter, maxPower: 4000)` — supporté.
- ST21-017 Trigger : "`Activate this card's [Main] effect`" — la DSL actuelle utilise trigger `Activated` pour l'effet principal. Le Trigger réutilise le même chemin. **Note :** la DSL actuelle de ST21-017 ne contient pas d'effet `Trigger` séparé. Le Trigger de ST21-017 doit déclencher les mêmes actions que le [Main]. Ceci n'est pas encore modélisé dans le fichier `ST21-017.json`.

---

### 2.10 — Event [Main] — PowerBoost + Disable Blocker

**Cartes concernées :** ST21-016 (Gum-Gum Dawn Whip)

**Statut engine :** ❌ Non implémenté (Disable Blocker)

- L'effet +1000 PowerBoost est supporté (`PowerBoost, ChooseOwnCharacterOrLeader, EndOfTurn`).
- L'effet "up to 1 of your opponent's Characters with 4000 power or less **cannot activate [Blocker]**" n'est **pas implémenté** dans le moteur. Il n'existe aucun `EffectAction` de type `DisableBlocker` ni aucun état `blockerDisabledFor` dans `GameState`. La DSL actuelle de `ST21-016.json` ne modélise pas cet effet — seul le PowerBoost et le Trigger sont présents.

---

### 2.11 — On Play — Blocker suppression ciblée (Sanji)

**Cartes concernées :** ST21-003 (Sanji)

**Statut engine :** ⚠️ Partiellement implémenté

- La mécanique est "`[On Play] Select 1 of your {Straw Hat Crew} Characters with 6000 power or more. If that Character attacks this turn, opponent cannot activate Blocker`".
- **Note critique QA :** La règle officielle (qa_st-21.md) confirme que la suppression Blocker ne s'applique qu'à **cette attaque précise**; les attaques suivantes du même tour sont normales.
- Le fichier DSL actuel `ST21-003.json` et `ST21-003_p1.json` ont `effects: []` — l'effet est complètement absent.
- Le fichier `ST21-003_r1.json` modélise l'effet comme `ForceAttack` (le personnage sélectionné est forcé d'attaquer), ce qui ne représente pas correctement le texte orignal (l'effet de Sanji ne force pas l'attaque — il choisit un personnage et, SI ce personnage attaque, Blocker est désactivé).
- `ForceAttack` est implémenté dans le moteur (`pendingForcedAttack`), mais la suppression conditionnelle du Blocker sur une attaque spécifique n'existe pas.
- **DSL manquant :** Un nouvel `EffectAction` de type `SuppressBlockerForAttacker` (ou équivalent) serait nécessaire, ainsi qu'un état `blockerSuppressedForCardId` dans `GameState`.

---

### 2.12 — Event [Main] — PowerBoost conditionnel + KO

**Cartes concernées :** ST21-017 (Gum-Gum Mole Pistol)

**Statut engine :** ⚠️ Partiellement implémenté

- `PowerBoost(-5000, ChooseOpponentCharacter, EndOfTurn)` : supporté.
- `KO(ChooseOpponentCharacter, maxPower: 2000)` : supporté.
- **Condition manquante :** Le texte précise "Then, **if you have a Character with 6000 power or more**", KO up to 1 with 2000 power. Le DSL actuel (`ST21-017.json`) n'encode pas cette condition — le KO s'applique inconditionnellement. Il faudrait une condition `HasBoardCount` ou une condition spécifique (HasCharacterWithPower ≥ 6000).
- **Ciblage séparé (QA ruling) :** La QA confirme que les deux cibles (pour −5000 et pour le KO) peuvent être des Characters différents. Le DSL actuel exécute deux actions séquentielles sur des cibles séparées via `ChooseOpponentCharacter` — comportement correct si deux interactions distinctes sont requises. Dans la pratique, le moteur auto-sélectionne le premier candidat, ce qui peut cibler le même personnage deux fois.

---

## Section 3 — Cartes non implémentées ou partiellement implémentées

### ST21-003 — Sanji (On Play → Blocker suppression conditionnelle)

**Problème :** L'effet réel est "si le personnage X attaque ce tour, l'adversaire ne peut pas activer Blocker contre cette attaque". Ce n'est pas un `ForceAttack` (le personnage n'est pas forcé d'attaquer). L'effet impose une **contrainte sur le défenseur** lors d'une attaque future du tour en cours.

**Ce qui manque dans le moteur :**
1. Un `EffectAction` de type ex. `{ type: 'PreventBlocker'; target: TargetSelector }` qui marque un personnage comme "Blocker-immune pour la prochaine attaque de ce tour".
2. Un champ dans `GameState` ou `Card` de type `blockerImmuneCardId: CardId | null` (ou similaire).
3. La vérification dans le handler `DeclareBlock` de `applyAction.ts` pour refuser l'activation de Blocker si l'attaquant est marqué.

**DSL actuel (ST21-003.json) :** `effects: []` — aucun effet. Le fichier `_r1` utilise `ForceAttack`, ce qui est incorrect sémantiquement.

---

### ST21-007 — Sentomaru (Blocker keyword manquant dans DSL)

**Problème :** Le fichier `ST21-007.json` déclare `"keywords": []`. Le keyword `Blocker` est absent du DSL alors que le texte de la carte l'indique explicitement.

**Correction nécessaire :** Changer `"keywords": []` en `"keywords": ["Blocker"]` dans `packages/data/effects/ST21-007.json` (et `ST21-007_p1.json`).

---

### ST21-011 — Franky ([Opponent's Turn] PowerBoost Straw Hat Crew)

**Problème :** Le sélecteur `AllOwnCharacters` dans `effectResolver.ts` (lignes 67-71) ne supporte pas le filtrage par `subType`. Seul `maxPower` est filtré. Le champ `type` passé dans la DSL de ST21-011 (`"type": "Straw Hat Crew"`) est ignoré.

**Ce qui manque dans le moteur :**
- Ajouter un filtre `subType` dans le case `AllOwnCharacters` de `selectTargets()` dans `effectResolver.ts`.
- Modifier le schéma `TargetSelector` pour `AllOwnCharacters` afin d'accepter `subType?: string`.

**Impact :** Sans ce fix, Franky booste TOUS les personnages ≤4000 power, pas seulement les Straw Hat Crew.

---

### ST21-016 — Gum-Gum Dawn Whip ([Main] Disable Blocker)

**Problème :** La deuxième partie de l'effet [Main] ("up to 1 of your opponent's Characters with 4000 power or less cannot activate [Blocker]") n'est pas modélisée dans le DSL ni dans le moteur.

**Ce qui manque dans le moteur :**
1. Un `EffectAction` de type ex. `{ type: 'DisableBlocker'; target: TargetSelector; duration: EffectDuration }`.
2. Un état `blockerDisabledIds: readonly CardId[]` dans `GameState`.
3. La vérification dans le handler `DeclareBlock` pour refuser si le blocker désigné est dans `blockerDisabledIds`.

**DSL actuel :** Seuls PowerBoost (+1000) et Trigger (KO ≤4000) sont présents.

---

### ST21-017 — Gum-Gum Mole Pistol (Condition manquante + double ciblage)

**Problème 1 — Condition manquante :** Le KO conditionnel ("if you have a Character with 6000 power or more") n'est pas encodé dans le DSL.

**Ce qui manque :** Soit une nouvelle `EffectCondition` (`HasCharacterWithMinPower: { minPower: number }`), soit un `EffectAction` conditionnel `{ type: 'Conditional'; condition: ...; thenActions: [...] }`.

**Problème 2 — Double ciblage manuel (QA ruling) :** L'adversaire doit choisir deux cibles différentes (une pour −5000, une pour le KO). Le moteur actuel auto-sélectionne le premier candidat pour chaque action, ce qui peut produire le même personnage cible deux fois si les pools se chevauchent. Un `pendingTargetInteraction` séquentiel serait nécessaire.

---

## Section 4 — Résumé

| Catégorie | Valeur |
|-----------|--------|
| Cartes canoniques ST-21 | 17 (1 Leader + 13 Characters + 2 Events) |
| Cartes sans effet ("—") | 3 (ST21-005 Jinbe, ST21-006 Stussy, ST21-013 Vegapunk) |
| Cartes avec effets | 14 |
| Mécaniques identifiées | 12 |
| Mécaniques totalement supportées (✅) | 8 |
| Mécaniques partiellement implémentées (⚠️) | 3 |
| Mécaniques absentes du moteur (❌) | 1 |

### Bilan des mécaniques

| # | Mécanique | Cartes | Statut |
|---|-----------|--------|--------|
| 1 | Rush (keyword / GiveKeyword) | ST21-014, ST21-015 | ✅ |
| 2 | Blocker (keyword) | ST21-007 | ✅ (moteur OK, DSL bug: keywords manquant) |
| 3 | DON!! Give rested (Activate:Main / OnAttack) | ST21-001, ST21-009, ST21-012, ST21-014 | ✅ |
| 4 | [Opponent's Turn] PowerBoost self | ST21-002 | ✅ |
| 5 | OnKO Draw | ST21-004 | ✅ |
| 6 | OnKO PlayFromHand | ST21-015 | ✅ |
| 7 | OnAttack KO conditionnel | ST21-010 | ✅ |
| 8 | Trigger (Life trigger KO / replay Main) | ST21-016, ST21-017 | ✅ (ST21-017 Trigger absent du DSL) |
| 9 | [Opponent's Turn] PowerBoost subType-filtered | ST21-011 | ⚠️ subType ignoré dans AllOwnCharacters |
| 10 | OnPlay → Suppress Blocker conditionnel | ST21-003 | ⚠️ ForceAttack existe mais sémantique incorrecte; DisableBlocker manquant |
| 11 | Event [Main] + conditional KO (Mole Pistol) | ST21-017 | ⚠️ Condition HasCharacterWithMinPower manquante |
| 12 | Event [Main] → Disable Blocker on target | ST21-016 | ❌ Aucun EffectAction DisableBlocker dans le moteur |

### Bugs DSL détectés (sans toucher au code)

| Fichier DSL | Problème |
|-------------|---------|
| `ST21-007.json` + `_p1.json` | `"keywords": []` — Blocker absent |
| `ST21-003.json` + `_p1.json` | `"effects": []` — effet On Play absent |
| `ST21-003_r1.json` | Utilise `ForceAttack` (incorrect sémantiquement — l'effet de Sanji ne force pas l'attaque) |
| `ST21-017.json` | Pas de trigger `Trigger` pour re-jouer l'effet [Main]; la condition "if you have a Character with 6000+ power" n'est pas encodée |
| `ST21-016.json` | L'effet "cannot activate Blocker" de la partie [Main] est absent du DSL |

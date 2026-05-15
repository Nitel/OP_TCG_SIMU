# ST-21 — Inventaire de complétude (DSL + Tests)

> Généré le 2026-05-07.
> Sources : `packages/data/raw/ST-21.json`, `packages/data/effects/ST21-*.json`,
> `packages/game-engine/tests/st21.test.ts`, `packages/game-engine/tests/st21.integration.test.ts`.
>
> **Portée :** 17 cartes canoniques (sans les variantes `_p1`/`_p2`/`_r1`).
> Les problèmes des variantes `_p1` sont listés séparément en section 3.

---

## Section 1 — Tableau de complétude

| Id | Nom | Type | DSL base | Tests | TODO / Issues |
|----|-----|------|----------|-------|---------------|
| ST21-001 | Monkey.D.Luffy | Leader | **OK** | None | — |
| ST21-002 | Usopp | Character | **OK** | None | — |
| ST21-003 | Sanji | Character | **Partial** | Unit + Int | `_TODO_minPower` : filtre `minPower ≥ 6000` sur `ChooseOwnCharacter` non supporté dans `TargetSelector` |
| ST21-004 | Jewelry Bonney | Character | **OK** | None | — |
| ST21-005 | Jinbe | Character | **OK (vide)** | N/A | Vanilla — aucun effet à tester |
| ST21-006 | Stussy | Character | **OK (vide)** | N/A | Vanilla — aucun effet à tester |
| ST21-007 | Sentomaru | Character | **OK** | Unit | — |
| ST21-008 | Tony Tony.Chopper | Character | **OK (vide)** | N/A | Vanilla — aucun effet à tester |
| ST21-009 | Nami | Character | **OK** | None | — |
| ST21-010 | Nico Robin | Character | **OK** | None | — |
| ST21-011 | Franky | Character | **OK** | Unit | — |
| ST21-012 | Brook | Character | **OK** | None | — |
| ST21-013 | Vegapunk | Character | **OK (vide)** | N/A | Vanilla — aucun effet à tester |
| ST21-014 | Monkey.D.Luffy | Character | **OK** | None | — |
| ST21-015 | Roronoa Zoro | Character | **OK** | Unit + Int | — |
| ST21-016 | Gum-Gum Dawn Whip | Event | **Wrong** | Unit + Int | DSL sémantiquement inversé : [Main] devrait être PowerBoost + DisableBlocker ; [Trigger] devrait être KO ≤4000. Les effets sont échangés dans le DSL (voir §2.1) |
| ST21-017 | Gum-Gum Mole Pistol | Event | **Partial** | Unit + Int | `_TODO_HasCharacterWithMinPower` : condition `HasCharacterWithMinPower { minPower: 6000 }` absente du DSL ; engine la supporte déjà (`types/index.ts:300`) |

**Légende DSL :** `OK` = complet et correct · `Partial` = incomplet (TODO) · `Wrong` = erreur sémantique · `OK (vide)` = carte vanilla, effets vides intentionnels.

---

## Section 2 — Détail des issues prioritaires

### 2.1 — ST21-016 « Gum-Gum Dawn Whip » : DSL Wrong (effets inversés)

**Texte officiel :**
- `[Main]` : +1000 power à 1 Leader/Character + adversaire ne peut pas activer [Blocker] sur 1 Character ≤4000 ce tour
- `[Trigger]` : KO 1 Character adverse ≤4000

**DSL actuel (`ST21-016.json`) :**
```
OnPlay  → PowerBoost +1000  +  KO ≤4000           ← KO à la place de DisableBlocker
Trigger → DisableBlocker AllOpponentCharacters ≤5000  ← DisableBlocker à la place de KO,
                                                       ET seuil 5000 au lieu de 4000
```

**Résumé des erreurs :**
1. L'effet `DisableBlocker` est dans le Trigger — il devrait être dans le `OnPlay` ([Main]).
2. L'effet `KO` est dans le `OnPlay` — il devrait être dans le `Trigger`.
3. Le seuil de puissance du Trigger est `5000` au lieu de `4000`.
4. Le `DisableBlocker` du [Main] cible `AllOpponentCharacters` (toutes) au lieu d'un seul Character ≤4000.

> **Impact tests :** les tests actuels Unit+Int valident le comportement tel qu'implémenté (incorrect) — ils passeront après correction du DSL mais ne garantissent pas la conformité au texte officiel.

---

### 2.2 — ST21-017 « Gum-Gum Mole Pistol » : DSL Partial (condition manquante)

**Texte officiel :**
- `[Main]` : −5000 power à 1 Character adverse + **si vous avez un Character ≥6000 power**, KO 1 Character adverse ≤2000
- `[Trigger]` : active l'effet [Main]

**DSL actuel (`ST21-017.json`) :**
```
OnPlay  → PowerBoost -5000  +  KO ≤2000  (TODO: condition HasCharacterWithMinPower absente)
Trigger → PowerBoost -5000  +  KO ≤2000  (TODO: même condition absente)
```

**Ce qui manque :**
- Ajouter `condition: { type: "HasCharacterWithMinPower", minPower: 6000 }` au niveau de l'effect block `OnPlay`, ou introduire une `EffectAction` conditionnelle wrapping le `KO`.
- L'engine supporte déjà `HasCharacterWithMinPower` dans `EffectCondition` (confirmé dans `types/index.ts:300`).
- Les tests (`st21.test.ts:573-758`) testent la condition **en direct via effects inline** — ils passent car l'engine l'évalue correctement. Mais la DSL ne la câble pas encore.

---

### 2.3 — ST21-003 « Sanji » : DSL Partial (minPower filter manquant)

**Texte officiel :**
- `[On Play]` : sélectionner un Character de type {Straw Hat Crew} **avec 6000 power ou plus** — si ce Character attaque ce tour, l'adversaire ne peut pas activer [Blocker].

**DSL actuel (`ST21-003.json`) :**
```json
{
  "trigger": "OnPlay",
  "_TODO_minPower": "ChooseOwnCharacter missing minPower filter — official text requires ≥6000 power",
  "actions": [{ "type": "SuppressBlockerForAttacker", "target": { "scope": "ChooseOwnCharacter", "subType": "Straw Hat Crew" } }]
}
```

**Ce qui manque :**
- Un champ `minPower` (ou `minBasePower`) dans `TargetSelector` pour le scope `ChooseOwnCharacter`.
- Sans ce filtre, Sanji peut cibler n'importe quel Straw Hat Crew quel que soit son power.
- Même issue sur ST21-003_p1, ST21-003_p2, ST21-003_r1.

---

## Section 3 — Problèmes dans les variantes `_p1`

| Variante | Problème |
|----------|---------|
| `ST21-002_p1` | `duration: "EndOfTurn"` au lieu de `"EndOfOpponentTurn"` — le buff disparaît en fin de tour du joueur actif, pas en fin du tour adverse |
| `ST21-007_p1` | `"keywords": []` — le keyword `Blocker` est **absent** (devrait être `["Blocker"]`) |
| `ST21-009_p1` | Condition `HasRestingDon: 2` manquante ; filtre `subType: "Straw Hat Crew"` absent sur la cible de `AttachDon` |
| `ST21-011_p1` | Filtre `subType` et `maxPower` absents sur `AllOwnCharacters` ; `duration: "EndOfTurn"` au lieu de `"EndOfOpponentTurn"` |
| `ST21-012_p1` | `from: "rested"` absent sur `AttachDon` (la source des DON n'est pas contrainte) |
| `ST21-014_p1` | `"keywords": []` au lieu de `["Rush"]` — Rush absent ; `from: "rested"` absent sur `AttachDon` |
| `ST21-015_p1` | `OnKO` filter = `{ name: "Roronoa Zoro" }` (inclut Zoro au lieu de l'exclure) ; `GiveKeyword Rush duration: "EndOfTurn"` au lieu de `"Permanent"` |

> **Note sur ST21-003_r1 :** variante supplémentaire présente dans les DSL (`_r1`) mais absente du fichier `ST-21.json`. Sémantique identique à ST21-003 (même effet `SuppressBlockerForAttacker`), même TODO `_TODO_minPower`.

---

## Section 4 — Résumé exécutif

### DSL base (cartes canoniques)

| Statut | Cartes |
|--------|--------|
| **OK** | ST21-001, ST21-002, ST21-004, ST21-005, ST21-006, ST21-007, ST21-008, ST21-009, ST21-010, ST21-011, ST21-012, ST21-013, ST21-014, ST21-015 (14/17) |
| **Partial** (TODO engine existant) | ST21-003, ST21-017 (2/17) |
| **Wrong** (erreur sémantique) | ST21-016 (1/17) |

### Couverture tests

| Statut | Cartes |
|--------|--------|
| **Unit + Integration** | ST21-003, ST21-015, ST21-016, ST21-017 |
| **Unit seulement** | ST21-007, ST21-011 |
| **Aucun test** (effet présent) | ST21-001, ST21-002, ST21-004, ST21-009, ST21-010, ST21-012, ST21-014 |
| **N/A** (vanilla) | ST21-005, ST21-006, ST21-008, ST21-013 |

### Cartes à traiter en priorité

| Priorité | Carte | Action requise |
|----------|-------|---------------|
| 🔴 P1 | ST21-016 | Corriger DSL (inverser OnPlay/Trigger, ajuster seuil 5000→4000, ciblage DisableBlocker) |
| 🟠 P2 | ST21-017 | Câbler `condition: HasCharacterWithMinPower` dans le DSL (engine prêt) |
| 🟠 P2 | ST21-007_p1 | Ajouter `"keywords": ["Blocker"]` dans `ST21-007_p1.json` |
| 🟠 P2 | ST21-015_p1 | Corriger filtre OnKO (`name` → `excludeName`) et durée Rush (`EndOfTurn` → `Permanent`) |
| 🟡 P3 | ST21-003 | Implémenter `minPower` dans `TargetSelector.ChooseOwnCharacter` puis mettre à jour le DSL |
| 🟡 P3 | ST21-002_p1, ST21-009_p1, ST21-011_p1, ST21-012_p1, ST21-014_p1 | Aligner les champs manquants sur la version base |
| 🔵 P4 | ST21-001, ST21-002, ST21-004, ST21-009, ST21-010, ST21-012, ST21-014 | Ajouter des tests unitaires pour les effets présents mais non testés |

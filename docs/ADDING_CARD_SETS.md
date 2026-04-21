# Ajouter un nouveau set de cartes

---

## Workflow complet (exemple avec ST-21)

```bash
cd /chemin/vers/OP_TCG_SIMU   # racine du repo — toutes les commandes se lancent d'ici
```

Remplacer `ST-21` / `ST21` par le code du set à intégrer.

> **Prérequis :** une clé `ANTHROPIC_API_KEY` dans un fichier `.env` à la racine (nécessaire uniquement pour l'étape 3).

---

### Étape 1 — Fetch les données des cartes

```bash
pnpm fetch-card-data ST-21
```

Appelle l'API **optcgapi.com** et écrit le fichier brut :
```
packages/data/raw/ST-21.json
```

Pour lister tous les sets disponibles sur l'API (sans argument) :
```bash
pnpm fetch-card-data
```

Valider le fichier récupéré :
```bash
pnpm validate-set ST21
```

Sortie attendue :
```
Set ST21 — 54 cartes
  Leader         1
  Character      44
  Event          9

✔  Aucun doublon d'ID
✔  Tous les champs obligatoires présents

Validation OK
```

---

### Étape 2 — Télécharger les images

```bash
pnpm fetch-images ST21
```

Télécharge chaque image depuis le site officiel Bandai dans `apps/client/public/card-images/`.
Les fichiers déjà présents sont ignorés (idempotent).

Vérifier les images manquantes :
```bash
pnpm check-images ST21
```

---

### Étape 3 — Générer les effets DSL via LLM

```bash
pnpm generate-effects ST-21
```

Envoie chaque carte à Claude (Haiku) qui traduit le texte d'effet en JSON DSL, et écrit un fichier par carte dans :
```
packages/data/effects/ST21-XXX.json
```

Les cartes échouées sont loggées dans `packages/data/effects/_failures.json` pour révision manuelle.

Vérifier quelles cartes ont un fichier d'effets :
```bash
pnpm check-effects ST21
```

---

### Étape 4 — Enregistrer le set dans le deck builder

Ouvrir `apps/client/src/data/deckBuilder.ts` et faire trois modifications :

**4a. Importer le fichier de données brutes** (en haut du fichier) :
```typescript
import st21Raw from '../../../../packages/data/raw/ST-21.json';
```

**4b. Élargir le glob des effets** pour inclure le nouveau set :
```typescript
// Remplacer :
const effectModules = import.meta.glob(
  '../../../../packages/data/effects/OP01-*.json',
  { eager: true },
) as Record<string, { readonly default: EffectDef }>;

// Par :
const effectModules = import.meta.glob(
  '../../../../packages/data/effects/*.json',
  { eager: true },
) as Record<string, { readonly default: EffectDef }>;
```

**4c. Ajouter les cartes à `ALL_CARD_TEMPLATES`** :
```typescript
const allRaw = [
  ...(op01Raw as unknown as RawCard[]),
  ...(st21Raw as unknown as RawCard[]),
];

export const ALL_CARD_TEMPLATES: readonly CardTemplate[] = allRaw
  .filter((c): c is RawCard & { cardType: 'Leader' | 'Character' | 'Event' } =>
    c.cardType === 'Leader' || c.cardType === 'Character' || c.cardType === 'Event',
  )
  .map((c) => {
    const eff = effectMap[c.id];
    return {
      id: c.id, name: c.name, type: c.cardType,
      cost: c.cost, power: c.power, color: c.color,
      counter: c.counter, keywords: eff?.keywords ?? [],
    };
  });
```

---

### Étape 5 — Vérifier

```bash
pnpm exec tsc --noEmit   # zéro erreur TypeScript
pnpm test                # tests du moteur de jeu
cd apps/client && pnpm dev
# → http://localhost:5173 → Deck Builder → les nouvelles cartes apparaissent
```

---

## Récapitulatif des commandes

| Commande | Argument | Ce qu'elle fait |
|---|---|---|
| `pnpm fetch-card-data` | `OP-01` (format avec tiret) | Fetch les données depuis optcgapi.com → `packages/data/raw/` |
| `pnpm validate-set` | `OP01` ou `OP-01` | Vérifie le fichier raw (count, doublons, champs) |
| `pnpm fetch-images` | `OP01` | Télécharge les images → `apps/client/public/card-images/` |
| `pnpm check-images` | `OP01` | Liste les images manquantes |
| `pnpm generate-effects` | `OP-01` (format avec tiret) | Génère les effets DSL via Claude → `packages/data/effects/` |
| `pnpm check-effects` | `OP01` | Liste les cartes sans fichier d'effets |

> **Format des arguments :**  
> `fetch-card-data` et `generate-effects` (pipeline cards-dsl) attendent le format **avec tiret** (`OP-01`, `ST-21`).  
> Les autres scripts acceptent les deux formats (`OP01` et `OP-01`).

---

## Format des données brutes

Pour référence — le fichier `packages/data/raw/{SET}.json` est un tableau JSON produit automatiquement par `pnpm fetch-card-data`. En cas de correction manuelle :

### Champs obligatoires

| Champ        | Type                                                    | Notes                           |
|--------------|---------------------------------------------------------|---------------------------------|
| `id`         | `string`                                                | Ex: `ST21-004`, `OP02-005`      |
| `name`       | `string`                                                |                                 |
| `set`        | `string`                                                | Ex: `"ST-21"`, `"OP-02"`        |
| `cardType`   | `"Leader" \| "Character" \| "Event" \| "Stage"`         |                                 |
| `cost`       | `number`                                                | 0 pour les leaders              |
| `power`      | `number`                                                | 0 pour les Events               |
| `color`      | `string`                                                | Voir ci-dessous                 |
| `counter`    | `number \| null`                                        |                                 |
| `effectText` | `string`                                                | Texte officiel anglais          |
| `attribute`  | `string`                                                | `"Slash"`, `"Strike"`, etc.     |

### Couleurs

Valeurs simples : `"Red"`, `"Blue"`, `"Green"`, `"Purple"`, `"Black"`, `"Yellow"`

Leaders bi-couleurs : séparer par un espace — ex: `"Blue Purple"`, `"Green Red"`.
Le deck builder autorisera alors les cartes des deux couleurs.

---

## Format des fichiers d'effets

Produits par `pnpm generate-effects`, corrigeables manuellement.  
Fichier : `packages/data/effects/{id}.json`

```json
{
  "id": "ST21-004",
  "name": "Jewelry Bonney",
  "cost": 3, "power": 4000, "color": "Red", "cardType": "Character",
  "keywords": ["Blocker"],
  "effects": [
    {
      "trigger": "OnPlay",
      "actions": [{ "type": "Draw", "count": 1 }]
    }
  ],
  "counter": 1000
}
```

### Triggers : `OnPlay` · `OnAttack` · `OnKO` · `OnBlock` · `Trigger` · `Activated`

### Actions courantes

```jsonc
{ "type": "Draw", "count": 2 }
{ "type": "PowerBoost", "amount": 2000, "target": { "scope": "Self" }, "duration": "EndOfTurn" }
{ "type": "SearchDeck", "filter": { "kind": "ByCost", "maxCost": 4 }, "destination": "hand" }
{ "type": "KO", "target": { "scope": "ChooseOpponentCharacter", "maxCost": 3 } }
{ "type": "ReturnToHand", "target": { "scope": "ChooseOpponentCharacter" } }
{ "type": "Rest", "target": { "scope": "ChooseOpponentCharacter", "maxCost": 5 } }
{ "type": "GainKeyword", "keyword": "Rush", "target": { "scope": "Self" }, "duration": "EndOfTurn" }
```

### Keywords : `Rush` · `Blocker` · `Banish` · `DoubleAttack` · `Unblockable`

---

## Convention de nommage des sets

| Préfixe | Type          | Argument fetch        |
|---------|---------------|-----------------------|
| `OP`    | Booster Pack  | `OP-02`               |
| `ST`    | Starter Deck  | `ST-21`               |
| `EB`    | Extra Booster | `EB-01`               |
| `P`     | Promo         | `P-01`                |

# One Piece TCG — Règles de référence

Résumé des règles officielles pour usage interne du simulateur.

---

## Mise en place

- Chaque joueur a : 1 carte Leader, un deck de 50 cartes, 10 cartes DON!!
- Les 5 premières cartes du deck → zone **Life** (face cachée)
- Les 5 suivantes → **main de départ**
- Les 10 DON!! → **deck DON!!**

---

## Déroulement d'un tour

### 1. Phase Refresh (Redressement)
- Redresser (untap) toutes ses cartes restées (leader, board, DON!! en Cost Area)

### 2. Phase Draw (Pioche)
- Piocher **1 carte** de son deck

### 3. Phase DON!!
- Piocher **2 cartes DON!!** de son deck DON!! → les placer dans sa Cost Area (untapped)
- Maximum 10 DON!! en jeu simultanément

### 4. Phase Main (Principale)
Actions disponibles dans n'importe quel ordre, autant de fois que voulu :

**Jouer un personnage (Character)**
- Payer son coût en tapant des cartes DON!! de sa Cost Area
- Placer le personnage sur son board

**Jouer un Event**
- Payer son coût en tapant des cartes DON!! de sa Cost Area
- Appliquer l'effet, puis envoyer à la trash

**Jouer un Stage**
- Payer son coût en tapant des cartes DON!! de sa Cost Area
- Remplace l'éventuel Stage précédent (envoyé à la trash)
- 1 seul Stage en jeu par joueur

**Attacher des DON!!**
- Taper un DON!! de sa Cost Area ET le placer sur un personnage ou son leader
- Chaque DON!! attaché ajoute **+1000 Power** à la carte
- Autant de DON!! attachés que désiré

**Déclarer une attaque**
- L'attaquant (personnage ou leader) se repose (tapped)
- Choisir une cible : leader adverse OU personnage adverse
- L'adversaire peut interrompre avec un **Blocker** (voir ci-dessous)
- Résolution du combat (voir ci-dessous)

> **Important** : Le leader peut attaquer 1 fois par tour. Les personnages peuvent attaquer autant de fois que le nombre d'attaques autorisées (en général 1). Une fois restée (tapped), une carte ne peut plus attaquer.

### 5. Phase End (Fin)
- Les DON!! attachés à des personnages/leader reviennent en Cost Area (untapped)
- Les DON!! tapés pour payer des coûts restent tapés jusqu'au prochain Refresh
- Passer le tour à l'adversaire

---

## Combat

### Déroulement
1. **DeclareAttack** : l'attaquant se repose, la cible est désignée
2. **DeclareBlock** *(optionnel, adversaire)* : une carte avec le keyword **Blocker** peut intercepter l'attaque (elle devient la nouvelle cible, se repose)
3. **ResolveCombat** : comparaison des puissances

### Résolution
- **Power attaquant > Power défenseur** → le défenseur est KO (envoyé à la trash)
  - Si le défenseur était un **personnage** → envoyé à la trash, ses DON!! détachés reviennent en Cost Area
  - Si le défenseur était le **leader** → le joueur défenseur pioche la **carte du dessus de sa zone Life** et la met en main
    - Si sa zone Life est **vide** → le joueur défenseur **perd la partie**
- **Power attaquant ≤ Power défenseur** → rien ne se passe (l'attaquant reste reposé)

### Calcul de la puissance
```
Power total = Power imprimée + (nombre de DON!! attachés × 1000)
```

---

## Keywords

| Keyword | Effet |
|---------|-------|
| **Blocker** | Peut être tapé pour intercepter une attaque à la place du leader/personnage ciblé |
| **Rush** | Peut attaquer le tour où il est joué (pas de restriction de "sommoning sickness") |
| **Banish** | Les cartes KO par ce personnage sont éliminées du jeu au lieu d'aller à la trash |
| **Trigger** | Effet déclenché quand la carte est révélée depuis la zone Life suite à un dégât |

> **Note simulateur** : par défaut les cartes stub n'ont pas de keywords. Seules les vraies cartes issues d'un deck importé auront des keywords.

---

## Condition de victoire

Un joueur **gagne** quand son attaque sur le leader adverse est résolue alors que la zone Life de l'adversaire est **vide** (il ne peut pas piocher de carte Life pour absorber le dégât).

Un joueur **perd** également s'il ne peut pas piocher de carte de son deck quand une règle l'y oblige.

---

## Résumé zones

| Zone | Description |
|------|-------------|
| **Deck** | Deck principal (50 cartes), pioche ici |
| **Hand** | Main du joueur |
| **Life** | 5 cartes face cachée ; absorbent les dégâts sur le leader |
| **Board** | Personnages et Stage en jeu |
| **Leader** | Zone spéciale du leader (1 carte) |
| **DON!! Deck** | Deck des 10 cartes DON!! |
| **Cost Area (donArea)** | DON!! disponibles ; tapés pour payer les coûts ou attachés pour booster |
| **Trash** | Défausse |

---

## Flow implémenté dans le moteur

```
Refresh → Draw → DON!! → Main → End → (tour suivant)

Actions:
  EndPhase        → avance la phase (ou change de joueur depuis End)
  DrawPhase       → pioche 1 carte + déclenche DON!! draw automatiquement
  PlayCharacterFromHand → joue un personnage (coût en DON!! tapés)
  AssignDon       → attache 1 DON!! à une carte (+1000 power)
  DeclareAttack   → tape l'attaquant, crée activeCombat
  DeclareBlock    → tape le blocker (requiert keyword Blocker), redirige la cible
  ResolveCombat   → compare les puissances, applique KO ou dégât leader
```

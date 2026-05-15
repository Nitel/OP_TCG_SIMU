# ST-21 Rules Spec

> Sources : `packages/data/raw/ST-21.json`, `resources/rules/qa_st-21.pdf`, `resources/rules/qa_rules.md`, `docs/st21-inventory.md`

---

## 1. Timings et fenêtres d'action

### On Play
Déclenché immédiatement après qu'une carte est jouée depuis la main et posée sur le terrain, avant que le joueur puisse effectuer toute autre action dans la Main Phase. L'effet est obligatoire s'il n'a pas de coût optionnel — le joueur ne peut pas choisir de ne pas l'activer.
(source : qa_rules.md — "Can I play a Character card with an [On Play] effect without activating the effect? No, you must activate it whenever possible.")

Cartes ST-21 concernées : ST21-003 (Sanji).

### When Attacking
Déclenché lorsque la carte portant l'effet déclare une attaque, après que l'attaque est déclarée et avant le Block Step. L'effet ne se déclenche pas lorsqu'une autre carte attaque.
(source : qa_rules.md — "Does [When Attacking] activate when another card without this effect attacks? No.")

Cartes ST-21 concernées : ST21-010 (Nico Robin), ST21-012 (Brook), ST21-014 (Monkey.D.Luffy Character).

### Activate: Main
Peut être activé une fois par tour durant la Main Phase du joueur qui contrôle la carte. L'activation est un choix du joueur (pas obligatoire). Le marqueur [Once Per Turn] empêche une seconde activation du même effet dans le même tour, même si plusieurs copies de la carte sont en jeu.
(source : qa_rules.md — "If there are cards of the same name with [Once Per Turn] effects, can I activate each of their effects during the same turn? Yes." — chaque copie compte séparément.)

Cartes ST-21 concernées : ST21-001 (Leader Luffy — nécessite [DON!! x1] attaché), ST21-009 (Nami).

### Trigger (Life Trigger)
Déclenché lorsque la carte est retournée en tant que Life card lors d'un dommage infligé au Leader. Le joueur choisit alors d'ajouter la carte à sa main (sans activer le Trigger) ou d'activer le Trigger et de mettre la carte en jeu / défausse selon l'effet.
Ne peut pas être activé lorsqu'une carte est déplacée vers la main par un autre effet (ex. "add 1 card from top of Life to hand").
(source : qa_rules.md — "When I move a Life card due to an effect like 'Add 1 card from the top of your Life cards to your hand', can I activate its [Trigger]? No.")

Cartes ST-21 concernées : ST21-016 (KO ≤4000), ST21-017 (rejoue l'effet [Main]).

### Opponent's Turn (effet passif pendant le tour de l'adversaire)
L'effet est actif uniquement pendant le tour de l'adversaire. Il entre en vigueur au début du tour de l'adversaire (ou dès que la condition DON est remplie pendant ce tour) et expire à la fin du tour de l'adversaire. Ce n'est pas un timing d'activation mais une fenêtre de validité continue.

Cartes ST-21 concernées : ST21-002 (Usopp, +2000 self), ST21-011 (Franky, +1000 tous Straw Hat Crew ≤4000 base power).

### "During this turn" (effets bornés au tour en cours)
Un effet "during this turn" activé en Main Phase reste valide jusqu'à la fin du tour actuel, y compris si la carte qui l'a activé quitte le terrain entre-temps.
(source : qa_rules.md — "Where a 'during this turn' effect is activated by an [Activate: Main] effect, is it still valid if the activating card moves to another area? Yes, it is valid.")

Cartes ST-21 concernées : ST21-003 (Sanji — suppression Blocker pour la durée du tour), ST21-016 (Dawn Whip — +1000 et disable Blocker), ST21-017 (Mole Pistol — −5000 power).

### "Until end of opponent's next turn" (effets inter-tours)
Effet qui débute pendant le tour en cours et expire à la fin du prochain tour de l'adversaire. La QA précise que pour un effet joué pendant le tour de l'adversaire, "until the end of your opponent's next turn" désigne la fin du tour en cours de l'adversaire.
(source : qa_st-21.pdf Q3 — ST21-015 Roronoa Zoro interaction avec OP09-013 Yasopp)

---

## 2. Mécaniques et effets nécessaires pour ST-21

### 2.1 DON!! Redistribution (Give rested DON)

**Description :** Le joueur choisit un nombre de DON!! cards reposées dans sa cost area (jusqu'à N) et les attache à une cible (Leader ou Character désigné). Les DON!! passent de l'état "rested in cost area" à "attached to target". Le total power du target augmente de 1 000 par DON!! attaché. Les DON!! attachés retournent dans la cost area (état rested) lors de la Refresh Phase suivante.

Cibles valides selon la carte :
- ST21-001 Leader Luffy (Activate:Main) : jusqu'à 2 DON!! reposés vers 1 Character (pas le Leader lui-même).
- ST21-009 Nami (Activate:Main) : jusqu'à 2 DON!! reposés vers 1 carte de type {Straw Hat Crew} (Leader ou Character).
- ST21-012 Brook (When Attacking) : jusqu'à 2 DON!! reposés vers le Leader ou 1 Character.
- ST21-014 Luffy Character (When Attacking) : jusqu'à 1 DON!! reposé vers le Leader ou 1 Character.

**Scénario ST21-009 :** La cost area contient 3 DON!! reposés. Nami est en jeu, non activée ce tour. Action : activer Nami. Sélection : Tony Tony.Chopper (subtype Straw Hat Crew, au sens large). Résultat : Nami passe en état "activée ce tour" (Once Per Turn), 2 DON!! quittent la cost area et s'attachent à Chopper (puissance +2000). 1 DON!! reste reposé en cost area.

### 2.2 Rush (keyword)

**Description :** Un personnage avec [Rush] peut attaquer le tour même où il est joué. Sans Rush, un personnage ne peut pas attaquer le tour de sa mise en jeu (règle de summoning sickness implicite du TCG).

Cartes ST-21 : ST21-014 possède Rush nativement. ST21-015 l'acquiert via l'effet conditionnel [DON!! x2] — permanent tant que le DON est attaché.

**Scénario ST21-015 :** Zoro est joué. À la fin de la DON phase, 2 DON!! lui sont attachés. Résultat : Zoro acquiert [Rush] et peut déclarer une attaque ce même tour. Si les 2 DON!! sont retirés (ex. fin de tour, Refresh Phase), Zoro perd Rush au tour suivant.

### 2.3 Blocker (keyword)

**Description :** Lorsque l'adversaire déclare une attaque, le joueur peut activer le Blocker d'un Character en repos sur le terrain (non reposé, non en cours d'attaque). Le Character est reposé et devient la nouvelle cible de l'attaque. Un seul Blocker peut être activé par attaque. Le Blocker du Character ciblé par l'attaque ne peut pas être activé.
(source : qa_rules.md — "Can I use 2 or more [Blocker] effects in a single battle? No." et "Can I activate the [Blocker] of a Character being attacked? No.")

Carte ST-21 : ST21-007 Sentomaru.

**Scénario :** L'adversaire attaque le Leader. Sentomaru est debout sur le terrain. Action : activer Blocker de Sentomaru. Résultat : Sentomaru est reposé, devient la cible de l'attaque à la place du Leader.

### 2.4 On K.O. — Draw (Jewelry Bonney)

**Description :** Lorsque la carte portant cet effet est K.O. (envoyée en défausse suite à une défaite en combat ou un effet de KO), le joueur pioche 1 carte. Condition : 2 DON!! doivent être attachés à Bonney au moment du KO. L'effet ne se déclenche pas si la carte est envoyée directement en défausse par un autre moyen (ex. overflow à 6 personnages).
(source : qa_rules.md — "If I have 5 Characters and play another Character, when I trash one, will its [On K.O.] effect activate? No.")

**Scénario :** Bonney a 2 DON!! attachés. L'adversaire K.O. Bonney via un effet. Résultat : Bonney va en défausse, puis le joueur pioche 1 carte.

### 2.5 On K.O. — Play from Hand (Roronoa Zoro)

**Description :** Lorsque Zoro est K.O., le joueur peut jouer depuis sa main une carte Character rouge avec 6000 power ou moins, autre que [Roronoa Zoro]. La carte est jouée sans payer son coût. L'effet ne permet pas de jouer un autre Zoro du même set ni d'un autre set.
(source : qa_st-21.pdf Q1 — "Can I use this [On K.O.] effect to play other [Roronoa Zoro] cards, such as 'OP01-025 Roronoa Zoro'? No, you cannot.")

**Scénario :** Zoro est K.O. Le joueur a en main ST21-008 (Chopper, 4 coût, 6000 power, rouge). Résultat : le joueur peut choisir de jouer Chopper gratuitement. Si Chopper a un effet [On Play], il s'applique.

### 2.6 When Attacking — KO conditionnel (Nico Robin)

**Description :** Lorsque Nico Robin attaque (condition : 2 DON!! attachés), le joueur peut cibler et K.O. jusqu'à 1 Character adverse ayant 4000 power ou moins. La résolution a lieu avant le Block Step.

**Scénario :** Robin attaque avec 2 DON!! attachés. L'adversaire a un Character à 3000 power et un autre à 5000. Action : activer When Attacking. Résultat : le joueur peut choisir de K.O. le Character à 3000 (≤4000). Le Character à 5000 ne peut pas être ciblé.

### 2.7 Opponent's Turn — PowerBoost conditionnel self (Usopp)

**Description :** Pendant le tour de l'adversaire, si Usopp a 2 DON!! attachés, il gagne +2000 power. Cet effet est passif — il n'y a pas d'activation. La puissance revient à 3000 au début du tour du joueur actif (ou lors du retour des DON!! en Refresh Phase).

**Scénario :** Usopp est en jeu avec 2 DON!! attachés. L'adversaire commence son tour. Résultat : Usopp a 5000 power pendant tout le tour adversaire. Au début du tour suivant du joueur, les DON!! reviennent en cost area et Usopp retrouve 3000 power.

### 2.8 Opponent's Turn — PowerBoost de groupe filtré (Franky)

**Description :** Pendant le tour de l'adversaire, si Franky a 2 DON!! attachés, tous les Characters de type {Straw Hat Crew} avec 4000 base power ou moins gagnent +1000 power. Le filtre porte sur la puissance de base (avant modificateurs), pas la puissance actuelle. Franky lui-même (4000 base power, Straw Hat Crew) est inclus dans les bénéficiaires.

**Scénario :** Franky a 2 DON!! attachés. L'adversaire débute son tour. En jeu : Usopp (3000 base, Straw Hat Crew), Jinbe (4000 base, Straw Hat Crew), Stussy (5000 base, Egghead — pas Straw Hat Crew). Résultat : Usopp passe à 4000, Jinbe passe à 5000, Franky passe à 5000, Stussy reste à 5000 (non ciblé car pas Straw Hat Crew).

### 2.9 On Play — Suppress Blocker conditionnel (Sanji)

**Description :** Lorsque Sanji est joué, le joueur sélectionne jusqu'à 1 Character de type {Straw Hat Crew} avec 6000 power ou plus. Si ce Character attaque pendant ce tour, l'adversaire ne peut pas activer [Blocker] contre cette attaque spécifique. L'effet est limité à une seule attaque — si le même Character attaque à nouveau ou si un autre Character attaque, Blocker est disponible normalement.
(source : qa_st-21.pdf Q1 — "After the Character selected by this [On Play] effect finishes attacking, if another Character or Leader attacks during the same turn, can my opponent activate [Blocker]? Yes, they can.")

**Scénario :** Sanji est joué. Tony Tony.Chopper (6000 power, Straw Hat Crew) est sélectionné. Chopper attaque le Leader adverse. Résultat : l'adversaire ne peut pas activer Blocker (ex. Sentomaru) pour cette attaque. Après la résolution de l'attaque de Chopper, si Luffy (ST21-014) attaque ensuite, le Blocker peut être activé normalement.

### 2.10 Event [Main] + Trigger — Disable Blocker ciblé (Gum-Gum Dawn Whip)

**Description — effet [Main] (ST21-016) :**
1. Jusqu'à 1 carte Leader ou Character du joueur gagne +1000 power jusqu'à la fin du tour.
2. Puis, jusqu'à 1 Character adverse avec 4000 power ou moins ne peut pas activer [Blocker] jusqu'à la fin du tour. La sélection peut cibler 0 cartes pour chacun des deux effets.

**Description — effet [Trigger] (ST21-016) :**
K.O. jusqu'à 1 Character adverse avec 4000 power ou moins. Déclenché lors d'un dommage.

**Scénario [Main] :** Luffy Leader est à 5000. L'adversaire a un Sentomaru (2000, Blocker) et un Character à 5000. Action : jouer Dawn Whip (coût 2). Résultat : le joueur choisit +1000 pour Luffy (6000 power ce tour), et marque Sentomaru comme "Blocker désactivé jusqu'à fin de tour". Si Luffy attaque, l'adversaire ne peut pas activer le Blocker de Sentomaru.

**Scénario [Trigger] :** L'adversaire attaque. La Life card révélée est ST21-016. Le joueur active le Trigger. Résultat : le joueur peut K.O. un Character adverse à 4000 power ou moins.

### 2.11 Event [Main] + Trigger — Power debuff conditionnel + KO (Gum-Gum Mole Pistol)

**Description — effet [Main] (ST21-017) :**
1. Donner −5000 power à jusqu'à 1 Character adverse jusqu'à la fin du tour.
2. Puis, si le joueur contrôle un Character avec 6000 power ou plus, K.O. jusqu'à 1 Character adverse avec 2000 power ou moins. Les deux cibles (pour −5000 et pour le KO) peuvent être des Characters différents.
(source : qa_st-21.pdf Q3 — "When activating this [Main] effect, can I choose to give −5000 power to one Character, and then choose to K.O. a different Character with 2000 power or less? Yes, you can.")

**Description — effet [Trigger] (ST21-017) :**
"Activate this card's [Main] effect." — la totalité de l'effet [Main] est rejouée lors du Trigger.

**Scénario [Main] :** Le joueur contrôle Tony Tony.Chopper (6000 power). L'adversaire a Character A à 6000 et Character B à 3000. Action : jouer Mole Pistol (coût 4). Résultat : −5000 appliqué à Character A (passe à 1000). Condition vérifiée : Chopper ≥6000. Le joueur peut maintenant K.O. Character B (3000 ≤2000? Non — B est à 3000 donc non ciblable) ou Character A désormais à 1000 (≤2000, donc K.O. possible). Après le −5000, le seuil de KO est réévalué sur la puissance courante.

**Note moteur :** La condition "if you have a Character with 6000 power or more" est évaluée après la résolution du debuff −5000 ou avant ? La formulation "then, if" implique que la condition est évaluée après l'application du −5000. Cela ouvre la possibilité : si un seul Character adverse existait et passait sous 6000 via le −5000, la condition peut ne plus être remplie si ce Character était le seul à 6000+ chez le joueur — mais le texte dit "you have a Character with 6000 power or more", soit le joueur lui-même, pas l'adversaire. La condition porte sur le board du joueur actif.

---

## 3. Règles spécifiques ST-21 issues du Q&A

### Q1 — ST21-003 Sanji : portée de la suppression Blocker

**Référence :** Q1 qa_st-21.pdf (ligne ST21-003 Sanji)

**Q :** After the Character selected by this [On Play] effect finishes attacking, if another Character or Leader attacks during the same turn, can my opponent activate [Blocker]?

**R :** Yes, they can.

**Résumé :** La suppression du Blocker s'applique uniquement à l'attaque du Character sélectionné. Dès que cette attaque est résolue, la suppression expire — les attaques suivantes du même tour (par d'autres cartes) permettent à nouveau au Blocker de s'activer.

**Règle moteur exploitable :** L'état `blockerSuppressedForCardId` dans `GameState` doit être effacé après la résolution du combat impliquant le Character marqué. Il ne doit pas persister pour toute la durée du tour — uniquement pour la prochaine attaque de ce Character.

---

### Q2 — ST21-015 Roronoa Zoro : On K.O. — restriction "autre Roronoa Zoro"

**Référence :** Q2 qa_st-21.pdf (ligne ST21-015 Roronoa Zoro, première entrée)

**Q :** Can I use this [On K.O.] effect to play other [Roronoa Zoro] cards, such as "OP01-025 Roronoa Zoro"?

**R :** No, you cannot.

**Résumé :** L'effet [On K.O.] de ST21-015 ne permet pas de jouer une carte portant le nom [Roronoa Zoro] quelle que soit son origine. Toutes les cartes nommées Roronoa Zoro sont exclues, pas seulement ST21-015 lui-même.

**Règle moteur exploitable :** Le filtre de sélection pour `PlayFromHand` doit exclure toutes les cartes dont le `name` est `"Roronoa Zoro"` (indépendamment du `cardId` ou du set). Un filtre `excludeName: "Roronoa Zoro"` est requis dans le `TargetSelector`.

---

### Q3 — ST21-015 Roronoa Zoro : interaction avec effet "until end of opponent's next turn"

**Référence :** Q3 qa_st-21.pdf (ligne ST21-015 Roronoa Zoro, seconde entrée)

**Q :** During my opponent's turn, I played OP09-013 Yasopp using this [On K.O.] effect, and activated its "[On Play] Up to 1 of your Leader gains +1000 power until the end of your opponent's next turn." effect. Will my Leader gain +1000 power until the end of the current turn?

**R :** Yes, it will gain +1000 power until the end of the current turn. "Until the end of your opponent's next turn" refers to the end of your opponent's current turn.

**Résumé :** Si un effet "until the end of your opponent's next turn" est activé pendant le tour de l'adversaire, il expire à la fin de ce même tour adversaire (pas au tour suivant de l'adversaire). La formulation "next turn" est relative au moment de l'activation — si l'activation se produit pendant le tour en question, c'est ce tour qui est concerné.

**Règle moteur exploitable :** La durée `EndOfOpponentNextTurn` ne doit pas toujours créer une échéance "dans deux tours". Si l'effet est activé pendant le tour de l'adversaire, l'échéance est `EndOfCurrentTurn` (tour adversaire en cours). Le moteur doit résoudre cette durée dynamiquement au moment de l'activation selon l'identité du joueur actif.

---

### Q4 — ST21-017 Gum-Gum Mole Pistol : double ciblage

**Référence :** Q4 qa_st-21.pdf (ligne ST21-017 Gum-Gum Mole Pistol)

**Q :** When activating this [Main] effect, can I choose to give −5000 power to one Character, and then choose to K.O. a different Character with 2000 power or less?

**R :** Yes, you can.

**Résumé :** Les deux effets séquentiels de Mole Pistol (−5000 et KO) peuvent cibler deux Characters adverses différents. La sélection est indépendante.

**Règle moteur exploitable :** L'effet [Main] de ST21-017 doit générer deux interactions de sélection séquentielles et indépendantes (`pendingTargetInteraction` × 2). La première interaction sélectionne la cible pour −5000, la seconde sélectionne la cible pour le KO (filtré par la puissance courante ≤2000 après application du −5000). Les deux pools de sélection peuvent se chevaucher mais la sélection doit rester indépendante.

---

## 4. Conditions et contraintes pour le moteur

### 4.1 HasCharacterWithMinPower

**Description formelle :** `HasCharacterWithMinPower(minPower: number)` — condition vérifiée sur le board du joueur actif. Retourne `true` si au moins un Character (pas le Leader) en jeu a une puissance courante (avec modificateurs) supérieure ou égale à `minPower`.

**Référence :** Texte de ST21-017 — "if you have a Character with 6000 power or more".

**Implémentation requise :** Nouvelle `EffectCondition` dans `types/index.ts`. Évaluée au moment de la résolution de la sous-action KO dans `effectResolver.ts`. La puissance courante doit inclure les DON!! attachés et les modificateurs temporaires actifs.

**Note :** La condition est évaluée APRES l'application du −5000 à la cible du premier effet. Ordre : [1] appliquer −5000, [2] évaluer HasCharacterWithMinPower sur le board du joueur, [3] si vrai, permettre la sélection KO ≤2000.

---

### 4.2 DisableBlocker (TargetedBlockerDisable)

**Description formelle :** `DisableBlocker(target: TargetSelector, duration: EffectDuration)` — marque un ou plusieurs Characters adverses comme incapables d'activer leur keyword [Blocker] jusqu'à expiration de la durée. La restriction ne s'applique qu'au keyword [Blocker] — la carte peut toujours être Counter depuis la main si elle est en main.

**Référence :** ST21-016 [Main] — "up to 1 of your opponent's Characters with 4000 power or less cannot activate [Blocker] during this turn."

**État GameState requis :** `blockerDisabledIds: readonly CardId[]` — liste des IDs de cartes dont le Blocker est désactivé.

**Vérification moteur :** Dans `applyAction.ts` handler `DeclareBlock`, avant d'accepter l'activation du Blocker, vérifier que `card.id` n'est pas dans `state.blockerDisabledIds`.

**Durée :** `EndOfTurn` (expire au début du tour suivant, à nettoyer en Refresh Phase ou en début de Main Phase du prochain tour).

---

### 4.3 SuppressBlockerForAttacker (DisableBlocker conditionnel par attaquant)

**Description formelle :** `SuppressBlockerForAttacker(targetAttacker: CardId)` — interdit à l'adversaire d'activer tout Blocker lorsque le Character désigné par `targetAttacker` est l'attaquant déclarant. La suppression expire dès que l'attaque du Character désigné est résolue (pas à la fin du tour).

**Référence :** ST21-003 Sanji [On Play] + Q1 qa_st-21.pdf.

**État GameState requis :** `blockerSuppressedForAttackerId: CardId | null` — ID du Character dont la prochaine attaque interdit le Blocker. Remis à `null` après résolution du combat impliquant ce Character.

**Distinction avec DisableBlocker :** `DisableBlocker` cible un défenseur spécifique (la carte qui ne peut pas activer Blocker). `SuppressBlockerForAttacker` cible un attaquant — toute activation de Blocker est interdite pour l'attaque de ce Character, quel que soit le Blocker tenté.

**Vérification moteur :** Dans `applyAction.ts` handler `DeclareBlock`, vérifier que `state.blockerSuppressedForAttackerId !== currentAttackerId`.

---

### 4.4 Filtre subType dans AllOwnCharacters

**Description formelle :** Le sélecteur `AllOwnCharacters` dans `selectTargets()` doit accepter un paramètre optionnel `subType?: string`. Lorsque ce paramètre est présent, seuls les Characters dont le champ `subTypes` contient la valeur donnée (comparaison `includes`, insensible à la casse ou correspondance exacte selon la convention du moteur) sont inclus dans le résultat.

**Référence :** ST21-011 Franky [Opponent's Turn] — "All of your {Straw Hat Crew} type Characters with 4000 base power or less gain +1000 power."

**Note :** Le filtre `maxPower` dans ce contexte porte sur la `basePower` (puissance de base sans modificateurs), pas la puissance courante. Cette distinction est importante pour éviter qu'un Character temporairement boosté au-dessus de 4000 n'échappe à l'effet.

---

### 4.5 ExcludeName dans PlayFromHand TargetSelector

**Description formelle :** Le sélecteur `PlayFromHand` doit accepter un paramètre `excludeName?: string`. Lorsque présent, toutes les cartes dont le champ `name` correspond à `excludeName` (correspondance exacte) sont exclues de la sélection, indépendamment du set ou de l'ID de carte.

**Référence :** Q2 qa_st-21.pdf — ST21-015 Roronoa Zoro ne peut pas jouer d'autre carte nommée "Roronoa Zoro".

---

### 4.6 EndOfOpponentNextTurn — résolution dynamique de la durée

**Description formelle :** La durée `EndOfOpponentNextTurn` doit être résolue au moment de l'activation de l'effet. Si le joueur actif au moment de l'activation est l'adversaire (c'est-à-dire : l'effet est déclenché pendant le tour de l'adversaire, ex. via un Trigger ou un On K.O. adversaire), alors `EndOfOpponentNextTurn` est équivalent à `EndOfCurrentTurn`.

**Référence :** Q3 qa_st-21.pdf — ST21-015 Roronoa Zoro interaction avec OP09-013 Yasopp.

**Implémentation :** Dans le resolver de durée, injecter l'identité du joueur actif au moment de la création du modificateur. Comparer avec `state.activePlayerId` pour déterminer si "opponent's next turn" est le tour en cours ou le tour suivant.

---

## 5. Cas limites (edge cases)

### 5.1 Interaction DisableBlocker (ST21-016) vs Blocker (ST21-007) + Event Counter

**Scénario :** Le joueur joue Gum-Gum Dawn Whip. L'adversaire a Sentomaru (2000, Blocker) et un Character X à 3000. Dawn Whip applique "cannot activate Blocker" sur Sentomaru jusqu'à fin de tour. Le joueur attaque avec Luffy (6000). Le tour du joueur : l'adversaire tente d'activer le Blocker de Sentomaru.

**Résultat attendu :** L'adversaire ne peut pas activer le Blocker de Sentomaru pour toute attaque ce tour, car Sentomaru est dans `state.blockerDisabledIds`. L'adversaire peut en revanche jouer un Event Counter depuis sa main si Sentomaru est en main — mais Sentomaru est en jeu donc son Counter ne peut pas être utilisé.
(source : qa_rules.md — "Can I activate Counters of Characters on the field like [Counter +1000]? No, you can only activate the Counters of cards in your hand.")

**Règle moteur :** `blockerDisabledIds` bloque uniquement l'activation de [Blocker] depuis le terrain. Il ne bloque pas les Event Counters joués depuis la main. Les deux mécanismes sont indépendants.

---

### 5.2 Interaction SuppressBlockerForAttacker (ST21-003 Sanji) vs attaques multiples

**Scénario :** Sanji est joué. Tony Tony.Chopper (6000) est sélectionné. Tour du joueur : Chopper attaque (Blocker supprimé pour cette attaque). Après résolution, Brook (4000) attaque.

**Résultat attendu :** Lors de l'attaque de Chopper, `state.blockerSuppressedForAttackerId === ChopperId` — l'adversaire ne peut pas activer Blocker. Après résolution du combat de Chopper, le moteur efface `blockerSuppressedForAttackerId` (retour à `null`). Lors de l'attaque de Brook, `blockerSuppressedForAttackerId === null` — l'adversaire peut activer Blocker normalement.
(source : Q1 qa_st-21.pdf)

**Règle moteur :** La remise à `null` de `blockerSuppressedForAttackerId` doit se faire dans le handler `ResolveCombat` de `applyAction.ts`, après la résolution du combat, si le combattant était le Character marqué.

---

### 5.3 Interaction Trigger ST21-017 vs condition HasCharacterWithMinPower

**Scénario :** L'adversaire attaque. La Life card révélée est ST21-017 (Gum-Gum Mole Pistol). Le joueur active le Trigger ("Activate this card's [Main] effect"). Au moment du Trigger, le joueur n'a aucun Character en jeu (seulement le Leader).

**Résultat attendu :** L'effet [Main] est déclenché. Étape 1 : −5000 à jusqu'à 1 Character adverse (le joueur peut choisir 0). Étape 2 : la condition `HasCharacterWithMinPower(6000)` est évaluée sur les Characters du joueur (pas le Leader). Aucun Character en jeu — condition non remplie. Le KO ≤2000 n'est pas disponible.

**Note critique :** La condition "if you have a Character with 6000 power or more" exclut le Leader. La formulation "Character" dans les règles OPTCG désigne exclusivement les cartes de type Character, pas le Leader.

**Règle moteur :** `HasCharacterWithMinPower` ne doit filtrer que `zone.characters` du joueur actif, pas `zone.leader`.

---

### 5.4 Effets "During this turn" — expiration au bon moment

**Scénario A (ST21-016 Dawn Whip +1000) :** L'effet +1000 est appliqué en Main Phase. L'adversaire reçoit un dommage via un Trigger — la Life card révélée est une autre carte. L'effet +1000 sur le Leader/Character dure jusqu'à la fin du tour du joueur actif.

**Résultat attendu :** L'effet expire exactement à la fin de la End Phase du joueur actif (avant Refresh Phase). Il ne doit pas être nettoyé lors des phases intermédiaires (DON Phase, Main Phase, Attack Phase).

**Scénario B (ST21-017 −5000) :** L'adversaire active un Trigger de ST21-017 pendant son tour. Le −5000 s'applique sur un Character du joueur.

**Résultat attendu :** "During this turn" = pendant le tour en cours de l'adversaire. Le modificateur expire en fin du tour de l'adversaire. Le Character reprend sa puissance normale au début du tour du joueur.

**Règle moteur :** Les modificateurs `EndOfTurn` doivent être nettoyés dans la End Phase (ou au début de la Refresh Phase) du joueur dont c'est le tour. L'identité du joueur actif au moment de l'activation doit être stockée dans le modificateur pour calculer l'expiration correcte.

---

### 5.5 Franky [Opponent's Turn] — base power vs puissance courante pour le filtre ≤4000

**Scénario :** Franky est en jeu avec 2 DON!! attachés. L'adversaire commence son tour. Usopp est en jeu avec 2 DON!! attachés (puissance courante : 3000 + 2000 = 5000 avec DON). Brook est en jeu sans DON (puissance courante = base power = 4000, Straw Hat Crew).

**Résultat attendu :** L'effet de Franky filtre sur la puissance de BASE (4000 ou moins). Usopp a une base power de 3000 — il est inclus. Brook a une base power de 4000 — inclus. Si un Character avait une base power de 5000 mais était à 3000 à cause d'un modificateur adverse, il ne serait PAS inclus (base power > 4000).

**Règle moteur :** Le filtre `maxPower` dans le sélecteur de Franky doit interroger `card.basePower` (ou `card.power` si c'est la valeur canonique du JSON), pas la puissance courante calculée avec modificateurs et DON.
(source : texte ST21-011 — "with 4000 base power or less")

---

## Impact moteur

Les points suivants nécessiteront des modifications dans le moteur ou la DSL. Classés par priorité descendante.

### Nouveaux EffectAction requis

1. **`DisableBlocker`** (`EffectAction`) — cible un Character adverse, le marque comme ne pouvant pas activer [Blocker] pour une durée donnée. Nécessite `blockerDisabledIds: readonly CardId[]` dans `GameState`. Impact : `effectResolver.ts` (ajout du case), `applyAction.ts` (vérification dans `DeclareBlock`), `types/index.ts` (nouveau type + champ GameState). Cartes : ST21-016.

2. **`SuppressBlockerForAttacker`** (`EffectAction`) — marque un Character allié comme attaquant pour lequel tout Blocker est interdit. Nécessite `blockerSuppressedForAttackerId: CardId | null` dans `GameState`. Impact : `effectResolver.ts`, `applyAction.ts` (`DeclareBlock` + `ResolveCombat`), `types/index.ts`. Cartes : ST21-003.

### Nouvelles EffectCondition requises

3. **`HasCharacterWithMinPower`** (`EffectCondition`) — retourne `true` si le joueur actif contrôle au moins un Character (pas le Leader) avec puissance courante ≥ N. Impact : `types/index.ts` (nouveau type), `effectResolver.ts` (évaluation dans `evaluateCondition`). Cartes : ST21-017.

### Modifications de sélecteurs existants

4. **`AllOwnCharacters` + filtre `subType`** dans `selectTargets()` de `effectResolver.ts` — ajouter le filtrage par subtype. Impact : `effectResolver.ts`, `types/index.ts` (champ `subType?: string` dans le sélecteur). Cartes : ST21-011.

5. **`PlayFromHand` + `excludeName`** dans `selectTargets()` — ajouter le filtrage par nom exclu. Impact : `effectResolver.ts`, `types/index.ts`. Cartes : ST21-015.

6. **`AllOwnCharacters` filtre `maxPower` sur `basePower`** — s'assurer que le filtre `maxPower` compare `card.power` (valeur canonique JSON = base power) et non la puissance courante calculée. Impact : `effectResolver.ts`. Cartes : ST21-011.

### Résolution de durée dynamique

7. **`EndOfOpponentNextTurn` — résolution relative au joueur actif** — lors de la création d'un modificateur avec cette durée, vérifier si le joueur actif est l'adversaire du propriétaire de l'effet. Si oui, l'échéance est `EndOfCurrentTurn`. Impact : `effectResolver.ts` (création des power modifiers), `types/index.ts` (durée ou méta-données du modificateur). Cartes : ST21-015 (interaction cross-set), applicable à toutes futures cartes avec cette durée.

### Corrections DSL (fichiers `packages/data/effects/`)

8. **ST21-007.json + _p1.json** — `"keywords": []` → `"keywords": ["Blocker"]`
9. **ST21-003.json + _p1.json** — `"effects": []` → ajouter l'effet `OnPlay + SelectTarget + SuppressBlockerForAttacker` une fois le type créé
10. **ST21-017.json** — ajouter l'effet `Trigger` (rejouer [Main]) et encoder la condition `HasCharacterWithMinPower(6000)` sur le KO
11. **ST21-016.json** — ajouter l'effet `DisableBlocker` dans la partie [Main]

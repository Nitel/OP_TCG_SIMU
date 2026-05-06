# DSL Fix Summary

Generated: 2026-05-06T11:55:50.029Z

**Total patched:** 1455 | **Total skipped:** 614

## EB-01 — 22 cartes patchées

**critical (13):** EB01-002, EB01-010, EB01-011, EB01-013, EB01-014, EB01-021, EB01-033, EB01-037, EB01-039, EB01-053, EB01-056, EB01-059, EB01-060

**major (9):** EB01-007, EB01-016, EB01-019, EB01-040, EB01-044, EB01-045, EB01-047, EB01-050, EB01-061

**skipped — type inconnu (30):**
- EB01-001 (Trigger::Passive, Keyword::Counter, TargetScope::OwnCharacters, Duration::UntilStartOfYourNextTurn)
- EB01-003 (InvalidTarget::GiveKeyword(noScope), ConditionType::OpponentLifeCount, InvalidTarget::PowerBoost(noScope))
- EB01-004 (ConditionType::LeaderIsActive)
- EB01-006 (InvalidTarget::PowerBoost(notObject))
- EB01-008 (ConditionType::KOByEffect, ActionType::PreventKO, InvalidTarget::PreventKO(notObject))
- EB01-009 (FilterKind::ByTypeAndCost)
- EB01-012 (ConditionType::And, InvalidTarget::Rest(notObject))
- EB01-017 (no suggestedDsl)
- EB01-020 (InvalidCondition::LeaderHasType(noSubType))
- EB01-022 (ConditionType::HandCount)
- EB01-024 (ConditionType::HandSize)
- EB01-026 (ConditionType::And, TargetScope::ChooseCharacter)
- EB01-027 (InvalidCondition::LeaderHasType(noSubType), InvalidTarget::PowerBoost(notObject))
- EB01-028 (InvalidCondition::LeaderHasType(noSubType), TargetScope::OpponentActiveCharacter)
- EB01-029 (ActionType::PlaceCardToBottomOfDeck, TargetScope::RevealedCard)
- EB01-030 (no suggestedDsl)
- EB01-031 (InvalidCondition::LeaderHasType(noSubType))
- EB01-034 (InvalidCondition::LeaderHasType(noSubType))
- EB01-035 (InvalidCondition::LeaderHasAnyType(noSubTypes))
- EB01-036 (InvalidTarget::GiveKeyword(notObject), InvalidCondition::LeaderHasType(noSubType))
- EB01-038 (InvalidCondition::LeaderHasType(noSubType), ActionType::ChangeAttackTarget)
- EB01-042 (ActionType::TrashSelf, ActionType::CostReduction)
- EB01-043 (ActionType::MoveToBottomOfDeck)
- EB01-046 (ActionType::CostReduction)
- EB01-048 (ActionType::CostReduction)
- EB01-051 (ConditionType::PayCost)
- EB01-052 (Trigger::Static, InvalidTarget::GiveKeyword(notObject), ActionType::ModalChoice)
- EB01-054 (ConditionType::OpponentLifeCount)
- EB01-057 (ConditionType::KOByOpponentEffect)
- EB01-058 (ConditionType::And)

## EB-02 — 23 cartes patchées

**critical (16):** EB02-005, EB02-008, EB02-017, EB02-020, EB02-022, EB02-023, EB02-031, EB02-033, EB02-036, EB02-040, EB02-050, EB02-055, EB02-057, EB02-058, EB02-059, EB02-060

**major (7):** EB02-002, EB02-009, EB02-013, EB02-014, EB02-025, EB02-032, EB02-049

**skipped — type inconnu (30):**
- EB02-003 (InvalidCondition::LeaderHasType(noSubType))
- EB02-006 (ConditionType::Or)
- EB02-007 (TargetScope::ChooseOwnCharactersAndLeader)
- EB02-010 (ConditionType::OnlyHasTypeOnBoard, ActionType::UnrestDon, Duration::UntilEndOfOpponentsNextTurn)
- EB02-011 (InvalidCondition::LeaderHasAnyType(noSubTypes), Keyword::CannotBeRested, Duration::UntilEndOfOpponentNextTurn)
- EB02-012 (Duration::WhileConditionMet)
- EB02-015 (ActionType::PreventRefresh, Duration::UntilNextOpponentRefreshPhase, MissingTarget::AttachDon)
- EB02-018 (ConditionType::NegateCondition)
- EB02-019 (InvalidCondition::LeaderHasType(noSubType))
- EB02-021 (Keyword::CannotBecomeActive, TargetScope::SameAsAbove, Duration::UntilNextRefreshPhase)
- EB02-024 (ActionType::BottomDeck, TargetScope::ChooseCharacter)
- EB02-026 (ConditionType::And)
- EB02-027 (no suggestedDsl)
- EB02-028 (InvalidCondition::LeaderHasAnyType(noSubTypes))
- EB02-030 (ActionType::PreventKO)
- EB02-035 (Trigger::DonReturned, ConditionType::DonReturnedCount, ConditionType::DonCountComparison)
- EB02-037 (ConditionType::And)
- EB02-039 (ConditionType::DonCountComparison)
- EB02-041 (InvalidCondition::LeaderHasType(noSubType), ConditionType::DonCountComparison, ActionType::CostBoost)
- EB02-044 (FilterKind::ByColorAndTypeAndCost)
- EB02-045 (ActionType::Choice, InvalidTarget::GiveKeyword(notObject))
- EB02-046 (no suggestedDsl)
- EB02-047 (InvalidTarget::PlayFromTrash(noScope))
- EB02-048 (MissingTarget::ReturnToHand)
- EB02-051 (ActionType::CostReduction)
- EB02-052 (InvalidCondition::LeaderHasType(noSubType))
- EB02-053 (InvalidTarget::FlipLife(notObject))
- EB02-054 (no suggestedDsl)
- EB02-056 (FilterKind::ByTypeAndCost)
- EB02-061 (ConditionType::And, InvalidTarget::GiveKeyword(noScope), ConditionType::OncePerTurn, InvalidTarget::Rest(noScope))

## EB-03 — 39 cartes patchées

**critical (14):** EB03-001, EB03-011, EB03-023, EB03-024, EB03-033, EB03-034, EB03-037, EB03-038, EB03-045, EB03-052, EB03-053, EB03-055, EB03-058, EB03-061

**major (25):** EB03-003, EB03-005, EB03-007, EB03-009, EB03-013, EB03-015, EB03-016, EB03-028, EB03-029, EB03-032, EB03-035, EB03-036, EB03-039, EB03-041, EB03-042, EB03-043, EB03-044, EB03-046, EB03-047, EB03-048, EB03-049, EB03-050, EB03-057, EB03-060, EB03-062

**skipped — type inconnu (20):**
- EB03-004 (ConditionType::And)
- EB03-006 (InvalidCondition::LeaderHasType(noSubType))
- EB03-008 (Keyword::CanAttackActive)
- EB03-010 (InvalidTarget::GiveKeyword(notObject), FilterKind::Or)
- EB03-012 (TargetScope::ChooseOpponentDonOrCharacter)
- EB03-014 (InvalidCondition::LeaderHasAnyType(noSubTypes))
- EB03-017 (InvalidCondition::LeaderHasType(noSubType), Keyword::CannotBeRested, Duration::UntilEndOfOpponentNextEndPhase)
- EB03-018 (Keyword::CannotBeKOdByOpponentEffects)
- EB03-019 (no suggestedDsl)
- EB03-020 (TargetScope::SameAsFirstAction)
- EB03-021 (TargetScope::ChooseCharacter)
- EB03-022 (InvalidTarget::ReturnToHand(noScope))
- EB03-025 (TargetScope::ChooseCharacter)
- EB03-026 (no suggestedDsl)
- EB03-027 (TargetScope::ChooseCharacter)
- EB03-031 (InvalidCondition::LeaderIsName(noName), ActionType::ActivateEffect, FilterKind::Card)
- EB03-051 (TargetScope::YourLifeCards)
- EB03-054 (InvalidConditions::array)
- EB03-056 (TargetScope::OpponentCharacter)
- EB03-059 (ConditionType::AND)

## EB-04 — 40 cartes patchées

**critical (14):** EB04-001, EB04-011, EB04-014, EB04-027, EB04-029, EB04-031, EB04-035, EB04-041, EB04-043, EB04-051, EB04-055, EB04-057, EB04-058, EB04-059

**major (26):** EB04-004, EB04-006, EB04-007, EB04-009, EB04-015, EB04-016, EB04-017, EB04-018, EB04-019, EB04-021, EB04-022, EB04-024, EB04-026, EB04-030, EB04-033, EB04-036, EB04-037, EB04-038, EB04-045, EB04-047, EB04-048, EB04-049, EB04-050, EB04-053, EB04-056, EB04-061

**skipped — type inconnu (21):**
- EB04-002 (no suggestedDsl)
- EB04-003 (InvalidConditions::array)
- EB04-005 (InvalidConditions::array, MissingTarget::Rest)
- EB04-008 (ConditionType::HasLifeCards, TargetScope::OpponentCharacter, Duration::DuringBattle)
- EB04-010 (InvalidConditions::array)
- EB04-012 (ActionType::SetLeaderActive)
- EB04-013 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- EB04-020 (Duration::DuringBattle)
- EB04-023 (InvalidCondition::string)
- EB04-025 (ActionType::ReturnToBottom, InvalidTarget::ReturnToBottom(notObject))
- EB04-028 (InvalidCondition::LeaderHasType(noSubType), Keyword::CannotAttack)
- EB04-032 (InvalidCondition::LeaderHasType(noSubType), FilterKind::Don, MissingTarget::Rest)
- EB04-034 (InvalidConditions::array)
- EB04-039 (InvalidFilterCardType::"DON", MissingTarget::AttachDon, InvalidConditions::array, InvalidTarget::KO(notObject))
- EB04-040 (InvalidCondition::string, Duration::DuringBattle)
- EB04-042 (InvalidTarget::PowerBoost(notObject))
- EB04-044 (InvalidCondition::LeaderHasType(noSubType))
- EB04-046 (InvalidConditions::array, TargetScope::YourField)
- EB04-052 (ConditionType::HasLife)
- EB04-054 (no suggestedDsl)
- EB04-060 (TargetScope::YourLifeCards)

## OP-01 — 72 cartes patchées

**critical (24):** OP01-004, OP01-005, OP01-009, OP01-014, OP01-016, OP01-019, OP01-025, OP01-026, OP01-029, OP01-032, OP01-034, OP01-062, OP01-063, OP01-071, OP01-073, OP01-075, OP01-084, OP01-086, OP01-088, OP01-090, OP01-100, OP01-101, OP01-106, OP01-112

**major (48):** OP01-001, OP01-006, OP01-008, OP01-013, OP01-020, OP01-022, OP01-024, OP01-027, OP01-028, OP01-030, OP01-031, OP01-035, OP01-039, OP01-040, OP01-041, OP01-042, OP01-044, OP01-049, OP01-050, OP01-052, OP01-054, OP01-055, OP01-056, OP01-058, OP01-059, OP01-064, OP01-068, OP01-069, OP01-072, OP01-074, OP01-078, OP01-085, OP01-087, OP01-089, OP01-091, OP01-094, OP01-095, OP01-096, OP01-097, OP01-098, OP01-102, OP01-108, OP01-109, OP01-111, OP01-114, OP01-116, OP01-117, OP01-118

**skipped — type inconnu (28):**
- OP01-002 (InvalidConditions::array, InvalidTarget::ReturnToHand(notObject), InvalidTarget::PlayFromHand(notObject))
- OP01-003 (InvalidConditions::array, InvalidTarget::Rest(notObject), InvalidTarget::PlayFromHand(notObject), InvalidTarget::PowerBoost(notObject))
- OP01-011 (MissingTarget::ReturnToHand)
- OP01-015 (FilterKind::Character)
- OP01-021 (InvalidConditions::array, Keyword::CanAttackActiveCharacters, MissingTarget::GiveKeyword)
- OP01-037 (no suggestedDsl)
- OP01-038 (TargetScope::OpponentChoosesFromHand)
- OP01-046 (MissingTarget::AttachDon)
- OP01-047 (InvalidConditions::array)
- OP01-051 (Trigger::DuringOpponentTurn, ActionType::BlockAttack, InvalidTarget::Rest(notObject))
- OP01-057 (Keyword::Active)
- OP01-060 (ActionType::PlayFromDeck)
- OP01-061 (MissingTarget::AttachDon)
- OP01-067 (MissingTarget::PowerBoost)
- OP01-070 (TargetScope::ChooseCharacter)
- OP01-077 (InvalidConditions::array, InvalidTarget::SearchDeck(notObject))
- OP01-079 (InvalidCondition::LeaderHasType(noSubType), MissingTarget::ReturnToHand)
- OP01-082 (no suggestedDsl)
- OP01-083 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP01-093 (InvalidConditions::array, MissingTarget::AttachDon)
- OP01-099 (InvalidConditions::array, Keyword::CannotBeKO'd, InvalidTarget::GiveKeyword(notObject))
- OP01-104 (no suggestedDsl)
- OP01-105 (InvalidConditions::array, InvalidTarget::RevealFromHand(notObject))
- OP01-113 (MissingTarget::Rest)
- OP01-115 (InvalidTarget::SearchDeck(noScope))
- OP01-119 (Duration::DuringBattle)
- OP01-120 (no suggestedDsl)
- OP01-121 (InvalidConditions::array, InvalidTarget::GiveKeyword(notObject))

## OP-02 — 61 cartes patchées

**critical (22):** OP02-021, OP02-026, OP02-036, OP02-045, OP02-046, OP02-047, OP02-049, OP02-051, OP02-057, OP02-064, OP02-065, OP02-068, OP02-069, OP02-075, OP02-081, OP02-089, OP02-091, OP02-096, OP02-110, OP02-114, OP02-117, OP02-118

**major (39):** OP02-001, OP02-009, OP02-013, OP02-015, OP02-016, OP02-018, OP02-019, OP02-030, OP02-032, OP02-034, OP02-035, OP02-037, OP02-040, OP02-041, OP02-048, OP02-050, OP02-056, OP02-059, OP02-062, OP02-067, OP02-070, OP02-072, OP02-076, OP02-079, OP02-082, OP02-086, OP02-087, OP02-090, OP02-092, OP02-093, OP02-094, OP02-098, OP02-099, OP02-102, OP02-103, OP02-115, OP02-119, OP02-120, OP02-121

**skipped — type inconnu (32):**
- OP02-002 (Trigger::OnAttachedDon)
- OP02-004 (Keyword::CannotAddLifeToHand, MissingTarget::GiveKeyword)
- OP02-005 (FilterKind::ByMultiple)
- OP02-008 (InvalidConditions::array)
- OP02-010 (InvalidConditions::array)
- OP02-012 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP02-014 (Keyword::CanAttackActive)
- OP02-022 (ActionType::OrderDeck)
- OP02-023 (no suggestedDsl)
- OP02-024 (TargetScope::OwnCharacters)
- OP02-025 (InvalidConditions::array, InvalidTarget::GiveKeyword(notObject))
- OP02-027 (Keyword::CannotBeRemoved, MissingTarget::GiveKeyword)
- OP02-029 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP02-038 (InvalidTarget::GiveKeyword(notObject))
- OP02-058 (FilterKind::ByProperties)
- OP02-061 (ConditionType::HandCount, Keyword::CannotBlock)
- OP02-063 (MissingTarget::ReturnToHand, FilterKind::ByProperties)
- OP02-066 (InvalidCondition::LeaderHasType(noSubType))
- OP02-071 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP02-074 (InvalidConditions::array, InvalidTarget::GiveKeyword(notObject))
- OP02-078 (InvalidTarget::GiveDon(notObject))
- OP02-083 (ActionType::OrderDeckBottom)
- OP02-085 (ActionType::ReturnDonToOpponentDeck, InvalidTarget::ReturnDonToOpponentDeck(notObject), ConditionType::DuringOpponentTurn)
- OP02-095 (InvalidTarget::GiveKeyword(noScope))
- OP02-100 (InvalidConditions::array, InvalidTarget::KO(notObject))
- OP02-101 (InvalidConditions::array, ActionType::PreventBlocker, InvalidTarget::PreventBlocker(notObject))
- OP02-104 (no suggestedDsl)
- OP02-105 (TargetScope::OpponentCharacter)
- OP02-106 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP02-108 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP02-112 (no suggestedDsl)
- OP02-113 (InvalidConditions::array)

## OP-03 — 77 cartes patchées

**critical (37):** OP03-008, OP03-010, OP03-012, OP03-018, OP03-019, OP03-030, OP03-037, OP03-038, OP03-040, OP03-041, OP03-051, OP03-053, OP03-054, OP03-055, OP03-057, OP03-062, OP03-063, OP03-065, OP03-075, OP03-079, OP03-080, OP03-086, OP03-089, OP03-090, OP03-094, OP03-097, OP03-098, OP03-102, OP03-107, OP03-108, OP03-109, OP03-110, OP03-112, OP03-113, OP03-114, OP03-119, OP03-121

**major (40):** OP03-003, OP03-004, OP03-005, OP03-011, OP03-013, OP03-015, OP03-016, OP03-017, OP03-020, OP03-021, OP03-022, OP03-024, OP03-025, OP03-026, OP03-027, OP03-029, OP03-034, OP03-039, OP03-044, OP03-045, OP03-049, OP03-050, OP03-058, OP03-059, OP03-060, OP03-064, OP03-066, OP03-068, OP03-069, OP03-070, OP03-071, OP03-072, OP03-073, OP03-074, OP03-077, OP03-078, OP03-092, OP03-095, OP03-105, OP03-116

**skipped — type inconnu (27):**
- OP03-002 (InvalidConditions::array, Keyword::OpponentBlockerRestriction, MissingTarget::GiveKeyword)
- OP03-009 (InvalidConditions::array, InvalidTarget::AttachDon(notObject))
- OP03-028 (InvalidConditions::array, ActionType::ChoiceAction)
- OP03-031 (InvalidCondition::string, InvalidTarget::Rest(notObject))
- OP03-032 (no suggestedDsl)
- OP03-033 (no suggestedDsl)
- OP03-036 (InvalidConditions::array)
- OP03-042 (MissingTarget::ReturnToHand)
- OP03-043 (InvalidConditions::array, InvalidTarget::ForceDiscard(notObject), InvalidTarget::KO(notObject))
- OP03-047 (TargetScope::ChooseYourCharacter)
- OP03-067 (InvalidCondition::LeaderHasType(noSubType), MissingTarget::AttachDon)
- OP03-076 (InvalidTarget::Rest(notObject))
- OP03-081 (TargetScope::OpponentCharacter)
- OP03-083 (InvalidConditions::array)
- OP03-088 (Trigger::Always, InvalidConditions::array, Keyword::CannotBeKOdByEffects, MissingTarget::GiveKeyword, MissingTarget::Rest)
- OP03-091 (no suggestedDsl)
- OP03-093 (InvalidCondition::string)
- OP03-096 (TargetScope::ChooseOpponentCharacterOrStage)
- OP03-099 (InvalidConditions::array, ActionType::PeekLifeCard, InvalidTarget::PeekLifeCard(notObject), ActionType::ReorderLifeCard, InvalidTarget::PowerBoost(notObject), Duration::DuringBattle)
- OP03-100 (no suggestedDsl)
- OP03-104 (Trigger::Static, InvalidTarget::GiveKeyword(notObject))
- OP03-115 (TargetScope::OpponentCharacter)
- OP03-117 (InvalidConditions::array, Duration::UntilStartOfYourNextTurn)
- OP03-118 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP03-120 (InvalidConditions::array, InvalidTarget::ForceDiscard(notObject))
- OP03-122 (TargetScope::ChooseCharacter)
- OP03-123 (InvalidConditions::array, InvalidTarget::FlipLife(notObject))

## OP-04 — 77 cartes patchées

**critical (37):** OP04-011, OP04-012, OP04-016, OP04-020, OP04-024, OP04-027, OP04-028, OP04-035, OP04-036, OP04-037, OP04-038, OP04-039, OP04-040, OP04-051, OP04-059, OP04-061, OP04-066, OP04-069, OP04-073, OP04-075, OP04-077, OP04-081, OP04-082, OP04-083, OP04-089, OP04-091, OP04-092, OP04-093, OP04-095, OP04-097, OP04-099, OP04-101, OP04-104, OP04-106, OP04-108, OP04-110, OP04-116

**major (40):** OP04-001, OP04-002, OP04-003, OP04-004, OP04-006, OP04-008, OP04-015, OP04-017, OP04-018, OP04-022, OP04-025, OP04-026, OP04-030, OP04-032, OP04-033, OP04-034, OP04-044, OP04-046, OP04-050, OP04-055, OP04-060, OP04-064, OP04-065, OP04-068, OP04-071, OP04-074, OP04-076, OP04-079, OP04-084, OP04-085, OP04-086, OP04-088, OP04-094, OP04-098, OP04-102, OP04-105, OP04-109, OP04-112, OP04-115, OP04-118

**skipped — type inconnu (29):**
- OP04-005 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP04-009 (TargetScope::YourLeader)
- OP04-014 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP04-019 (InvalidTarget::Rest(notObject))
- OP04-021 (TargetScope::ChooseOpponentDon)
- OP04-029 (InvalidCondition::string, InvalidTarget::Rest(notObject))
- OP04-031 (no suggestedDsl)
- OP04-041 (MissingTarget::PlaceAtBottomOfDeck)
- OP04-042 (no suggestedDsl)
- OP04-043 (TargetScope::ChooseCharacter)
- OP04-047 (InvalidConditions::array, InvalidTarget::ReturnToHand(notObject))
- OP04-048 (InvalidConditions::array, InvalidTarget::ReturnToHand(notObject))
- OP04-052 (InvalidConditions::array)
- OP04-053 (MissingTarget::ReturnToHand)
- OP04-057 (TargetScope::ChooseOwnLeaderOrCharacter, Duration::DuringBattle, ActionType::Custom)
- OP04-058 (MissingTarget::AttachDon)
- OP04-063 (InvalidCondition::LeaderHasType(noSubType), TargetScope::ChooseOwnLeaderOrCharacter)
- OP04-067 (no suggestedDsl)
- OP04-070 (TargetScope::ChooseUpToOneOpponentCharacter)
- OP04-072 (ActionType::RemoveDon)
- OP04-080 (InvalidConditions::array, Keyword::CanAttackActiveCharacters, InvalidTarget::GiveKeyword(notObject))
- OP04-090 (InvalidTarget::Rest(notObject), Keyword::CannotBecomeActiveNextRefresh, InvalidTarget::GiveKeyword(notObject))
- OP04-096 (InvalidConditions::array, Keyword::Haste, MissingTarget::GiveKeyword)
- OP04-100 (no suggestedDsl)
- OP04-103 (InvalidFilterCardType::["Leader","Character"])
- OP04-111 (InvalidConditions::array, MissingTarget::KO, TargetScope::Board)
- OP04-113 (no suggestedDsl)
- OP04-117 (no suggestedDsl)
- OP04-119 (Trigger::OnOpponentTurn, Keyword::CannotBeKOd, TargetScope::YourCharacters)

## OP-05 — 74 cartes patchées

**critical (30):** OP05-013, OP05-015, OP05-017, OP05-020, OP05-021, OP05-022, OP05-024, OP05-030, OP05-031, OP05-037, OP05-045, OP05-048, OP05-052, OP05-060, OP05-069, OP05-073, OP05-085, OP05-086, OP05-088, OP05-091, OP05-093, OP05-096, OP05-099, OP05-101, OP05-103, OP05-113, OP05-114, OP05-115, OP05-117, OP05-119

**major (44):** OP05-001, OP05-002, OP05-003, OP05-004, OP05-005, OP05-006, OP05-007, OP05-009, OP05-014, OP05-018, OP05-023, OP05-025, OP05-026, OP05-027, OP05-029, OP05-033, OP05-034, OP05-040, OP05-042, OP05-043, OP05-047, OP05-049, OP05-050, OP05-054, OP05-056, OP05-062, OP05-063, OP05-064, OP05-066, OP05-067, OP05-070, OP05-071, OP05-072, OP05-075, OP05-076, OP05-077, OP05-078, OP05-082, OP05-084, OP05-087, OP05-090, OP05-095, OP05-102, OP05-118

**skipped — type inconnu (32):**
- OP05-008 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP05-016 (Duration::DuringBattle)
- OP05-019 (Duration::DuringTurn)
- OP05-028 (InvalidConditions::array)
- OP05-032 (TargetScope::YourCharacters)
- OP05-038 (InvalidConditions::array, TargetScope::OwnRestingDon)
- OP05-039 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP05-041 (Keyword::ReduceCost)
- OP05-046 (MissingTarget::ReturnToHand)
- OP05-051 (FilterKind::Character)
- OP05-053 (InvalidCondition::string, MissingTarget::PowerBoost)
- OP05-055 (no suggestedDsl)
- OP05-057 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP05-058 (TargetScope::AllCharacters, TargetScope::BothPlayers)
- OP05-059 (InvalidCondition::LeaderHasType(noSubType), InvalidTarget::ReturnToHand(notObject))
- OP05-061 (TargetScope::OpponentCharacter)
- OP05-068 (Keyword::Active)
- OP05-074 (InvalidConditions::array)
- OP05-079 (InvalidConditions::array, InvalidTarget::PlayFromHand(notObject))
- OP05-080 (ConditionType::OncePerTurn)
- OP05-081 (InvalidConditions::array, InvalidTarget::ForceDiscard(notObject), InvalidTarget::PowerBoost(notObject))
- OP05-089 (InvalidConditions::array, MissingTarget::ReturnToHand, FilterKind::Character)
- OP05-092 (InvalidCondition::string, InvalidTarget::PowerBoost(notObject))
- OP05-094 (InvalidTarget::PowerBoost(notObject), InvalidTarget::Rest(notObject), Duration::UntilNextRefresh)
- OP05-097 (InvalidTarget::PowerBoost(notObject))
- OP05-098 (Trigger::OnLifeReachZero, InvalidConditions::array, InvalidTarget::PlayFromHand(notObject), InvalidTarget::ForceDiscard(notObject))
- OP05-100 (InvalidConditions::array)
- OP05-104 (InvalidConditions::array)
- OP05-105 (no suggestedDsl)
- OP05-106 (FilterKind::HasCardType, InvalidFilterCardType::"Sky Island")
- OP05-107 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP05-111 (no suggestedDsl)

## OP-06 — 74 cartes patchées

**critical (35):** OP06-002, OP06-003, OP06-006, OP06-009, OP06-018, OP06-025, OP06-030, OP06-038, OP06-043, OP06-047, OP06-052, OP06-054, OP06-058, OP06-062, OP06-063, OP06-064, OP06-071, OP06-072, OP06-077, OP06-078, OP06-079, OP06-080, OP06-081, OP06-087, OP06-088, OP06-089, OP06-090, OP06-091, OP06-092, OP06-096, OP06-098, OP06-104, OP06-111, OP06-112, OP06-114

**major (39):** OP06-001, OP06-011, OP06-016, OP06-019, OP06-020, OP06-021, OP06-022, OP06-024, OP06-028, OP06-033, OP06-034, OP06-035, OP06-036, OP06-039, OP06-040, OP06-041, OP06-046, OP06-051, OP06-057, OP06-059, OP06-061, OP06-065, OP06-066, OP06-067, OP06-073, OP06-075, OP06-082, OP06-085, OP06-095, OP06-097, OP06-100, OP06-101, OP06-107, OP06-110, OP06-113, OP06-115, OP06-116, OP06-117, OP06-119

**skipped — type inconnu (34):**
- OP06-010 (InvalidCondition::LeaderHasType(noSubType))
- OP06-012 (Keyword::CannotBeKOd, MissingTarget::GiveKeyword)
- OP06-013 (no suggestedDsl)
- OP06-014 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP06-015 (MissingTarget::KO)
- OP06-017 (InvalidConditions::array, TargetScope::ChooseOwnLeaderOrCharacter)
- OP06-023 (Duration::UntilEndOfOpponentNextTurn)
- OP06-026 (no suggestedDsl)
- OP06-029 (InvalidCondition::LeaderHasType(noSubType))
- OP06-031 (no suggestedDsl)
- OP06-032 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP06-042 (InvalidConditions::array)
- OP06-044 (InvalidTarget::ForceDiscard(notObject))
- OP06-045 (MissingTarget::ReturnToHand)
- OP06-048 (InvalidTarget::ForceDiscard(notObject))
- OP06-050 (FilterKind::Navy, InvalidTarget::PlayFromHand(notObject))
- OP06-053 (InvalidConditions::array, InvalidTarget::SearchDeck(notObject))
- OP06-055 (InvalidConditions::array, ActionType::PreventBlocker, InvalidTarget::PreventBlocker(notObject))
- OP06-056 (no suggestedDsl)
- OP06-060 (InvalidConditions::array)
- OP06-068 (InvalidConditions::array)
- OP06-069 (InvalidConditions::array)
- OP06-074 (no suggestedDsl)
- OP06-076 (InvalidConditions::array)
- OP06-083 (Keyword::EffectNegated)
- OP06-084 (no suggestedDsl)
- OP06-086 (no suggestedDsl)
- OP06-093 (ConditionType::HandCount, InvalidTarget::PowerBoost(notObject), Duration::DuringThisTurn)
- OP06-099 (InvalidConditions::array, InvalidTarget::FlipLife(notObject))
- OP06-102 (MissingTarget::AttachDon)
- OP06-103 (ActionType::AddToLifeDeck)
- OP06-106 (MissingTarget::AttachDon)
- OP06-109 (Keyword::Protected)
- OP06-118 (InvalidConditions::array, InvalidTarget::Rest(notObject), Keyword::Active, InvalidTarget::GiveKeyword(notObject))

## OP-07 — 83 cartes patchées

**critical (27):** OP07-013, OP07-017, OP07-021, OP07-022, OP07-031, OP07-037, OP07-038, OP07-048, OP07-052, OP07-053, OP07-055, OP07-059, OP07-060, OP07-065, OP07-069, OP07-071, OP07-074, OP07-078, OP07-080, OP07-093, OP07-095, OP07-096, OP07-101, OP07-105, OP07-109, OP07-111, OP07-114

**major (56):** OP07-002, OP07-003, OP07-004, OP07-005, OP07-006, OP07-009, OP07-010, OP07-011, OP07-012, OP07-014, OP07-018, OP07-019, OP07-020, OP07-023, OP07-024, OP07-025, OP07-029, OP07-030, OP07-032, OP07-034, OP07-036, OP07-040, OP07-043, OP07-045, OP07-046, OP07-047, OP07-049, OP07-050, OP07-054, OP07-058, OP07-061, OP07-062, OP07-063, OP07-066, OP07-070, OP07-072, OP07-073, OP07-075, OP07-076, OP07-079, OP07-081, OP07-082, OP07-083, OP07-086, OP07-087, OP07-090, OP07-091, OP07-092, OP07-094, OP07-097, OP07-100, OP07-110, OP07-112, OP07-115, OP07-116, OP07-119

**skipped — type inconnu (24):**
- OP07-008 (no suggestedDsl)
- OP07-015 (TargetScope::ChooseOneOwnCharacterOrLeader)
- OP07-026 (InvalidCondition::string, InvalidTarget::Rest(notObject), Duration::UntilNextOpponentRefresh)
- OP07-033 (ActionType::Prevention, InvalidTarget::Prevention(notObject))
- OP07-035 (InvalidConditions::array)
- OP07-039 (InvalidConditions::array)
- OP07-041 (FilterKind::Or)
- OP07-042 (InvalidConditions::array, InvalidTarget::ReturnToHand(notObject))
- OP07-051 (no suggestedDsl)
- OP07-056 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP07-057 (InvalidConditions::array, Keyword::OpponentCannotActivateBlocker, MissingTarget::GiveKeyword)
- OP07-064 (InvalidTarget::PowerBoost(notObject), InvalidTarget::Rest(notObject))
- OP07-068 (MissingTarget::AttachDon)
- OP07-077 (InvalidCondition::LeaderHasAnyType(noSubTypes), FilterKind::HasAnyType, FilterKind::Remaining)
- OP07-084 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP07-085 (TargetScope::OpponentCharacters)
- OP07-088 (InvalidConditions::array)
- OP07-098 (Keyword::CannotBeKO'd, MissingTarget::GiveKeyword)
- OP07-103 (no suggestedDsl)
- OP07-104 (no suggestedDsl)
- OP07-106 (ConditionType::LeaderHasRestingDon)
- OP07-107 (no suggestedDsl)
- OP07-117 (InvalidConditions::array, InvalidTarget::Rest(noScope))
- OP07-118 (TargetScope::OpponentCharacter)

## OP-08 — 74 cartes patchées

**critical (22):** OP08-003, OP08-015, OP08-023, OP08-032, OP08-037, OP08-038, OP08-039, OP08-055, OP08-059, OP08-062, OP08-067, OP08-072, OP08-074, OP08-090, OP08-095, OP08-097, OP08-100, OP08-101, OP08-109, OP08-110, OP08-115, OP08-117

**major (52):** OP08-001, OP08-002, OP08-004, OP08-005, OP08-008, OP08-010, OP08-013, OP08-016, OP08-017, OP08-018, OP08-019, OP08-020, OP08-021, OP08-028, OP08-030, OP08-033, OP08-040, OP08-042, OP08-044, OP08-047, OP08-050, OP08-051, OP08-052, OP08-057, OP08-058, OP08-060, OP08-061, OP08-066, OP08-068, OP08-070, OP08-071, OP08-073, OP08-076, OP08-077, OP08-080, OP08-081, OP08-084, OP08-085, OP08-086, OP08-087, OP08-088, OP08-092, OP08-094, OP08-098, OP08-102, OP08-103, OP08-106, OP08-107, OP08-112, OP08-113, OP08-116, OP08-118

**skipped — type inconnu (34):**
- OP08-006 (InvalidConditions::array, MissingTarget::PowerBoost)
- OP08-007 (InvalidConditions::array)
- OP08-012 (InvalidConditions::array)
- OP08-014 (TargetScope::OpponentCharacter)
- OP08-022 (no suggestedDsl)
- OP08-024 (InvalidConditions::array, ActionType::PreventActivation, InvalidTarget::PreventActivation(notObject), Duration::UntilOpponentNextRefreshPhase)
- OP08-025 (InvalidConditions::array, InvalidTarget::Rest(notObject), Duration::DuringOpponentNextRefreshPhase)
- OP08-026 (InvalidConditions::array, Keyword::CannotBeActivated)
- OP08-029 (Trigger::Permanent, InvalidConditions::array, Keyword::CannotBeKOdByEffects, MissingTarget::GiveKeyword)
- OP08-031 (Keyword::Active)
- OP08-034 (ActionType::ArrangeBottomOfDeck)
- OP08-036 (InvalidConditions::array, ActionType::PreventActive)
- OP08-041 (no suggestedDsl)
- OP08-043 (no suggestedDsl)
- OP08-045 (InvalidConditions::array)
- OP08-046 (TargetScope::Opponent)
- OP08-049 (ActionType::PlaceOnDeck)
- OP08-053 (InvalidCondition::LeaderHasAnyType(noSubTypes))
- OP08-054 (ActionType::PlaceOnDeck)
- OP08-056 (InvalidCondition::LeaderHasType(noSubType))
- OP08-063 (InvalidConditions::array)
- OP08-064 (InvalidConditions::array)
- OP08-069 (ActionType::AddToOpponentLife)
- OP08-075 (TargetScope::AllYourLifeCards)
- OP08-079 (TargetScope::Opponent)
- OP08-082 (InvalidConditions::array, InvalidTarget::Rest(notObject), InvalidTarget::PowerBoost(notObject))
- OP08-083 (ActionType::GiveCostReduction)
- OP08-091 (InvalidConditions::array)
- OP08-093 (no suggestedDsl)
- OP08-096 (Duration::DuringBattle)
- OP08-105 (InvalidConditions::array)
- OP08-111 (InvalidConditions::array, Keyword::BlockerLock, InvalidTarget::GiveKeyword(notObject))
- OP08-114 (no suggestedDsl)
- OP08-119 (InvalidTarget::RemoveLife(notObject))

## OP-09 — 72 cartes patchées

**critical (33):** OP09-012, OP09-017, OP09-020, OP09-025, OP09-028, OP09-031, OP09-034, OP09-037, OP09-039, OP09-040, OP09-041, OP09-051, OP09-053, OP09-056, OP09-057, OP09-059, OP09-068, OP09-069, OP09-074, OP09-075, OP09-080, OP09-084, OP09-085, OP09-086, OP09-091, OP09-093, OP09-095, OP09-100, OP09-101, OP09-104, OP09-106, OP09-107, OP09-115

**major (39):** OP09-002, OP09-003, OP09-005, OP09-008, OP09-011, OP09-013, OP09-019, OP09-021, OP09-022, OP09-024, OP09-026, OP09-027, OP09-029, OP09-030, OP09-035, OP09-036, OP09-042, OP09-043, OP09-046, OP09-048, OP09-052, OP09-058, OP09-060, OP09-062, OP09-065, OP09-066, OP09-077, OP09-078, OP09-079, OP09-083, OP09-088, OP09-089, OP09-090, OP09-092, OP09-099, OP09-103, OP09-110, OP09-118, OP09-119

**skipped — type inconnu (32):**
- OP09-001 (InvalidConditions::array)
- OP09-007 (InvalidConditions::array)
- OP09-009 (TargetScope::OpponentCharacter)
- OP09-014 (InvalidConditions::array, Keyword::CannotActivate, InvalidTarget::GiveKeyword(notObject))
- OP09-018 (InvalidConditions::array, InvalidTarget::KO(notObject))
- OP09-023 (TargetScope::ChooseOwnLeaderOrCharacter)
- OP09-032 (InvalidConditions::array)
- OP09-033 (InvalidConditions::array, Keyword::CantBeKOdByEffects, MissingTarget::GiveKeyword)
- OP09-044 (FilterKind::Or)
- OP09-045 (InvalidConditions::array, Keyword::CannotBeKOdInBattle, MissingTarget::GiveKeyword)
- OP09-050 (ActionType::OrderDeckCards)
- OP09-054 (InvalidCondition::string, InvalidTarget::Rest(notObject))
- OP09-061 (InvalidConditions::array)
- OP09-064 (Keyword::Active)
- OP09-070 (InvalidConditions::array, MissingTarget::ReturnToHand, InvalidFilterCardType::"Don", InvalidTarget::GiveDon(notObject))
- OP09-071 (InvalidCondition::string, InvalidTarget::Rest(notObject))
- OP09-072 (InvalidConditions::array, MissingTarget::AttachDon)
- OP09-073 (MissingTarget::ReturnToHand)
- OP09-076 (InvalidConditions::array, TargetScope::Field, TargetScope::DeckZone)
- OP09-081 (Keyword::NegateOnPlay, InvalidTarget::GiveKeyword(notObject))
- OP09-082 (no suggestedDsl)
- OP09-087 (ConditionType::HasCardInHand)
- OP09-096 (FilterKind::ByCardType, InvalidFilterCardType::"Blackbeard Pirates")
- OP09-097 (no suggestedDsl)
- OP09-098 (no suggestedDsl)
- OP09-102 (InvalidCondition::LeaderIsName(noName), FilterKind::HasKeyword)
- OP09-109 (no suggestedDsl)
- OP09-111 (no suggestedDsl)
- OP09-112 (ConditionType::LifeCount)
- OP09-114 (ConditionType::Custom)
- OP09-116 (TargetScope::OwnLeaderOrCharacter)
- OP09-117 (InvalidConditions::array)

## OP-10 — 80 cartes patchées

**critical (38):** OP10-001, OP10-006, OP10-027, OP10-028, OP10-030, OP10-034, OP10-037, OP10-039, OP10-041, OP10-042, OP10-051, OP10-052, OP10-056, OP10-058, OP10-059, OP10-062, OP10-063, OP10-064, OP10-065, OP10-071, OP10-075, OP10-080, OP10-082, OP10-087, OP10-091, OP10-097, OP10-098, OP10-099, OP10-100, OP10-104, OP10-106, OP10-107, OP10-110, OP10-111, OP10-115, OP10-116, OP10-117, OP10-118

**major (42):** OP10-002, OP10-005, OP10-008, OP10-009, OP10-010, OP10-011, OP10-015, OP10-016, OP10-017, OP10-018, OP10-020, OP10-021, OP10-023, OP10-024, OP10-025, OP10-026, OP10-035, OP10-040, OP10-044, OP10-045, OP10-047, OP10-055, OP10-060, OP10-061, OP10-066, OP10-069, OP10-070, OP10-077, OP10-079, OP10-081, OP10-083, OP10-085, OP10-086, OP10-088, OP10-090, OP10-092, OP10-094, OP10-095, OP10-096, OP10-102, OP10-103, OP10-114

**skipped — type inconnu (27):**
- OP10-003 (MissingTarget::AttachDon)
- OP10-004 (FilterKind::CardType, ActionType::ArrangeBottom)
- OP10-012 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP10-019 (TargetScope::OwnCharacter)
- OP10-022 (ConditionType::And)
- OP10-029 (ConditionType::HasRestingCharacters, ActionType::Unrest)
- OP10-032 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP10-033 (InvalidConditions::array, ActionType::Custom)
- OP10-036 (InvalidConditions::array, InvalidTarget::GiveDon(notObject))
- OP10-038 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP10-043 (MissingTarget::Rest, TargetScope::YourCharacters)
- OP10-046 (TargetScope::ChooseCharacter)
- OP10-048 (InvalidConditions::array)
- OP10-049 (InvalidConditions::array, InvalidTarget::ReturnToHand(notObject))
- OP10-053 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP10-057 (InvalidCondition::LeaderIsName(noName))
- OP10-067 (FilterKind::ByCardType, InvalidTarget::Rest(notObject))
- OP10-072 (MissingTarget::Rest, InvalidFilterCardType::"DON!!")
- OP10-074 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP10-076 (InvalidConditions::array)
- OP10-078 (FilterKind::CardType, FilterKind::Remaining)
- OP10-093 (ActionType::TrashFromPlay)
- OP10-108 (InvalidConditions::array, InvalidTarget::GiveKeyword(notObject))
- OP10-109 (InvalidTarget::ForceDiscard(notObject))
- OP10-112 (TargetScope::Opponent, InvalidCondition::LeaderHasAnyType(noSubTypes))
- OP10-113 (ConditionType::Custom, InvalidTarget::GiveKeyword(notObject))
- OP10-119 (TargetScope::ChooseOwnLeader)

## OP-11 — 66 cartes patchées

**critical (27):** OP11-001, OP11-021, OP11-022, OP11-023, OP11-027, OP11-030, OP11-035, OP11-036, OP11-037, OP11-040, OP11-046, OP11-047, OP11-048, OP11-057, OP11-059, OP11-060, OP11-067, OP11-069, OP11-070, OP11-081, OP11-082, OP11-097, OP11-098, OP11-099, OP11-104, OP11-110, OP11-115

**major (39):** OP11-002, OP11-006, OP11-007, OP11-008, OP11-010, OP11-016, OP11-018, OP11-019, OP11-020, OP11-024, OP11-029, OP11-034, OP11-038, OP11-039, OP11-042, OP11-044, OP11-050, OP11-051, OP11-054, OP11-056, OP11-062, OP11-063, OP11-065, OP11-071, OP11-072, OP11-074, OP11-083, OP11-086, OP11-088, OP11-095, OP11-096, OP11-100, OP11-103, OP11-106, OP11-107, OP11-108, OP11-112, OP11-117, OP11-118

**skipped — type inconnu (31):**
- OP11-004 (InvalidCondition::string)
- OP11-005 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP11-009 (Duration::UntilEndOfOpponentNextTurn)
- OP11-012 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP11-013 (InvalidConditions::array, Keyword::CannotActivateBlocker, InvalidTarget::GiveKeyword(notObject))
- OP11-014 (Keyword::AttackActiveCharacters)
- OP11-025 (TargetScope::ChooseOwnDon, TargetScope::ThisCharacter, Duration::DuringBattle)
- OP11-028 (no suggestedDsl)
- OP11-031 (Keyword::CanAttackCharacters)
- OP11-041 (Trigger::OnLifeRemoved, ConditionType::HandCount)
- OP11-043 (ConditionType::Custom)
- OP11-049 (no suggestedDsl)
- OP11-058 (InvalidCondition::string, InvalidTarget::Rest(notObject))
- OP11-061 (InvalidConditions::array, MissingTarget::ReturnToHand)
- OP11-066 (InvalidConditions::array)
- OP11-073 (no suggestedDsl)
- OP11-075 (InvalidCondition::LeaderIsName(noName))
- OP11-076 (InvalidCondition::LeaderHasType(noSubType))
- OP11-077 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP11-079 (InvalidConditions::array, TargetScope::ChooseUpToOneOwnCharacterOrLeader, Duration::DuringBattle)
- OP11-080 (InvalidConditions::array, MissingTarget::AttachDon)
- OP11-084 (Keyword::CanAttackActive)
- OP11-085 (MissingTarget::ReturnToHand)
- OP11-090 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP11-091 (InvalidConditions::array, InvalidTarget::SearchDeck(notObject))
- OP11-092 (InvalidCondition::string, InvalidTarget::ReturnToHand(notObject))
- OP11-101 (InvalidConditions::array, InvalidTarget::FlipLife(notObject))
- OP11-102 (InvalidConditions::array, ActionType::TrashFromTop, InvalidTarget::TrashFromTop(notObject))
- OP11-114 (ConditionType::And)
- OP11-116 (InvalidConditions::array, InvalidTarget::SearchDeck(notObject))
- OP11-119 (Keyword::CanAttackActiveCharacters)

## OP-12 — 69 cartes patchées

**critical (23):** OP12-017, OP12-030, OP12-034, OP12-042, OP12-043, OP12-047, OP12-061, OP12-063, OP12-065, OP12-070, OP12-079, OP12-080, OP12-084, OP12-086, OP12-090, OP12-091, OP12-094, OP12-097, OP12-098, OP12-100, OP12-102, OP12-106, OP12-113

**major (46):** OP12-001, OP12-003, OP12-004, OP12-006, OP12-007, OP12-008, OP12-009, OP12-012, OP12-013, OP12-015, OP12-018, OP12-019, OP12-024, OP12-026, OP12-028, OP12-029, OP12-031, OP12-037, OP12-038, OP12-041, OP12-044, OP12-046, OP12-053, OP12-054, OP12-056, OP12-057, OP12-059, OP12-060, OP12-062, OP12-071, OP12-072, OP12-073, OP12-078, OP12-081, OP12-085, OP12-089, OP12-093, OP12-095, OP12-101, OP12-105, OP12-107, OP12-108, OP12-112, OP12-115, OP12-118, OP12-119

**skipped — type inconnu (25):**
- OP12-014 (FilterKind::Or)
- OP12-016 (Keyword::BlockerCantActivate)
- OP12-020 (Keyword::Active, Keyword::CannotAttackCostLessOrEqual7)
- OP12-021 (InvalidConditions::array, Keyword::CannotBeRestedByOpponentEffects, MissingTarget::GiveKeyword)
- OP12-022 (no suggestedDsl)
- OP12-027 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP12-036 (InvalidCondition::LeaderHasType(noSubType), Keyword::CannotBeKOedBySlashAttributes)
- OP12-039 (ActionType::ActivateLeader)
- OP12-040 (InvalidConditions::array)
- OP12-048 (InvalidConditions::array, InvalidTarget::Rest(notObject), InvalidTarget::ForceDiscard(notObject))
- OP12-050 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP12-051 (ActionType::DisableKeyword)
- OP12-058 (InvalidCondition::LeaderHasType(noSubType), ActionType::PlayFromDeck, InvalidTarget::PlayFromDeck(notObject))
- OP12-066 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP12-069 (InvalidCondition::LeaderHasType(noSubType))
- OP12-074 (InvalidConditions::array, MissingTarget::AttachDon)
- OP12-075 (TargetScope::Opponent)
- OP12-077 (InvalidConditions::array, Keyword::BlockerCannotActivate, TargetScope::OpponentHand)
- OP12-087 (InvalidConditions::array, MissingTarget::GiveKeyword, MissingTarget::PowerBoost)
- OP12-096 (InvalidConditions::array)
- OP12-099 (InvalidCondition::string, Keyword::CannotDrawCards, MissingTarget::GiveKeyword)
- OP12-104 (no suggestedDsl)
- OP12-109 (no suggestedDsl)
- OP12-116 (FilterKind::Or)
- OP12-117 (no suggestedDsl)

## OP-13 — 73 cartes patchées

**critical (22):** OP13-001, OP13-004, OP13-008, OP13-016, OP13-047, OP13-053, OP13-065, OP13-066, OP13-078, OP13-081, OP13-082, OP13-083, OP13-086, OP13-087, OP13-092, OP13-099, OP13-102, OP13-109, OP13-112, OP13-113, OP13-115, OP13-117

**major (51):** OP13-002, OP13-003, OP13-015, OP13-019, OP13-020, OP13-021, OP13-022, OP13-026, OP13-027, OP13-031, OP13-033, OP13-034, OP13-038, OP13-039, OP13-042, OP13-043, OP13-044, OP13-046, OP13-050, OP13-051, OP13-052, OP13-054, OP13-055, OP13-056, OP13-057, OP13-058, OP13-061, OP13-063, OP13-064, OP13-067, OP13-068, OP13-069, OP13-071, OP13-072, OP13-075, OP13-076, OP13-079, OP13-080, OP13-091, OP13-093, OP13-094, OP13-095, OP13-098, OP13-100, OP13-104, OP13-106, OP13-110, OP13-114, OP13-116, OP13-118, OP13-120

**skipped — type inconnu (26):**
- OP13-005 (InvalidConditions::array)
- OP13-007 (InvalidConditions::array, TargetScope::ChooseOwnLeaderOrCharacter)
- OP13-009 (InvalidConditions::array, Keyword::Double Attack, InvalidTarget::GiveKeyword(notObject))
- OP13-012 (FilterKind::ByTypeAndCost)
- OP13-017 (InvalidConditions::array, MissingTarget::PowerBoost)
- OP13-023 (MissingTarget::AttachDon, InvalidConditions::array, Keyword::CannotPlayCharacterCost5Plus, MissingTarget::GiveKeyword)
- OP13-024 (MissingTarget::Rest)
- OP13-025 (InvalidCondition::LeaderHasAnyType(noSubTypes), MissingTarget::AttachDon)
- OP13-028 (InvalidConditions::array, InvalidTarget::Rest(notObject), ActionType::AddRestriction)
- OP13-030 (InvalidConditions::array, ActionType::ActivateDon)
- OP13-032 (Keyword::CannotBeRested, Duration::UntilEndOfOpponentNextTurn)
- OP13-035 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP13-037 (InvalidCondition::LeaderHasAnyType(noSubTypes), TargetScope::YourField, Keyword::Active)
- OP13-040 (InvalidConditions::array, TargetScope::OwnDonCards, Keyword::CannotActivateNextRefresh, Duration::UntilNextOpponentRefresh)
- OP13-045 (ConditionType::HandCount)
- OP13-059 (InvalidConditions::array)
- OP13-060 (InvalidConditions::array)
- OP13-062 (FilterKind::DonCard, TargetScope::OpponentCharacter)
- OP13-077 (InvalidConditions::array, TargetScope::OwnDonCards, Duration::DuringBattle)
- OP13-084 (Trigger::Permanent, InvalidConditions::array, Keyword::CannotBeRemovedByOpponentEffects, InvalidTarget::GiveKeyword(notObject), InvalidTarget::PowerBoost(notObject))
- OP13-089 (Trigger::Always, InvalidConditions::array, MissingTarget::GiveKeyword, Keyword::CannotBeRemovedByOpponentEffects)
- OP13-096 (InvalidFilterCardType::"Celestial Dragons", InvalidTarget::ForceDiscard(notObject))
- OP13-097 (ConditionType::OnlyCharacterType)
- OP13-105 (InvalidConditions::array, ActionType::ArrangeLiveCards)
- OP13-108 (InvalidCondition::LeaderHasType(noSubType), TargetScope::Opponent)
- OP13-119 (TargetScope::OpponentHand)

## OP-14 — 86 cartes patchées

**critical (39):** OP14-002, OP14-003, OP14-009, OP14-017, OP14-019, OP14-020, OP14-021, OP14-023, OP14-027, OP14-029, OP14-034, OP14-036, OP14-041, OP14-044, OP14-045, OP14-047, OP14-048, OP14-059, OP14-060, OP14-061, OP14-065, OP14-070, OP14-071, OP14-074, OP14-082, OP14-086, OP14-092, OP14-097, OP14-099, OP14-100, OP14-103, OP14-104, OP14-107, OP14-110, OP14-112, OP14-113, OP14-114, OP14-115, OP14-118

**major (47):** OP14-004, OP14-005, OP14-006, OP14-011, OP14-012, OP14-013, OP14-014, OP14-018, OP14-025, OP14-031, OP14-037, OP14-038, OP14-039, OP14-040, OP14-042, OP14-043, OP14-046, OP14-049, OP14-050, OP14-051, OP14-052, OP14-054, OP14-057, OP14-062, OP14-063, OP14-064, OP14-067, OP14-069, OP14-075, OP14-077, OP14-078, OP14-079, OP14-080, OP14-081, OP14-083, OP14-084, OP14-085, OP14-087, OP14-088, OP14-091, OP14-093, OP14-094, OP14-105, OP14-108, OP14-111, OP14-116, OP14-120

**skipped — type inconnu (24):**
- OP14-001 (InvalidCondition::string, ActionType::SelectTarget, ActionType::PowerSwap)
- OP14-010 (ActionType::ViewDeck, ActionType::PlaceAtBottom)
- OP14-015 (Duration::DuringTurn)
- OP14-016 (TargetScope::YourLeader, TargetScope::OpponentCharacter)
- OP14-022 (InvalidCondition::LeaderHasAnyType(noSubTypes), InvalidTarget::Rest(notObject))
- OP14-024 (ActionType::ActivateDon, TargetScope::YourDONCards, Keyword::CannotPlayCharacters, MissingTarget::GiveKeyword, TargetScope::ChooseOpponentCard)
- OP14-026 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP14-028 (Trigger::OnRest, InvalidConditions::array, InvalidTarget::KO(notObject))
- OP14-032 (Trigger::OnRest, InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP14-033 (Keyword::CannotRest, Duration::UntilEndOfOpponentNextEndPhase)
- OP14-035 (Trigger::OnRest, InvalidConditions::array, InvalidTarget::Rest(notObject))
- OP14-053 (InvalidTarget::PowerBoost(notObject))
- OP14-056 (InvalidCondition::string, Keyword::EffectNegated, InvalidTarget::GiveKeyword(notObject))
- OP14-058 (Duration::DuringBattle)
- OP14-068 (InvalidCondition::LeaderHasType(noSubType))
- OP14-072 (FilterKind::DON)
- OP14-076 (InvalidCondition::LeaderHasType(noSubType), MissingTarget::AttachDon)
- OP14-090 (Keyword::CanAttackCharactersOnPlayTurn, MissingTarget::GiveKeyword)
- OP14-096 (TargetScope::OwnDonCards, TargetScope::OpponentCharacters)
- OP14-098 (Keyword::+3cost)
- OP14-102 (no suggestedDsl)
- OP14-106 (no suggestedDsl)
- OP14-109 (no suggestedDsl)
- OP14-119 (Trigger::OnRest, ActionType::PreventRest)

## OP-15 — 74 cartes patchées

**critical (19):** OP15-001, OP15-003, OP15-008, OP15-019, OP15-020, OP15-033, OP15-040, OP15-059, OP15-071, OP15-072, OP15-079, OP15-080, OP15-090, OP15-092, OP15-098, OP15-101, OP15-104, OP15-110, OP15-118

**major (55):** OP15-004, OP15-006, OP15-010, OP15-011, OP15-014, OP15-015, OP15-017, OP15-021, OP15-024, OP15-027, OP15-028, OP15-032, OP15-034, OP15-036, OP15-039, OP15-041, OP15-042, OP15-044, OP15-046, OP15-047, OP15-048, OP15-053, OP15-054, OP15-055, OP15-056, OP15-057, OP15-058, OP15-060, OP15-061, OP15-063, OP15-064, OP15-066, OP15-067, OP15-070, OP15-073, OP15-075, OP15-078, OP15-083, OP15-084, OP15-086, OP15-087, OP15-095, OP15-097, OP15-099, OP15-100, OP15-102, OP15-108, OP15-109, OP15-111, OP15-112, OP15-113, OP15-114, OP15-115, OP15-116, OP15-117

**skipped — type inconnu (35):**
- OP15-002 (InvalidConditions::array)
- OP15-005 (InvalidConditions::array, MissingTarget::PowerBoost)
- OP15-007 (InvalidCondition::LeaderHasType(noSubType))
- OP15-009 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- OP15-012 (InvalidConditions::array)
- OP15-013 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject), InvalidTarget::GiveKeyword(notObject))
- OP15-018 (InvalidConditions::array)
- OP15-022 (InvalidConditions::array)
- OP15-023 (no suggestedDsl)
- OP15-025 (InvalidConditions::array, ActionType::PreventActive)
- OP15-026 (InvalidConditions::array)
- OP15-029 (Keyword::CannotRest, Duration::UntilEndOfOpponentNextTurn)
- OP15-031 (InvalidConditions::array, InvalidTarget::KO(notObject))
- OP15-035 (InvalidConditions::array, MissingTarget::Rest)
- OP15-037 (no suggestedDsl)
- OP15-038 (InvalidConditions::array, ActionType::PreventActivation, Duration::UntilNextRefreshPhase)
- OP15-051 (InvalidCondition::LeaderHasType(noSubType))
- OP15-052 (InvalidTarget::ReturnToHand(notObject))
- OP15-065 (InvalidTarget::Rest(notObject))
- OP15-068 (InvalidConditions::array, MissingTarget::GiveKeyword)
- OP15-069 (InvalidConditions::array, InvalidTarget::AttachDon(notObject))
- OP15-074 (Keyword::CostModifier)
- OP15-076 (Duration::DuringBattle)
- OP15-077 (no suggestedDsl)
- OP15-081 (InvalidCondition::LeaderHasType(noSubType))
- OP15-082 (TargetScope::OwnTrash)
- OP15-085 (InvalidCondition::LeaderHasType(noSubType), MissingTarget::ReturnToHand)
- OP15-088 (Trigger::Permanent, MissingTarget::PowerBoost)
- OP15-091 (InvalidConditions::array, InvalidTarget::ReturnToHand(notObject))
- OP15-093 (Keyword::Slash)
- OP15-094 (InvalidConditions::array, InvalidTarget::KO(notObject), InvalidTarget::GiveKeyword(notObject))
- OP15-096 (InvalidCondition::LeaderHasType(noSubType))
- OP15-105 (InvalidConditions::array, InvalidTarget::FlipLife(notObject))
- OP15-106 (no suggestedDsl)
- OP15-119 (no suggestedDsl)

## P — 5 cartes patchées

**critical (1):** P-074

**major (4):** P-044, P-073, P-075, P-084

## PRB-01 — 1 cartes patchées

**major (1):** PRB01-001

## PRB-02 — 9 cartes patchées

**critical (1):** PRB02-016

**major (8):** PRB02-001, PRB02-003, PRB02-004, PRB02-010, PRB02-011, PRB02-013, PRB02-015, PRB02-018

**skipped — type inconnu (8):**
- PRB02-002 (InvalidConditions::array)
- PRB02-005 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- PRB02-006 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- PRB02-007 (FilterKind::NamedType, TargetScope::ChooseCharacter)
- PRB02-009 (InvalidConditions::array, InvalidTarget::TrashFromHand(notObject))
- PRB02-012 (ActionType::ReorderDeck)
- PRB02-014 (InvalidTarget::PowerBoost(notObject), InvalidTarget::Rest(notObject))
- PRB02-017 (Keyword::CannotAttack)

## ST-01 — 6 cartes patchées

**critical (2):** ST01-006, ST01-016

**major (4):** ST01-004, ST01-013, ST01-014, ST01-017

**skipped — type inconnu (3):**
- ST01-002 (InvalidConditions::array, ActionType::PreventAction, InvalidTarget::PreventAction(notObject))
- ST01-005 (TargetScope::ChooseOwnCharacterOrLeaderExcludingSelf)
- ST01-012 (no suggestedDsl)

## ST-02 — 12 cartes patchées

**critical (5):** ST02-004, ST02-007, ST02-010, ST02-013, ST02-017

**major (7):** ST02-001, ST02-003, ST02-005, ST02-008, ST02-009, ST02-014, ST02-015

**skipped — type inconnu (1):**
- ST02-016 (TargetScope::ChooseOwnCharacterOrLeaderUpTo1, TargetScope::ChooseOwnDonCardsUpTo1)

## ST-03 — 9 cartes patchées

**critical (3):** ST03-004, ST03-010, ST03-013

**major (6):** ST03-001, ST03-005, ST03-007, ST03-015, ST03-016, ST03-017

**skipped — type inconnu (4):**
- ST03-003 (TargetScope::ChooseCharacter)
- ST03-008 (InvalidConditions::array, MissingTarget::GiveKeyword)
- ST03-009 (TargetScope::ChooseCharacter)
- ST03-014 (TargetScope::ChooseCharacter)

## ST-04 — 11 cartes patchées

**critical (2):** ST04-005, ST04-011

**major (9):** ST04-001, ST04-002, ST04-003, ST04-004, ST04-006, ST04-008, ST04-010, ST04-014, ST04-017

**skipped — type inconnu (1):**
- ST04-015 (TargetScope::OpponentCharacter, TargetScope::DON!!Deck, MissingTarget::AttachDon)

## ST-05 — 10 cartes patchées

**critical (4):** ST05-003, ST05-008, ST05-014, ST05-017

**major (6):** ST05-001, ST05-002, ST05-004, ST05-006, ST05-010, ST05-016

**skipped — type inconnu (3):**
- ST05-005 (InvalidConditions::array)
- ST05-009 (no suggestedDsl)
- ST05-011 (InvalidConditions::array)

## ST-06 — 11 cartes patchées

**critical (3):** ST06-005, ST06-007, ST06-016

**major (8):** ST06-001, ST06-002, ST06-004, ST06-006, ST06-008, ST06-012, ST06-014, ST06-015

**skipped — type inconnu (2):**
- ST06-010 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))
- ST06-017 (Duration::DuringTurn, ConditionType::Navy)

## ST-07 — 8 cartes patchées

**critical (6):** ST07-003, ST07-004, ST07-007, ST07-009, ST07-010, ST07-016

**major (2):** ST07-001, ST07-013

**skipped — type inconnu (5):**
- ST07-005 (ActionType::AddToLife)
- ST07-008 (InvalidConditions::array, InvalidTarget::SearchDeck(notObject))
- ST07-011 (InvalidConditions::array)
- ST07-015 (InvalidTarget::ForceDiscard(notObject))
- ST07-017 (no suggestedDsl)

## ST-08 — 8 cartes patchées

**critical (1):** ST08-015

**major (7):** ST08-001, ST08-002, ST08-005, ST08-006, ST08-008, ST08-009, ST08-014

**skipped — type inconnu (3):**
- ST08-004 (InvalidConditions::array)
- ST08-007 (MissingTarget::Rest)
- ST08-013 (TargetScope::BattledOpponentCharacter)

## ST-09 — 6 cartes patchées

**critical (2):** ST09-010, ST09-014

**major (4):** ST09-005, ST09-007, ST09-008, ST09-012

**skipped — type inconnu (5):**
- ST09-001 (ConditionType::HasLife)
- ST09-002 (no suggestedDsl)
- ST09-004 (InvalidCondition::noType, Keyword::CantBeKO, Duration::DuringBattle)
- ST09-009 (no suggestedDsl)
- ST09-015 (TargetScope::ChooseUpToOneOwnCharacterOrLeader, InvalidConditions::array, ActionType::AttachToLife, TargetScope::ChooseUpToOneOpponentCharacter)

## ST-10 — 14 cartes patchées

**critical (3):** ST10-002, ST10-003, ST10-016

**major (11):** ST10-001, ST10-004, ST10-005, ST10-006, ST10-007, ST10-008, ST10-010, ST10-012, ST10-013, ST10-014, ST10-015

**skipped — type inconnu (3):**
- ST10-009 (InvalidConditions::array, MissingTarget::AttachDon)
- ST10-011 (InvalidCondition::string, InvalidTarget::PowerBoost(notObject))
- ST10-017 (InvalidTarget::SearchDeck(noScope), MissingTarget::AttachDon)

## ST-11 — 4 cartes patchées

**critical (2):** ST11-004, ST11-005

**major (2):** ST11-002, ST11-003

**skipped — type inconnu (1):**
- ST11-001 (MissingTarget::PlaceAtBottomOfDeck)

## ST-12 — 9 cartes patchées

**critical (3):** ST12-001, ST12-014, ST12-017

**major (6):** ST12-002, ST12-003, ST12-006, ST12-008, ST12-010, ST12-011

**skipped — type inconnu (2):**
- ST12-007 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- ST12-013 (InvalidConditions::array)

## ST-13 — 12 cartes patchées

**critical (3):** ST13-009, ST13-012, ST13-019

**major (9):** ST13-001, ST13-005, ST13-006, ST13-008, ST13-011, ST13-013, ST13-015, ST13-017, ST13-018

**skipped — type inconnu (7):**
- ST13-002 (FilterKind::Character)
- ST13-003 (ActionType::AddToLifeCards)
- ST13-004 (no suggestedDsl)
- ST13-007 (no suggestedDsl)
- ST13-010 (ActionType::RevealFromLife)
- ST13-014 (InvalidTarget::PowerBoost(notObject))
- ST13-016 (no suggestedDsl)

## ST-14 — 12 cartes patchées

**critical (4):** ST14-001, ST14-014, ST14-015, ST14-016

**major (8):** ST14-003, ST14-004, ST14-006, ST14-007, ST14-008, ST14-011, ST14-012, ST14-017

**skipped — type inconnu (2):**
- ST14-002 (TargetScope::OpponentCharacter)
- ST14-009 (Keyword::CannnotBeKOByOpponentEffects)

## ST-15 — 3 cartes patchées

**critical (1):** ST15-005

**major (2):** ST15-002, ST15-003

**skipped — type inconnu (2):**
- ST15-001 (InvalidConditions::array, Keyword::CannotFlipLife, MissingTarget::GiveKeyword)
- ST15-004 (InvalidCondition::LeaderHasType(noSubType), TargetScope::OpponentCharacter)

## ST-16 — 4 cartes patchées

**major (4):** ST16-001, ST16-002, ST16-004, ST16-005

**skipped — type inconnu (1):**
- ST16-003 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject))

## ST-17 — 3 cartes patchées

**critical (2):** ST17-001, ST17-004

**major (1):** ST17-002

**skipped — type inconnu (2):**
- ST17-003 (InvalidConditions::array)
- ST17-005 (no suggestedDsl)

## ST-18 — 4 cartes patchées

**critical (1):** ST18-004

**major (3):** ST18-001, ST18-002, ST18-003

## ST-19 — 4 cartes patchées

**critical (1):** ST19-004

**major (3):** ST19-001, ST19-002, ST19-003

**skipped — type inconnu (1):**
- ST19-005 (InvalidConditions::array)

## ST-20 — 3 cartes patchées

**critical (2):** ST20-002, ST20-004

**major (1):** ST20-001

**skipped — type inconnu (2):**
- ST20-003 (no suggestedDsl)
- ST20-005 (ActionType::OpponentChooses)

## ST-21 — 9 cartes patchées

**critical (1):** ST21-011

**major (8):** ST21-001, ST21-002, ST21-004, ST21-009, ST21-012, ST21-014, ST21-015, ST21-017

**skipped — type inconnu (3):**
- ST21-003 (Keyword::CannotBeBlocked, InvalidTarget::GiveKeyword(noScope))
- ST21-007 (InvalidTarget::GiveKeyword(noScope))
- ST21-016 (ActionType::RemoveKeyword)

## ST-22 — 11 cartes patchées

**critical (7):** ST22-002, ST22-003, ST22-005, ST22-006, ST22-007, ST22-009, ST22-012

**major (4):** ST22-011, ST22-015, ST22-016, ST22-017

**skipped — type inconnu (1):**
- ST22-001 (InvalidConditions::array, InvalidTarget::SearchDeck(notObject))

## ST-23 — 3 cartes patchées

**major (3):** ST23-002, ST23-003, ST23-004

**skipped — type inconnu (1):**
- ST23-001 (InvalidConditions::array, InvalidTarget::PowerBoost(notObject), InvalidTarget::Rest(notObject))

## ST-24 — 3 cartes patchées

**critical (2):** ST24-004, ST24-005

**major (1):** ST24-001

**skipped — type inconnu (2):**
- ST24-002 (InvalidConditions::array, InvalidTarget::ForceDiscard(notObject), InvalidTarget::Rest(notObject))
- ST24-003 (InvalidConditions::array, InvalidTarget::Rest(notObject))

## ST-25 — 4 cartes patchées

**critical (2):** ST25-002, ST25-005

**major (2):** ST25-003, ST25-004

**skipped — type inconnu (1):**
- ST25-001 (InvalidCondition::LeaderIsName(noName))

## ST-26 — 5 cartes patchées

**critical (1):** ST26-005

**major (4):** ST26-001, ST26-002, ST26-003, ST26-004

## ST-27 — 3 cartes patchées

**critical (1):** ST27-003

**major (2):** ST27-004, ST27-005

**skipped — type inconnu (2):**
- ST27-001 (ConditionType::And, TargetScope::Board)
- ST27-002 (InvalidCondition::LeaderHasType(noSubType), InvalidTarget::PowerBoost(notObject))

## ST-28 — 3 cartes patchées

**critical (1):** ST28-004

**major (2):** ST28-001, ST28-002

**skipped — type inconnu (1):**
- ST28-005 (FilterKind::BySubtypeAndCost)

## ST-29 — 10 cartes patchées

**critical (6):** ST29-003, ST29-007, ST29-008, ST29-009, ST29-015, ST29-017

**major (4):** ST29-001, ST29-002, ST29-012, ST29-014

**skipped — type inconnu (4):**
- ST29-004 (no suggestedDsl)
- ST29-011 (InvalidConditions::array, InvalidTarget::Rest(notObject))
- ST29-013 (no suggestedDsl)
- ST29-016 (Duration::DuringBattle)


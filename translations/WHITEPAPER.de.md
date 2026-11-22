# Olive Branch Network Whitepaper — Proof-of-Contribution

[English](../WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · [한국어](WHITEPAPER.ko.md) · [日本語](WHITEPAPER.ja.md) · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · **Deutsch** · [Português](WHITEPAPER.pt.md) · [Español](WHITEPAPER.es.md) · [Bahasa Indonesia](WHITEPAPER.id.md)

> Diese Übersetzung dient lediglich der besseren Lesbarkeit. Maßgeblich ist die englische Fassung ([WHITEPAPER.md](../WHITEPAPER.md)); bei Abweichungen hat die englische Fassung Vorrang. Die Übersetzung wurde mit KI-Unterstützung auf Basis der Revision `3c740d855` erstellt und noch nicht von einem professionellen Übersetzer geprüft. Vertragsnamen, Funktionsnamen und Adressen bleiben auf Englisch.

## Zweck

Das Olive Branch Network ist ein Proof-of-Contribution-Staking-Protokoll, das gewöhnliche On-Chain-Teilnahme in kontinuierliche Finanzierung gemeinnütziger Organisationen verwandelt und Nutzer zugleich für ihre Teilnahme belohnt. Nutzer staken OBN in Pools einzelner gemeinnütziger Organisationen, verdienen Staking-Emissionen und helfen dabei, einen festgelegten Teil dieser Emissionen an reale Anliegen zu leiten.

Das Ziel ist nicht, Nutzer zwischen Verdienen und Beitragen wählen zu lassen. Das Ziel ist, dass beides durch dieselbe Protokollaktion geschieht.

OBN führt eine Beitragsebene ein, in der Staking-Aktivität transparente On-Chain-Aufzeichnungen erzeugt, die mit den von Nutzern unterstützten Anliegen verknüpft sind. Jeder Stake, jede Beanspruchung, jede Ausschüttung an eine gemeinnützige Organisation, jede Governance-Abstimmung, jede Verbrennung und jede jährliche Zuteilung wird Teil eines öffentlichen Systems, das nachverfolgt, überprüft und weiterentwickelt werden kann.

Das ist die Grundlage von Proof-of-Contribution: ein Modell, in dem digitale Vermögenswerte nicht nur für Spekulation, Rendite oder Governance genutzt werden, sondern auch für messbare Beiträge.

Dieses Dokument definiert die Protokollarchitektur, die Token-Ökonomie, das Modell gemeinnütziger Pools, die Governance-Struktur, den Upgrade-Pfad, die Sicherheitsannahmen und den gesamten Prozess zur Unterstützung gemeinnütziger Organisationen über OBN.

---

## 1) Zusammenfassung

**Mission:** Beitragen zum Weg des geringsten Widerstands machen, indem ein fester Anteil der Staking-Emissionen automatisch, transparent und on-chain überprüfbar an genehmigte Wallets gemeinnütziger Pools geleitet wird.

**Kernidee:** OBN basiert auf **Proof-of-Contribution**: einem Modell, in dem Nutzer ihre Teilnahme nicht nur durch das Staken von Kapital nachweisen, sondern auch dadurch, dass sie fortlaufend helfen, Wert an reale gemeinnützige Anliegen zu leiten. Jeder Stake, jede Beanspruchung und jeder Belohnungsfluss an gemeinnützige Organisationen wird Teil einer On-Chain-Beitragsebene.

**Mechanismus:** Nutzer staken OBN in Pools einzelner gemeinnütziger Organisationen. Die Emissionsaufteilung ist fest codiert: 88% Staker, 10% direkt an die gemeinnützige Organisation, 1% ExtendOliveBranch (jährliche gemeinnützige Ausschüttung), 1% TheOffering (jährliche Abstimmung über Verbrennen oder Geben).

**Design-Garantien:**

- Feste Vierfach-Aufteilung (88/10/1/1) auf Vertragsebene
- Gleicher APR pro Token in allen Pools zu jedem Zeitpunkt (Pool-APRs gleichen sich konstruktionsbedingt an)
- Proof-of-Contribution-Buchführung über On-Chain-Finanzierungsflüsse und Beitragsansichten der Nutzer
- Eine charityWallet pro Pool; keine "retire/active"-Flags auf Pools
- Admin-Sperren können nur erhöht werden und schrumpfen automatisch, wenn das Guthaben sinkt; nur für den Bootstrap vorgesehen
- Einziger Minter: Nach setMinterOnce kann nur der Staking-Vertrag OBN minten
- Zeitstempelbasierte Emissionsphasen mit einem über 10 Jahre abnehmenden Zeitplan
- Schutz vor Selbst-Staking gemeinnütziger Organisationen, Pool-Lebenszyklusverwaltung, atomare Bootstrap-Migration, Kontrollen für erzwungenen Notausstieg

**Governance und Upgrade-Fähigkeit:** Timelock-eigene UUPS-Proxys für Token, Staking, AnnualGovernance, Lens und OliveAssembly. AnnualGovernanceV2 ist seit dem 7. Oktober 2026 live: NFT-Registrierung und Snapshot-Stake bestimmen die Quadratwurzel-Stimmkraft für jährliche Zuteilungen. Eine umfassendere DAO-Kontrolle bleibt ein künftiger Governance-Schritt.

---

## 2) Proof-of-Contribution

### 2.1 Was Proof-of-Contribution bedeutet

Proof-of-Contribution ist die Kernidentität von OBN.

In traditionellen Staking-Systemen weisen Nutzer ihre Teilnahme nach, indem sie Kapital sperren und Rendite verdienen. OBN behält diese Staking-Grundlage bei, fügt aber eine zweite Ebene hinzu: Jede Nutzeraktion hilft auch, einen gemeinnützigen Pool zu finanzieren. Teilnahme wird also nicht nur an Spekulation, Eigentum oder Renditeabschöpfung gemessen. Sie wird auch am Beitrag gemessen.

Wenn ein Nutzer OBN in einen gemeinnützigen Pool stakt, wählt er nicht einfach aus, wo er Belohnungen verdient. Er wählt aus, welches Anliegen seine Teilnahme unterstützt. Wenn er Belohnungen beansprucht, mintet das Protokoll den gemeinnützigen Anteil automatisch an die charityWallet des gewählten Pools. Das Ergebnis ist eine transparente On-Chain-Aufzeichnung des Beitrags, die durch gewöhnliche Protokollteilnahme entsteht.

OBN macht Staking damit zu einem Beitragsmechanismus.

### 2.2 Warum das wichtig ist

Die meisten Krypto-Protokolle messen Erfolg an Liquidität, Volumen, Preis, Nutzern und TVL. OBN behält diese Kennzahlen bei, ergänzt aber eine weitere wichtige Messgröße: wie viel Wert das Netzwerk an gemeinwohlorientierte Organisationen leitet.

Das erzeugt eine andere Art von Netzwerkeffekt:

- Mehr Nutzer erzeugen mehr Staking-Aktivität
- Mehr Staking-Aktivität erzeugt mehr Emissionen
- Mehr Emissionen erzeugen mehr gemeinnützige Finanzierung
- Mehr gemeinnützige Finanzierung erzeugt sichtbarere Wirkung
- Sichtbarere Wirkung stärkt die Identität und Glaubwürdigkeit des Protokolls

Proof-of-Contribution bringt Eigeninteresse und Gemeinwohl in Einklang. Nutzer können verdienen, gemeinnützige Organisationen können empfangen, und das Protokoll kann eine transparente Beitragshistorie aufbauen, ohne von Nutzern separate Spenden zu verlangen.

### 2.3 Beitrag als On-Chain-Identitätsebene

OBN kann Beiträge über bestehende und künftige Protokollansichten nachverfolgen, darunter:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- gemeinnützige Ausschüttungen auf Pool-Ebene
- Gesamtmenge der an jede Wallet einer gemeinnützigen Organisation geminteten Charity
- gestakte Zeit und Teilnahmehistorie

Diese Kennzahlen ermöglichen dem Protokoll künftige Beitrags-Dashboards, Wirkungsprofile von Nutzern, Berichtsseiten für gemeinnützige Organisationen und Governance-Werkzeuge. Mit der Zeit kann Proof-of-Contribution zu einer Identitätsebene werden, die zeigt, wie Nutzer am Netzwerk teilgenommen und welche Anliegen sie unterstützt haben.

Dafür müssen Nutzer keine Rendite opfern. Das Protokoll ist so gestaltet, dass Verdienen und Beitragen in derselben Aktion geschehen.

---

## 3) Vertragssuite

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**Standards:** ERC20, EIP-2612 Permit, ERC20Votes (Stimmkraft mit Checkpoints), Burnable.

**Kernfunktionen:**

- **ERC20Upgradeable:** Standardmäßige Token-Transfers, Genehmigungen, Guthaben
- **ERC20PermitUpgradeable:** EIP-2612 permit() für gaslose Genehmigungen
- **ERC20VotesUpgradeable:** Stimmkraft mit Checkpoints für die Governance (Stimmdelegation, historische Abfragen)
- **ERC20BurnableUpgradeable:** Nutzer können Token freiwillig verbrennen
- **UUPSUpgradeable:** Mit Eigentümer-Autorisierung upgradefähig
- **OwnableUpgradeable:** Einzelner Eigentümer mit Übertragungsmöglichkeit

**Historischer Genesis-Mint (einmalig bei initialize)** des Anfangsangebots von 1,000,000,000 OBN. Diese ursprünglichen Mint-Ziele stellen keine aktuellen, unverbrauchten Reservezuteilungen dar:

- 40% Liquidität — für das Bootstrapping von DEX-Pools
- 30% Airdrop — frühe Verteilung an die Community
- 10% ursprüngliche gemeinnützige Zuteilung
- 10% Treasury — für Protokoll-Governance und -Betrieb
- 10% Team — an den TeamVesting-Vertrag mit Cliff und Vesting-Zeitplan

Die gesamte Verteilung ist in `initialize()` fest codiert und erfolgt atomar; während der Genesis findet kein zusätzliches Minting statt.

**Einzel-Minter-Modell (harte Regel):**

- `setMinterOnce(address minterAddr)` legt genau einen Minter fest (den Staking-Vertrag) und kann nur einmal aufgerufen werden
- Nach dem Aufruf von `setMinterOnce` kann der Minter nur durch ein Vertrags-Upgrade geändert werden
- Nur der Minter kann `mint(to, amount)` aufrufen, um Staking-Belohnungen auszuschütten
- Diese fest codierte Einschränkung beseitigt das Risiko willkürlicher Ausgabe und sorgt für ein vorhersehbares Token-Angebot

**Upgrade-Schranke:** UUPS mit auf den Eigentümer beschränktem `_authorizeUpgrade` (nach dem Bootstrap unter DAO-Kontrolle).

**Stimmdelegation:** Nutzer können mit `delegate(delegatee)` ihre Stimmkraft zuweisen (ERC20Votes-Muster).

**Warum diese Struktur?**
Die einmalige Verteilung beseitigt Unklarheiten über das Anfangsangebot. Ein einziger Minter beseitigt das Risiko willkürlicher Ausgabe. ERC20Votes richtet den Token auf DAO-Kontrolle aus und ermöglicht künftige Governance. Die Verbrennbarkeit bietet eine freiwillige Senke für künftige Integrationen. Die Permit-Unterstützung (EIP-2612) verbessert die UX, indem separate Genehmigungstransaktionen entfallen.

### 3.2 OBNStakingPools (Zeitstempelphasen, Buchführung pro Pool, UUPS)

**Fest codierte Belohnungsaufteilung (BPS):**

- STAKER_BPS = 8_800 → 88% an Nutzer
- CHARITY_BPS = 1_000 → 10% an die Charity-Wallet (direkt, pro Aktion)
- CHARITY_FUND_BPS = 100 → 1% an ExtendOliveBranch
- TREASURY_BPS = 100 → 1% an TheOffering

Die Adresse `charityFund` leitet an **ExtendOliveBranch** und die Adresse `treasury` an **TheOffering**. Beide sammeln während jedes Jahreszyklus OBN an. AnnualGovernance entscheidet am Ende jedes Zyklus durch Community-Abstimmungen über beide Guthaben. Vertragsdetails siehe Abschnitte 3.4–3.6.

**Emissionsphasen (bei der Bereitstellung initialisiert):**

- Jahre 0–2: 10.00% APY
- Jahre 2–4: 7.50% APY
- Jahre 4–6: 5.00% APY
- Jahre 6–8: 2.50% APY
- Jahre 8–10: 1.25% APY

Die Governance kann künftige Phasen lückenlos anfügen; frühere Phasen bleiben unveränderlich.

**Gleicher APR pro Pool:** Konstruktionsbedingt hängt der APR pro Token nur von der aktiven Phase ab, nicht davon, welchen Pool Sie wählen.

**Proof-of-Contribution-Buchführung:** Der Staking-Vertrag stellt Beitragsansichten für Nutzer und Pools bereit, mit denen das Protokoll berechnen kann, wie viel gemeinnützige Finanzierung der Teilnahme jedes Nutzers zuzurechnen ist.

**Datenmodell:** PoolInfo { address charityWallet; uint256 totalStaked; } (eine Wallet pro Pool).

#### 3.2.1 Zentrale Nutzeraktionen

**Begrenzte Endpunkte pro Pool:**

- `deposit(pid, amount)` — OBN in einem Pool staken
- `depositFor(pid, amount, beneficiary)` — Im Namen einer anderen Adresse staken
- `depositWithPermit(...)` — Mit ERC20 Permit staken (ohne separate Genehmigung)
- `withdraw(pid, amount)` — Nicht gesperrtes Guthaben abheben
- `claim(pid)` — Ausstehende Belohnungen beanspruchen
- `claimFor(pid, user)` — Beanspruchung im Namen einer anderen Adresse, nur für den Eigentümer
- `claimMultiple(pids[])` — Ausstehende Belohnungen aus mehreren Pools in einer Transaktion beanspruchen
- `setAutoClaimEnabled(bool)` — Zustimmung der aufrufenden Wallet für alle ihre Pools festlegen
- `autoClaimFor(pids[], user, month, consentNonce)` — Dedizierter Executor reicht einen autorisierten monatlichen Stapel ein

Staker können sich on-chain für das gesponserte monatliche Autoclaim für alle aktuellen und künftigen Pools ihrer Wallet entscheiden. Das Automatisierungskonto bündelt Pools mit positiven beanspruchbaren Nutzerbelohnungen, bis zu 32 Pools pro Transaktion, und zahlt Gas über den konfigurierten Paymaster. Der Vertrag erlaubt eine erfolgreiche automatische Beanspruchung pro Pool und UTC-Kalendermonat. Belohnungen folgen derselben Aufteilung 88% / 10% / 1% / 1% und gehen an dieselben Empfänger wie bei manuellen Beanspruchungen. Nutzer können die Zustimmung jederzeit deaktivieren; Einzahlungen, Abhebungen und manuelle Beanspruchungen bleiben verfügbar. Autoclaim überträgt kein Kapital, reinvestiert keine Belohnungen und ändert keine Stimmkraft.

Änderungen der Zustimmung machen zuvor eingereihte Anfragen ungültig. Eine erneute Aktivierung setzt die Monatslimits nicht zurück. Ein UTC-Kalendermonat ist kein rollierendes 30-Tage-Intervall; manuelle Beanspruchungen verbrauchen das automatische Kontingent nicht. Ein Pool ist berechtigt, wenn der Nutzeranteil nach ganzzahliger Rundung positiv ist; es gibt keine Mindestbelohnung auf Dienstebene. Das Sponsoring der Opt-in- oder Opt-out-Transaktion hängt von der Wallet-Unterstützung ab. Das nur dem Eigentümer vorbehaltene `claimFor` bleibt von der Autoclaim-Zustimmung unabhängig. Bereitstellungs- und Aktivierungsstatus sind in Anhang B festgehalten.

Autoclaim-Einstellungen sind an Staking-Adressen gebunden und von künftigen Identitäts- oder Stimmberechtigungssystemen getrennt. Der Executor kann weder Belohnungen umleiten noch den Stake eines Nutzers abheben oder dessen Zustimmung ändern.

**Gemeinnützige Mechanik:**

- 10% der Belohnungen werden pro Nutzeraktion (Beanspruchung, Einzahlung, Abhebung) direkt an die charityWallet dieses Pools gemintet
- 1% sammelt sich fortlaufend in ExtendOliveBranch an; die Community stimmt in jedem Zyklus ab, welche genehmigte gemeinnützige Organisation die feste Zuteilung des Zyklus erhält
- 1% sammelt sich fortlaufend in TheOffering an; die Community stimmt in jedem Zyklus ab, ob die zu Zyklusbeginn festgehaltene Zuteilung verbrannt oder an ExtendOliveBranch gespendet wird
- Kein globaler TVL-Puffer; Aufteilungen erfolgen pro Aktion für atomare Ausführung

#### 3.2.2 Pool-Lebenszyklusverwaltung

**Stilllegungsmechanismus:**

- `shutdownPool(pid)` — Blockiert NEUE Einzahlungen; Beanspruchungen und Abhebungen laufen weiter
- Ermöglicht Nutzern einen geordneten Ausstieg ohne Entfernung des Pools
- Pool-Daten bleiben für Staker erhalten

**Pool-Entfernung:**

- `removePool(pid)` — Weiches Löschen, nachdem der Pool vollständig leer ist (totalStaked == 0)
- Keine Neuindizierung der PID; abwärtskompatibel
- **Treasury-Sicherheit:** Wenn vor der Entfernung noch Alt-Charity aufgelaufen ist, wird sie an die charityWallet des Pools geleitet; ist die Wallet die Nulladresse, wird sie an treasury umgeleitet
- Verhindert Belohnungsverlust, wenn Nutzer nach der Entfernung beanspruchen

#### 3.2.3 Schutz vor Selbst-Staking gemeinnütziger Organisationen

**Richtlinie:** Gemeinnützige Organisationen können genau EINE dauerhaft gesperrte Bootstrap-Einzahlung erhalten. Jedes andere Selbst-Staking ist blockiert.

**Durchsetzung:** Die Funktion `_enforceCharitySelfStakePolicy` prüft:

- Ist der Begünstigte die Charity-Wallet des Pools?
- Falls ja: Stammt dies von charityFund UND ist gesperrt UND ist das aktuelle Guthaben null?
- Wenn alles zutrifft, erlauben (erster Bootstrap). Andernfalls ablehnen.

**Begründung:** Verhindert versehentliches oder böswilliges Selbst-Staking gemeinnütziger Organisationen, das die Belohnungsdynamik des Pools stören oder Angriffe ermöglichen könnte.

#### 3.2.4 Atomare Bootstrap-Migration

**Funktion:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**Atomare Garantien:**

- Bewahrt ausstehende Belohnungen (bis auf 1 wei Toleranz verifiziert)
- Kopiert gesperrte Beträge sicher mit Überlaufschutz
- Aktualisiert die Charity-Wallet atomar in derselben Transaktion
- Deaktiviert die Pool-Zähler des alten Nutzers
- Aktiviert den neuen Nutzer, wenn es sein erster Pool-Stake ist

**Vorbedingungen:**

- oldNonprofit IST die aktuelle Charity-Wallet des Pools
- oldNonprofit ≠ newNonprofit
- oldNonprofit hat einen Stake ungleich null
- newNonprofit hat noch keinen Stake in diesem Pool

**Zweck:** Ermöglicht nahtlose Übertragungen von Positionen gemeinnütziger Organisationen (z. B. bei Adresskompromittierung oder Wallet-Rotation) ohne Verlust oder Festhängen von Belohnungen.

#### 3.2.5 Erzwungener Notausstieg

**Funktion:** `forceExitUserToSelf(pid, user, claimRewards)` (nur Eigentümer, nonReentrant)

**Verhalten:**

- Erzwingt den Ausstieg eines Nutzers aus einem Pool unter Missachtung von Sperren
- Gibt dem Nutzer das Kapital sofort zurück
- Mintet dem Nutzer optional ausstehende Belohnungen
- Löscht Sperre, Belohnungsschuld und Zähler aktiver Staker

**Anwendungsfall:** Governance-Notfallkontrolle bei der Pool-Entfernung, wenn Nutzer ihre Mittel zurückerhalten müssen; wird nach der Stilllegung eines Pools eingesetzt.

#### 3.2.6 Aktualisierung der Charity-Wallet

**Funktion:** `updateCharityWallet(pid, newWallet)` (nur Eigentümer)

**Ermöglicht:** Die Aktualisierung der Charity-Adresse eines Pools (z. B. bei Kompromittierung oder Rotation auf eine neue Adresse).

**Nachverfolgt über:** Ereignis CharityWalletUpdated.

#### 3.2.7 Sperrverwaltung

**Funktion:** `setLockedAmount(pid, user, amount)` (nur charityFund)

**Regeln:**

- Kann nur ERHÖHT oder beibehalten werden; niemals verringert
- Darf das Guthaben des Nutzers nicht übersteigen
- Sperren schrumpfen automatisch, wenn das Guthaben unter den Sperrbetrag fällt
- Nur für Bootstrap-Einzahlungen vorgesehen

**Beobachtbarkeit:**

Analyseabfragen werden über **OBNStakingLens** (Abschnitt 3.7) bereitgestellt — die kanonische Leseschicht für Frontends und Dashboards. Sperr- und Guthabenabfragen bleiben direkt am Staking-Vertrag:

- `pendingRewards(pid, user)` — Gibt den BRUTTO ausstehenden Betrag zurück
- `pendingRewardsMultiple(pids[], user)` — Gibt ausstehende Beträge für mehrere Pools plus Summe zurück
- `unlockedBalance(pid, user)` — Gibt das Guthaben abzüglich Sperre zurück
- `stakeElapsed(user)` — Gesamte Staking-Sekunden (bleiben über Unstakes hinweg erhalten)
- `charityContributedByUserInPool(pid, user)` — Gesamte dem Nutzer in einem Pool zurechenbare gemintete Charity
- `totalCharityContributedByUser(user)` — Gesamte dem Nutzer über alle Pools zurechenbare gemintete Charity

Die vollständige Ansichtsoberfläche von OBNStakingLens (getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor) finden Sie in Abschnitt 3.7.

### 3.3 TeamVesting (linear, mit Cliff; nicht upgradefähig)

**Cliff:** ~4 Monate; **Dauer:** danach ~20 Monate linear.

**`release()`:** Streamt gevestete Token an teamWallet.

**Hilfsfunktionen:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**Sicherheit:** Der gevestete Token kann nicht gerettet werden; nur versehentlich eingegangene ERC20.

### 3.4 TheOffering (nicht upgradefähig)

TheOffering ist der jährliche Verbrennen-oder-Geben-Tresor des Protokolls. Der Staking-Vertrag leitet den 1%-Emissionsanteil von treasury an diese Adresse. OBN sammelt sich während jedes Jahreszyklus fortlaufend an.

Am Ende jedes Zyklus führt AnnualGovernance das Ergebnis der Community-Abstimmung in Phase 1 aus:

- **BURN:** Die zu Zyklusbeginn festgehaltene Zuteilung wird dauerhaft verbrannt und verringert das gesamte OBN-Angebot.
- **GIVE:** Die zu Zyklusbeginn festgehaltene Zuteilung wird an ExtendOliveBranch übertragen und erhöht die gemeinnützige Ausschüttung dieses Zyklus.

**Zugriffskontrolle:** `timelockOwner` (Timelock) kontrolliert Admin-Funktionen einschließlich `emergencySweep`. `governance` (AnnualGovernance) ist die einzige Adresse, die `burn()` oder `sendToExtend()` aufrufen darf. Die Adresse `governance` wird mit `address(0)` initialisiert und über `setGovernance()` durch das Timelock mit AnnualGovernance verbunden.

**Nicht upgradefähig:** TheOffering ist als Standardvertrag ohne Proxy bereitgestellt. Die Konstruktorargumente (Token-Adresse `obn`, `timelockOwner`) sind unveränderlich. Falls ein Ersatz nötig ist, muss das Timelock einen neuen Vertrag bereitstellen und `setTreasury(newAddress)` am Staking-Proxy aufrufen, um die Emissionen umzuleiten.

### 3.5 ExtendOliveBranch (nicht upgradefähig)

ExtendOliveBranch ist der jährliche gemeinnützige Ausschüttungstresor des Protokolls. Der Staking-Vertrag leitet den 1%-Emissionsanteil von charityFund an diese Adresse. OBN sammelt sich fortlaufend an und kann auch eine Spende von TheOffering erhalten, wenn die Community in Phase 1 für GIVE stimmt.

Am Ende jedes Zyklus führt AnnualGovernance die Community-Abstimmung in Phase 2 aus: Die charityWallet des siegreichen gemeinnützigen Pools erhält die feste Zykluszuteilung von ExtendOliveBranch in einer einzigen Transaktion.

**Register genehmigter gemeinnütziger Organisationen:** ExtendOliveBranch führt eine Whitelist genehmigter Empfängeradressen. `setApprovedNonprofit(address, bool)` kann vom Timelock aufgerufen werden. Alle Charity-Wallets der Pools werden auf der Whitelist geführt; neue Pools werden über `schedule_addPool.js` atomar zusammen mit `addPool` genehmigt.

**Ausschüttung:** `distributeFromGovernance(to, amount)` kann nur von der Adresse `governance` aufgerufen werden. Der Tresor wiederholt die Whitelist-Prüfung auf diesem Pfad nicht: AnnualGovernanceV2 validiert jeden Empfänger bei der Vorbereitung seines Stimmzettel-Stapels und zahlt nur an das gewählte Stimmzettelmitglied.

**Nicht upgradefähig:** Dieselbe Unveränderlichkeitsgarantie wie bei TheOffering. Die Konstruktorargumente (`obn`, `timelockOwner`) sind unveränderlich.

### 3.6 AnnualGovernanceV2 (Live-Implementierung; bestehender UUPS-Proxy)

AnnualGovernance koordiniert die jährlichen Entscheidungszyklen für TheOffering und ExtendOliveBranch. Sein bestehender Timelock-eigener UUPS-Proxy wurde am **7. Oktober 2026 bei Base-Block 52283807** auf AnnualGovernanceV2 aktualisiert, wie in der [Bereitstellungsdokumentation des Repositorys](../README.md#annual-governance) festgehalten. OliveAssembly liefert die NFT-Registrierung mit Checkpoints für die neuen Abstimmungsregeln. Die Bereitstellung selbst startet keinen Jahreszyklus.

**Zyklusstruktur:** Jeder Jahreszyklus umfasst zwei aufeinanderfolgende Phasen:

1. **Phase 1 — Verbrennen oder Geben:** Berechtigte registrierte Staker stimmen über die zu Zyklusbeginn festgehaltene Zuteilung von TheOffering ab. Das siegreiche Ergebnis wird atomar ausgeführt: BURN ruft `TheOffering.burn()` auf; GIVE ruft `TheOffering.sendToExtend()` auf.

2. **Phase 2 — Auswahl der gemeinnützigen Organisation:** Berechtigte registrierte Staker wählen, welche genehmigte gemeinnützige Organisation die Zuteilung von ExtendOliveBranch zu Zyklusbeginn plus gegebenenfalls den GIVE-Transfer dieses Zyklus erhält. Spätere Eingänge bleiben für den nächsten Zyklus. Es gibt keine harte Obergrenze für den Stimmzettel: Erlaubnisfreie Stapel verarbeiten höchstens 100 Pool-IDs pro Aufruf in aufsteigender Reihenfolge, schließen vollständig entfernte Pools aus und deduplizieren Charity-Wallets. Stillgelegte Pools bleiben berechtigt, bis sie vollständig entfernt sind. Die siegreiche charityWallet erhält die feste Zuteilung über `ExtendOliveBranch.distributeFromGovernance()`.

**Auflösung bei Stimmengleichheit:**

- Phase 1: GIVE gewinnt nur, wenn seine Stimmensumme die von BURN strikt übersteigt. Exakter Gleichstand — oder keine Beteiligung — wird als BURN gewertet.
- Phase 2: Die gemeinnützige Organisation mit der höchsten Stimmensumme gewinnt; bei Gleichstand gewinnt die auf dem Stimmzettel am frühesten stehende. Werden gar keine Stimmen abgegeben, wird das Guthaben in den nächsten Zyklus übertragen, statt ausgeschüttet zu werden.

**Integrität der Abstimmung:**

- Die Berechtigung erfordert ein in OliveAssembly registriertes OliveNFT und mindestens 1 OBN aggregiertes gestaktes Guthaben bei `block.number - 1` vor Zyklusbeginn. Beide Phasen teilen diesen Snapshot; spätere Registrierung oder späteres Staking kann die Stimmkraft des Zyklus nicht erhöhen, und spätere Abhebungen löschen den Anspruch nicht.
- Die Stimmkraft ist die Quadratwurzel des Snapshot-Stakes: 100 gestakte OBN ergeben 10 Stimmkrafteinheiten. Der Vertrag berechnet `floor(sqrt(stakeInWei)) * 1e9`, ausgedrückt in Einheiten mit 18 Dezimalstellen. Zusätzliche NFTs in einer Wallet erhöhen die Stimmkraft nicht; historische Zyklen vor V2 behalten ihre ursprüngliche lineare Gewichtung.
- Der voteAdmin-Safe startet Phase 1 direkt, ohne Timelock-Verzögerung, und bereitet den ersten Stimmzettel-Stapel vor. Jeder kann die Vorbereitung fortsetzen und jede Phase abrechnen. Phase 1 dauert genau 30 Tage und kann erst abgerechnet werden, wenn die Stimmzettelvorbereitung abgeschlossen ist; Phase 2 erhält volle 30 Tage ab der tatsächlichen Abrechnung von Phase 1.

**Ausführung:** AnnualGovernance ruft TheOffering und ExtendOliveBranch direkt auf. Nach Abschluss einer Abstimmung ist keine zusätzliche Multisig-Genehmigung erforderlich — die Ergebnisse werden vom Vertrag durchgesetzt.

**Upgrade-Fähigkeit:** AnnualGovernance ist ein UUPS-Proxy. Anspruchsvollere Abstimmungsmechanismen (Delegation, Quorum-Anforderungen, zeitgewichtete Abstimmung) können mit der Reifung der DAO durch vom Timelock gesteuerte Upgrades hinzugefügt werden.

**Zeitpunkt der Vorbereitung:** Wählerberechtigung und Stake verwenden den Snapshot des vorherigen Blocks; Fondsguthaben und die Länge der Pool-Historie werden in der Starttransaktion des Safe festgehalten. Wallet-/Entfernungsstatus jedes Pools und die Genehmigung jedes neuen Empfängers werden gelesen, wenn dessen Stapel ausgeführt wird. Spätere Pool-IDs bleiben ausgeschlossen und bereits aufgenommene Empfänger bleiben fest, selbst wenn ihre Genehmigung später widerrufen wird. Ein nicht genehmigter Empfänger macht diesen Stapel rückgängig; das Timelock muss die Konfiguration reparieren oder den Zyklus vor der Abrechnung von Phase 1 abbrechen. Vermeiden Sie Konfigurationsänderungen gemeinnütziger Organisationen während der Vorbereitung.

**Live-Parameter und Schutzmaßnahmen:** `owner` = Timelock; `voteAdmin` = OperatorSafe. Der veraltete Speicher `maxBallotSize` bleibt aus Kompatibilitätsgründen erhalten, beschränkt die Mitgliedschaft aber nicht. Upgrades von Governance und OliveAssembly sind während aktiver Zyklen einschließlich der Vorbereitung blockiert. Ein Abbruch ist nur vor der Ausführung von Phase 1 möglich. Zuteilungen sind buchhalterische Reservierungen in den bestehenden Tresoren, keine getrennte Verwahrung; ein Fehlbetrag muss aufgefüllt werden, bevor die Abrechnung gelingen kann.

**OliveAssembly-Registrierung:** Genehmigen Sie dem Assembly-Proxy die Übertragung eines OliveNFT und rufen Sie dann `deposit(tokenId)` auf, um es zu registrieren. Assembly hält ein NFT pro Wallet; die Registrierung bleibt über Zyklen hinweg bis zur Abhebung bestehen. Der Einzahler kann `withdraw()`, `withdrawTo(recipient)` oder `withdrawExpected(tokenId, recipient)` ohne Sperrfrist verwenden. Registrierte NFTs können nicht von einem Administrator abgehoben werden. Die NFT-Registrierung begründet keine einzigartige menschliche Identität.

### 3.7 OBNStakingLens (UUPS-Proxy)

OBNStakingLens ist ein dedizierter schreibgeschützter Analysevertrag. Er ist die kanonische Leseschicht für Frontends, Dashboards und Off-Chain-Analysewerkzeuge. Die Bündelung der Analyseabfragen in einem separaten upgradefähigen Proxy hält die externe Oberfläche des Staking-Vertrags minimal und stabil, während sich die Analysefähigkeiten unabhängig weiterentwickeln können.

**Wichtige Ansichten:**

- `getGlobalStats()` — Pool-Anzahl, Gesamt-TVL, eindeutige Staker, aktuelle Belohnungen pro Sekunde
- `getPoolStats(pid)` — Statistiken pro Pool: Charity-Wallet, gestakter Betrag, Staker-Anzahl, Akkumulatorzustand
- `getUserPoolView(pid, user)` — Nutzerspezifische Staking-Daten: Guthaben, Sperre, ausstehende Belohnungen, Aktivstatus
- `getPoolAPR(pid)` — Aktueller APR für den Staker-Anteil eines Pools
- `pendingCharityFor(pid, user)` — Geschätzter ausstehender gemeinnütziger Beitrag, der einem Nutzer zuzurechnen ist

**Zugriffskontrolle:** `owner` (Timelock) kontrolliert Upgrades. Lens liest als reiner Ansichtsaufrufer vom Staking-Proxy und hat keinen eigenen veränderlichen Zustand.

**Initialisierung:** `initialize(stakingPools, timelock)` — legt die Adresse des Staking-Proxys und den Timelock-Eigentümer fest.

---

## 4) Token-Ökonomie und langfristige Nachhaltigkeit

### 4.1 Emissionsmathematik (Intuition)

Sei die APR-Basis der Phase B (in BPS), der globale TVL G und der Pool-TVL P.

**Jährlicher Bruttobetrag für den Pool:** YearlyPoolGross = P × (B / 10,000)

**Staker erhalten 88% davon;** der Rest geht an die charityWallet der gemeinnützigen Organisation (10%), ExtendOliveBranch (1%) und TheOffering (1%).

**Der APR pro Token vereinfacht sich zu** 0.88 × (B / 10,000), **gleich über alle Pools** — unabhängig von der Angebotsgröße.

### 4.2 Abnehmende Emissionen stützen die Nachhaltigkeit

**Abnehmender Verkaufsdruck:** Geringere Ausgabe im Zeitverlauf senkt den strukturellen Verkaufsdruck.

**Anliegengetriebene Nachfrage:** Das Protokoll schafft eine fortlaufende Ausrichtung zwischen Nutzern, gemeinnützigen Organisationen und langfristiger Glaubwürdigkeit des Netzwerks.

**TVL-Glaubwürdigkeit:** Bootstrap-Sperren schaffen dauerhaften TVL und verbessern Vertrauen und Preisfindung.

**Vorhersehbarkeit:** Da Aufteilungen und Phasen on-chain sind, können Teilnehmer langfristig planen.

**Beitragshistorie:** Proof-of-Contribution ergänzt eine weitere Form von Protokollwert: transparente Belege für gemeinwohlorientierte Finanzierung durch Nutzerbeteiligung.

### 4.3 Minimalismus der Emissionsaufteilung (1% + 1%)

Nutzer erhalten 88%, direkte gemeinnützige Finanzierung macht 10% aus, und die verbleibenden 2% sammeln sich in ExtendOliveBranch und TheOffering an — jeweils jährlich durch Governance-Abstimmungen der Community entschieden.

Dass die in der Governance angesammelten Ströme bei je 1% bleiben, hält das Protokoll schlank und auf Nutzer und Gemeinnützigkeit ausgerichtet. Keiner der Ströme kann still umgeleitet werden; beide werden transparent on-chain über AnnualGovernance gesteuert.

### 4.4 Jährliche Governance-Ströme (1% + 1%)

Beide 1%-Emissionsströme werden von AnnualGovernance gesteuert, jeder mit einem klar definierten Zweck. V2 hält beide Guthaben zu Zyklusbeginn fest; Phase 2 ergänzt nur den GIVE-Transfer dieses Zyklus. Spätere Eingänge bleiben für den nächsten Zyklus.

**ExtendOliveBranch (1% der Emissionen):** Sammelt während jedes Jahreszyklus fortlaufend OBN an. Am Ende jedes Zyklus stimmen Staker in Phase 2 von AnnualGovernance ab, welcher genehmigte gemeinnützige Pool die feste Zykluszuteilung erhält. Das gibt der Community einen transparenten, wiederkehrenden Mechanismus, um Ressourcen auf Protokollebene an bestimmte Anliegen zu lenken.

**TheOffering (1% der Emissionen):** Sammelt fortlaufend OBN an. Am Ende jedes Zyklus stimmen Staker in Phase 1 von AnnualGovernance ab und wählen zwischen zwei Ergebnissen: die Zuteilung zu Zyklusbeginn per BURN zu verbrennen (dauerhaft deflationär) oder sie per GIVE an ExtendOliveBranch zu geben (zusätzlich zur gemeinnützigen Ausschüttung dieses Zyklus). Diese Abstimmung gibt der Community fortlaufende Kontrolle über die Angebotspolitik — eine Entscheidung, die mit wachsendem Protokoll-TVL und jährlicher Ansammlung an Bedeutung gewinnt.

Die vollständige Belohnungsstruktur:

- Die **10%-Zuteilung pro Aktion** fließt bei jeder Beanspruchung direkt und atomar an die charityWallet des gewählten Pools.
- Der **1%-Strom von ExtendOliveBranch** sammelt sich an und wird jährlich an eine von der Governance gewählte gemeinnützige Organisation ausgeschüttet.
- Der **1%-Strom von TheOffering** sammelt sich an und wird entweder verbrannt oder der gemeinnützigen Ausschüttung des Jahres hinzugefügt.

### 4.5 Verbrennbarkeit (optionale Senke)

OBN ist durch Staking inflationär, doch freiwillige Verbrennungen (z. B. künftige App-Gebühren) können die Ausgabe ausgleichen — dezentral und marktgetrieben.

---

## 5) Protokollmechanik und Begründung

### 5.1 Gemeinnützige Ausschüttung

**Modell pro Aktion:** Bei jeder Beanspruchung/Einzahlung/Abhebung werden 10% der ausstehenden Belohnungen des Nutzers direkt an die charityWallet dieses Pools gemintet.

**Atomare Ausführung:** Keine externen Aufrufe oder globalen Puffer; alle Aufteilungen erfolgen innerhalb der Transaktion des Nutzers.

**Keine Zuteilungskonkurrenz:** Die Charity jedes Pools ist unabhängig; es gibt keine globale Umverteilungsfunktion.

**Proof-of-Contribution:** Da die gemeinnützige Ausschüttung an Nutzeraktionen und Pool-Auswahl gebunden ist, kann das Protokoll Beiträge bestimmten Nutzern und gemeinnützigen Pools zurechnen.

### 5.2 Jährliche Governance-Ströme und gemeinnützige Seed-Reserve

**Gemeinnützige Seed-Reserve:** Eine Zuteilung von 300M OBN finanziert dauerhaft gestakte gemeinnützige Seeds zu je 1M OBN. Sie ist von laufenden Staking-Emissionen und jährlichen Governance-Zuteilungen getrennt. Zur Reservebuchführung siehe Abschnitt 11.

**ExtendOliveBranch (1% der laufenden Emissionen):** Sammelt sich fortlaufend an. Abstimmungen in Phase 2 von AnnualGovernance wählen, welche genehmigte gemeinnützige Organisation die feste Zykluszuteilung erhält. Der jährliche Mechanismus für gezielte Beiträge des Protokolls.

**TheOffering (1% der laufenden Emissionen):** Sammelt sich fortlaufend an. Abstimmungen in Phase 1 von AnnualGovernance wählen zwischen dem Verbrennen der Zuteilung zu Zyklusbeginn und ihrer Spende an ExtendOliveBranch. Der jährliche Mechanismus der Angebotspolitik des Protokolls.

Diese dreifache Unterscheidung ist wichtig:

- Der **10%-Anteil gemeinnütziger Belohnungen** ist automatisch, erfolgt pro Aktion und ist poolspezifisch.
- Die **gemeinnützige Seed-Reserve** finanziert Bootstrap-Stakes aus zugeteilten Beständen.
- Die **jährlichen Governance-Ströme 1% + 1%** sind laufende Emissionen, die jährlich durch Community-Abstimmungen entschieden werden.

### 5.3 Dauerhafte Sperren (nur Bootstrap; nur erhöhbar)

**Richtlinie:** Der Admin kann lockedAmount nur erhöhen und niemals verringern; Sperren schrumpfen automatisch, wenn das Guthaben des Nutzers unter die gespeicherte Sperre fällt.

**Zweck:** Ausschließlich für den Bootstrap-Mechanismus. Sperren stellen sicher, dass das Seed-Kapital nicht abgehoben werden kann, während der Begünstigte vom ersten Tag an Rendite verdient. Das wahrt die TVL-Integrität und schützt vor sofortigem Abverkauf der Seed-Token.

**Nutzer-Stakes sind standardmäßig nicht gesperrt;** Nutzer können ihr nicht gesperrtes Guthaben jederzeit abheben.

### 5.4 Kein Emissionsregler

Die Phasen legen die Ausgabe vollständig fest; es gibt keinen externen „Ratenregler“. Die DAO kann künftige Phasen mit Vorankündigung (timelock) lückenlos anfügen.

---

## 6) Gemeinnützige Organisationen: Wallets, Onboarding und Darstellung

### 6.1 Eine Wallet pro Pool

Jeder Pool ist genau einer charityWallet zugeordnet. Das hält das Routing deterministisch und die Berichterstattung einfach.

### 6.2 Listung mit Adresse zuerst

Wir indexieren öffentliche Ethereum-Adressen, die seriöse Organisationen bereits veröffentlichen, und nehmen sie auf unsere Plattform auf.

Zusätzlich kontaktieren wir Organisationen per E-Mail und Telefon, um sie über unsere Plattform zu informieren.

Jede Charity-Seite zeigt standardmäßig ein deutliches Banner „Keine Zugehörigkeit / Keine Billigung“, sofern keine direkte Beziehung oder formelle Anerkennung besteht.


### 6.3 Bootstrap-Programm

**Ziel:** Sicherstellen, dass jede neu aufgenommene gemeinnützige Organisation vom ersten Tag an verdient und Pools mit glaubwürdigem TVL starten.

**Mittelherkunft:** Die gemeinnützige Seed-Reserve von 300M OBN finanziert Bootstrap-Stakes von 1M OBN pro gemeinnütziger Organisation. Von der Community finanziertes Seeding unterstützt das weitere Onboarding, wenn Reserven erschöpft sind; es gibt keine harte Pool-Obergrenze.

**Mechanismus:**

1. Die Governance oder der autorisierte Executor (die Adresse `charityFund`, gesetzt auf ExtendOliveBranch) ruft `charityFundBootstrap(pid, amount, beneficiary)` auf oder verwendet gegebenenfalls `depositForWithLock(pid, amount, beneficiary)`.
2. Das Bootstrap-OBN wird für den Pool/Begünstigten dieser gemeinnützigen Organisation gestakt und dauerhaft gesperrt.
3. Die Sperre verhindert die Abhebung des Seed-Kapitals und beseitigt so das Risiko eines sofortigen Abverkaufs, während die Position fortlaufend Rendite verdient.
4. Die gemeinnützige Organisation profitiert sowohl von der Staker-Anteil-Rendite auf ihre gesperrte Bootstrap-Position als auch von der 10%-Charity-Zuteilung des Pools, die an die charityWallet geleitet wird.

**Berichterstattung:** Jeder Bootstrap ist on-chain transparent und in regelmäßigen öffentlichen Offenlegungen enthalten.

**Schutz:** `_enforceCharitySelfStakePolicy` stellt sicher, dass jede gemeinnützige Organisation nur eine gesperrte Bootstrap-Position erhalten kann. Künftige gewöhnliche Stakes müssen von externen Nutzern stammen, während Wallet-Migrationen gemeinnütziger Organisationen dem von der Governance kontrollierten Migrationsprozess des Protokolls folgen müssen.

### 6.4 Delisting-Richtlinie

Werden Standards nicht erfüllt, entfernen wir die gemeinnützige Organisation aus unserem Frontend und bewerben diesen Pool nicht mehr.

Nutzer-Stakes und ausstehende Belohnungen sollten an die Nutzer zurückgegeben werden, bevor der Pool stillgelegt und aus dem Protokoll entfernt wird.

**Schließung eines Pools.** Verlässt eine gemeinnützige Organisation das Protokoll, wird ihr Pool stillgelegt: Neue Stakes sind gesperrt, bestehende Staker können weiterhin unstaken und beanspruchen, und verbleibende Stakes verdienen weiter nach der üblichen Aufteilung 88/10/1/1. Bevor der Pool entfernt wird, wird für jeden verbliebenen Staker ein Force-Exit ausgeführt: `forceExitUserToSelf` gibt jeden Stake samt ausstehender Belohnungen an die eigene Wallet des jeweiligen Stakers zurück und kann ihn nirgendwohin sonst senden. Der gesperrte Seed-Stake der gemeinnützigen Organisation geht an die Gemeinnützige Seed-Reserve zurück. Erst dann, wenn nichts mehr gestakt ist, wird der Pool entfernt.

OBN ist ein Routing- und Staking-Protokoll, keine eingetragene gemeinnützige Organisation oder Zertifizierungsstelle. Nutzer sollten Organisationen unabhängig prüfen und Steuerfachleute konsultieren.

---

## 7) Governance und Upgrade-Fähigkeit

### 7.1 UUPS-Proxys und Befugnisse

Upgrades von Token, Staking, AnnualGovernance, Lens und OliveAssembly erfordern die Autorisierung des Timelock-Eigentümers. Der OperatorSafe plant administrative Änderungen über das 24-Stunden-Timelock. AnnualGovernance und OliveAssembly lehnen Upgrades während aktiver Zyklen zusätzlich ab.

Jährliche Zuteilungsabstimmungen laufen nach dem NFT-registrierten Quadratwurzel-Modell. Der voteAdmin-Safe startet Zyklen; erlaubnisfreie Aufrufer bereiten Stimmzettel vor und führen Ergebnisse aus. Dies überträgt den jährlichen Wählern keine Upgrade-Befugnis über das Protokoll. Eine umfassendere DAO-Kontrolle bleibt ein künftiger Schritt.

### 7.2 Fest codiert und gesteuert

**Fest codierte oder vertragsseitige Einschränkungen (Änderung erfordert gegebenenfalls ein Upgrade):**

- Vierfach-Aufteilung: 88% / 10% / 1% / 1%
- 10-jähriger Emissionsplan (Änderung alle 2 Jahre): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Semantik der Admin-Sperren (nur erhöhbar, automatisches Schrumpfen)
- Einziger Minter in OBNToken
- Richtlinie zum Selbst-Staking gemeinnütziger Organisationen
- Atomaritätsgarantien der Bootstrap-Migration
- Von Vertragsansichten bereitgestellte Beitragsbuchführung

**Gesteuert (kein Upgrade nötig, sofern eine bestimmte Implementierung es nicht erfordert):**

- Pools hinzufügen (`addPool(charityWallet)`)
- Bootstrap-Stakes aus der gemeinnützigen Seed-Reserve oder einer autorisierten Community-Finanzierungsquelle ausführen
- AnnualGovernance-Zyklen über den voteAdmin-Safe starten; AnnualGovernanceV2 leitet die Stimmzettelmitgliedschaft über erlaubnisfreie Stapel ab, nicht durch freie Auswahl
- Künftige Phasen lückenlos anfügen (`addPhase`)
- Pools stilllegen oder entfernen
- Ausgaben- und Verwendungsberichte für TheOffering und ExtendOliveBranch
- Standards für Onboarding, Delisting, Ersatz und Migration gemeinnütziger Organisationen

### 7.3 Governance

Die Governance kann verwalten, welche gemeinnützigen Organisationen aufgenommen werden, doch die Standardannahme sollte sein, dass OBN um gemeinnützige Pools herum zentriert bleibt.

### 7.4 AnnualGovernance

AnnualGovernance ist der On-Chain-Mechanismus für die wiederkehrenden Community-Entscheidungen von OBN und bietet definierte, vertraglich durchgesetzte Zyklen für TheOffering und ExtendOliveBranch.

**Zyklusstruktur:**

Jeder Zyklus beginnt, wenn der voteAdmin ihn eröffnet. Phase 1 und Phase 2 laufen nacheinander.

- **Phase 1 (Verbrennen oder Geben):** Berechtigte registrierte Staker stimmen über die Zuteilung von TheOffering zu Zyklusbeginn ab. BURN verringert das Angebot dauerhaft. GIVE überträgt diese Zuteilung an ExtendOliveBranch und erhöht die gemeinnützige Ausschüttung dieses Zyklus.
- **Phase 2 (Auswahl der gemeinnützigen Organisation):** Staker stimmen ab, welcher genehmigte gemeinnützige Pool die feste Zykluszuteilung von ExtendOliveBranch erhält. Stimmzettel-Stapel durchsuchen berechtigte Pool-IDs und validieren deren Charity-Wallets gegen die in ExtendOliveBranch über `setApprovedNonprofit` geführte Whitelist.

**Auflösung bei Stimmengleichheit:**

- Phase 1: BURN gewinnt standardmäßig — GIVE muss die Stimmensumme von BURN strikt übersteigen, um zu gewinnen. Ein Gleichstand (oder gar keine Stimmen) wird als BURN gewertet.
- Phase 2: Die gemeinnützige Organisation mit den meisten Stimmen gewinnt; bei Gleichstand gewinnt die mit dem niedrigsten Stimmzettelindex. Werden keine Stimmen abgegeben, wird das Guthaben in den nächsten Zyklus übertragen, statt ausgeschüttet zu werden.

**Integrität der Abstimmung:**

- Beim Snapshot des vorherigen Blocks sind ein registriertes OliveNFT und mindestens 1 OBN aggregierter Stake erforderlich. Die Stimmkraft ist die Quadratwurzel des Snapshot-Stakes, und beide Phasen verwenden denselben Anspruch (Abschnitt 3.6).
- AnnualGovernanceV2 hat keine harte Pool- oder Stimmzettel-Obergrenze. Jede Vorbereitungstransaktion verarbeitet höchstens 100 Pool-IDs; diese Arbeitsgrenze ist keine Mitgliedschaftsgrenze. Phase 2 wartet auf den Abschluss der Vorbereitung.
- Der Safe startet den Zyklus einmal; erlaubnisfreie Keeper-Aufrufe bereiten den Stimmzettel vor und führen Phasenübergänge aus. Phase 2 erhält volle 30 Tage ab der tatsächlichen Abrechnung von Phase 1.

**Ausführung:**

AnnualGovernance ruft `TheOffering.burn()`, `TheOffering.sendToExtend()` oder `ExtendOliveBranch.distributeFromGovernance()` direkt auf. Nach Abschluss einer Abstimmung ist keine zusätzliche Multisig-Genehmigung erforderlich — das Ergebnis wird vom Vertrag durchgesetzt.

**Upgrade-Fähigkeit:**

AnnualGovernance ist ein UUPS-Proxy. Das Timelock kann ihn mit der Reifung der DAO aktualisieren, um anspruchsvollere Abstimmungsmechanismen (Delegation, Quorum-Anforderungen, zeitgewichtete Stimmkraft) zu unterstützen.

---

## 8) Sicherheitsmodell

### 8.1 Grundprinzipien

- **Checks-Effects-Interactions:** Zustandsaktualisierungen vor externen Aufrufen
- **Reentrancy-Schutz:** nonReentrant auf allen verändernden Pfaden
- **SafeERC20:** Für alle Token-Transfers verwendet
- **Präzisionsmathematik:** Math.mulDiv für genaue Berechnungen
- **Keine unbegrenzten Schleifen:** Endpunkte pro Pool, begrenzte Aktualisierungen

### 8.2 Härtung

**Atomare Operationen:** Bootstrap-Migration, Pool-Entfernung und erzwungener Ausstieg werden alle atomar abgeschlossen.

**Bewahrung der Belohnungen:** Explizite Prüfung, dass ausstehende Belohnungen während der Migration erhalten bleiben (bis auf 1 wei Toleranz).

**Überlaufschutz für Sperren:** NewLock ≤ userBalance wird vor dem Setzen gesperrter Beträge durchgesetzt.

**Treasury-Rückfallebene:** Festhängende Belohnungen werden an treasury umgeleitet, statt verloren zu gehen.

**Notfallkontrollen:** Der erzwungene Ausstieg ermöglicht der Governance, Nutzer in Notfällen zu retten.

### 8.3 Design-Abwägungen

Gleicher APR hält den Fokus auf Wirkung statt auf APR-Spielerei.

Charity-Minting pro Aktion ist atomar, erfordert aber bei jeder Aktion einen Mint (Gas-Abwägung).

Das Anfügen von Phasen zentralisiert einen gewissen Ermessensspielraum; timelock + DAO-Abstimmung mildern dies.

AnnualGovernance entscheidet in jedem Zyklus durch transparente, rechenschaftspflichtige Community-Abstimmungen über die Guthaben von TheOffering und ExtendOliveBranch.

---

## 9) Transparenz und Berichterstattung

### 9.1 Ereignisse

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 Ansichten

**OBNStakingLens (kanonische Analyse-Leseschicht):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Proof-of-Contribution-Berichterstattung

Die Proof-of-Contribution-Berichterstattung sollte zu einer der wichtigsten Transparenzebenen von OBN werden.

Künftige Dashboards können Folgendes zeigen:

- gesamte an gemeinnützige Organisationen beigetragene OBN
- gesamte beigetragene OBN nach Pool
- gesamter jedem Nutzer zurechenbarer OBN-Beitrag
- lebenslange Beitragshistorie nach Wallet
- Nutzerbeitrag über mehrere gemeinnützige Pools hinweg
- Top-Pools nach Beitrag
- aktive Staker pro Pool
- aktuell gestakte OBN pro Pool
- Charity-Emissionen im Zeitverlauf
- Ansammlung, Verbrennungshistorie und Geben-Historie von TheOffering nach Zyklus
- Ansammlung und gemeinnützige Ausschüttungshistorie von ExtendOliveBranch nach Zyklus
- AnnualGovernance-Abstimmungsergebnisse nach Zyklus

Diese Berichte sollen Nutzern helfen zu verstehen, nicht nur was sie verdient haben, sondern auch, was ihre Teilnahme mit hervorgebracht hat.

### 9.4 Offenlegungen

OBN sollte regelmäßige öffentliche Berichte veröffentlichen, die Folgendes abdecken:

- Guthaben der gemeinnützigen Seed-Reserve, Seed-Einsätze und die separate Protokollreserve
- ausgeführte Bootstraps
- Status gemeinnütziger Pools
- Hinzufügungen, Entfernungen oder Migrationen von Pools
- direkte gemeinnützige Ausschüttungen
- Guthaben, Ansammlung und Verwendung von TheOffering und ExtendOliveBranch nach Zyklus
- Proof-of-Contribution-Kennzahlen

---

## 10) Nutzerreise

1. **OBN erwerben** — Nutzer erwerben OBN über verfügbare Liquiditätsquellen.
2. **Gemeinnützigen Pool nach Anliegen wählen** — Der APR ist zu jedem Zeitpunkt in allen Pools gleich, daher wählen Nutzer nach Mission statt nach Renditeunterschieden.
3. **Staken** — Nutzer staken mit `deposit`, staken mit `depositFor` für eine andere Adresse oder verwenden Permit, wo es unterstützt wird.
4. **Belohnungen verdienen** — Nutzer verdienen den Staker-Anteil der Emissionen.
5. **Beitrag erzeugen** — Die gewählte gemeinnützige Organisation erhält ihren protokolldefinierten Anteil, wenn Nutzer mit dem Pool interagieren.
6. **Proof-of-Contribution aufbauen** — Der Nutzerbeitrag kann über Pools und im Zeitverlauf nachverfolgt werden.
7. **Nicht gesperrtes Kapital jederzeit abheben** — Bootstrap-Sperren gelten nicht für gewöhnliche Nutzer-Stakes.
8. **Über TheOffering abstimmen** — Registrieren Sie vor Zyklusbeginn ein OliveNFT in OliveAssembly und staken Sie mindestens 1 OBN. Berechtigte Wallets stimmen in Phase 1 ab, ob die feste Zuteilung von TheOffering verbrannt oder an ExtendOliveBranch gesendet wird.
9. **Über ExtendOliveBranch abstimmen** — Dieselben berechtigten Wallets stimmen dann ab, welche genehmigte gemeinnützige Organisation die feste Zykluszuteilung von ExtendOliveBranch erhält.

OBN ist so gestaltet, dass Nutzer nicht zwischen Verdienen und Beitragen wählen müssen. Beides geschieht durch dieselbe Protokollaktion.

---

## 11) Token-Angebot und Verteilung

**Anfangsangebot:** 1,000,000,000 OBN.

**Historische Genesis-Verteilung (bei initialize; nicht die aktuellen Reserveguthaben):**

- 40% Liquidität
- 30% Airdrop
- 10% ursprüngliche gemeinnützige Zuteilung
- 10% Treasury
- 10% Team (an TeamVesting; ~4 Monate Cliff, ~20 Monate lineares Vesting)

Die gemeinnützige Seed-Reserve hat eine Gesamtzuteilung von **300M OBN**, wobei **50M OBN** separat für Protokollbedarf gehalten werden. Treasury- und Airdrop-Bestände wurden in die Seed-Zuteilung konsolidiert. Zu diesem Zeitpunkt hatten 11M OBN bereits 11 gemeinnützige Seeds finanziert, sodass 289M OBN für 289 weitere Seeds zu je 1M OBN verblieben.

**Laufende Ausgabe:** Nur über Staking-Emissionen; der Staking-Vertrag ist der einzige Minter.

**Belohnungsaufteilung der Emissionen:**

- 88% Staker
- 10% gewählter gemeinnütziger Pool
- 1% ExtendOliveBranch (jährliche gemeinnützige Ausschüttung)
- 1% TheOffering (jährliche Abstimmung über Verbrennen oder Geben)

**Freiwillige Verbrennung:** Über burn für künftige Senken verfügbar.

---

## 12) Roadmap (unverbindlich)

### 12.1 Keimung

- Das grundlegende Protokollkonzept ausarbeiten
- Die Smart Contracts entwickeln und testen
- OBNToken und OBNStakingPools auf Base bereitstellen
- Das erste Frontend starten
- Anfangsliquidität bereitstellen
- Frühe Airdrop-Kampagnen durchführen
- Farcaster und Base-native Nutzerabläufe integrieren
- Mit der öffentlichen Indexierung von Wallets gemeinnütziger Organisationen beginnen
- Das erste Proof-of-Contribution-Narrativ etablieren

### 12.2 Vegetation

- Erweiterte Beitragsverfolgung im Frontend umsetzen
- Proof-of-Contribution-Dashboards erstellen
- Berichtsseiten gemeinnütziger Organisationen verbessern
- Jahreszyklen mit den bereitgestellten AnnualGovernanceV2 und OliveAssembly betreiben, mit Community-Registrierung, Abstimmung und erlaubnisfreier Abrechnung
- Lehrmaterialien produzieren
- Weitere gemeinnützige Organisationen aufnehmen
- Partnerschaften erkunden
- Wo möglich wesentliche Mitwirkende einstellen
- Sicherheitsaudits durch Dritte einholen
- Rechts- und Governance-Arbeit abschließen
- DAO-Backend/-Frontend entwickeln und testen

### 12.3 Blüte

- DAO bereitstellen und die Governance an die Community übergeben
- Upgrade-Befugnis über timelock-Governance übertragen
- voteAdmin von AnnualGovernance mit reifender Governance an eine DAO-kontrollierte Adresse übertragen
- Das gemeinnützige Netzwerk pflegen
- Frontend um DAO-Funktionen erweitern
- Werkzeuge für Beitragsreputation und Berichterstattung ausbauen
- Das Protokoll pflegen und anpassen, wenn sich die Bedürfnisse des Gemeinwohls entwickeln

---

## 13) Anhang — Wichtige Funktionen

### OBNStakingPools

**Verändernde Nutzerfunktionen:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (nur charityFund)
- `charityFundBootstrap(pid, amount, beneficiary)` (nur charityFund)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — Nur aufrufende Wallet

**Delegierte Ausführung:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — Nur Executor; erfordert aktuelle Zustimmung und aktuellen Monat; 1–32 streng aufsteigende Pool-IDs

**Verändernde Admin-Funktionen:**

- `claimFor(pid, user)` (nur Eigentümer; unabhängig von der Autoclaim-Zustimmung)
- `setAutoClaimExecutor(executor)` (nur Eigentümer; null pausiert die Automatisierung)
- `initializeV931(executor)` (nur Eigentümer, einmaliger Reinitializer während des Upgrades)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (nur charityFund)
- `setVersion(newVersion)` (nur Eigentümer)
- `upgradeTo(newImplementation, data)` (nur Eigentümer, Governance-kompatibel)

**Ansichten:**

- `pendingRewards(pid, user)` — BRUTTO ausstehender Betrag
- `pendingRewardsMultiple(pids[], user)` — Ausstehende Beträge für mehrere Pools plus Summe
- `autoClaimExecutor()` — Autorisiertes Smart-Konto für die Automatisierung
- `autoClaimPreference(user)` — Zustimmung und Zustimmungs-Nonce
- `currentAutoClaimMonth()` — UTC-Jahr × 12 + Monat (Januar = 1)
- `lastAutoClaimMonth(pid, user)` — Monat der letzten erfolgreichen automatischen Beanspruchung
- `unlockedBalance(pid, user)` — Zum Abheben verfügbar
- `stakeElapsed(user)` — Gesamte Staking-Sekunden
- `poolLength()` — Anzahl der Pools
- `charityContributedByUserInPool(pid, user)` — Gemeinnützige Beiträge des Nutzers in einem Pool
- `totalCharityContributedByUser(user)` — Gesamte gemeinnützige Beiträge des Nutzers über alle Pools

Anzeige- und Analyseansichten wie `getGlobalStats`, `getPoolStats`, `getUserPoolView`, `getUserStats` und `getPoolAPR` werden über **OBNStakingLens** als kanonische Frontend-Leseschicht bereitgestellt.

### OBNToken

**Verändernde Funktionen:**

- `setMinterOnce(minter)` (nur Eigentümer, einmalig)
- `mint(to, amount)` (nur Minter)
- Standard-ERC20: `transfer`, `approve`, `transferFrom`
- Unterstützung für `permitAndCall` (EIP-2612)
- `burn(amount)` — Freiwillige Verbrennung
- `delegate(delegatee)` — Stimmdelegation (ERC20Votes)

**Ansichten:**

- Standard-ERC20: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**Verändernde Funktionen:**

- `release()` — Gibt gevestete Token an teamWallet frei
- `updateTeamWallet(newWallet)` (nur Eigentümer)
- `rescueERC20(token, amount)` (nur Eigentümer, ohne den gevesteten Token)

**Ansichten:**

- `vestedAmount(timestamp)` — Gesamtes Vesting zu einem Zeitpunkt
- `claimableNow()` — Aktuell beanspruchbar
- `timeUntilCliff()` — Countdown bis zum Cliff
- `timeUntilNextRelease()` — Countdown bis zur nächsten Freigabe
- `nextReleaseTimestamp()` — Zeitpunkt der nächsten Freigabe

### TheOffering

**Verändernde Governance-Funktionen:**

- `burn(amount)` (nur governance) — Verbrennt die feste Zykluszuteilung nach einer BURN-Abstimmung
- `sendToExtend(amount)` (nur governance) — Sendet die feste Zykluszuteilung nach einer GIVE-Abstimmung an ExtendOliveBranch

**Verändernde Admin-Funktionen:**

- `setGovernance(newGovernance)` (nur timelockOwner) — Verbindet oder aktualisiert die Governance-Adresse; `address(0)` pausiert sie
- `emergencySweep(token, to)` (nur timelockOwner)

### ExtendOliveBranch

**Verändernde Ausschüttungsfunktionen:**

- `distribute(nonprofit, amount)` (timelockOwner oder governance) — Mit Whitelist-Prüfung
- `distributeFromGovernance(nonprofit, amount)` (nur governance) — Whitelist-Prüfung absichtlich ausgelassen; der Empfänger wurde bei der Vorbereitung seines Stimmzettel-Stapels bereits validiert und festgeschrieben

**Verändernde Admin-Funktionen:**

- `setApprovedNonprofit(nonprofit, approved)` (nur timelockOwner) — Verwaltet die Ausschüttungs-Whitelist
- `setGovernance(newGovernance)` (nur timelockOwner)
- `emergencySweep(token, to)` (nur timelockOwner)

**Ansichten:**

- `approvedNonprofit(nonprofit)` — Whitelist-Status

### AnnualGovernance

**Verändernde Funktionen des Abstimmungsadmins:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (nur voteAdmin) — Beide Dauern müssen 2,592,000 Sekunden (30 Tage) betragen; erstellt einen Snapshot von Berechtigung, Stake und Fondszuteilungen, friert die Pool-Anzahlgrenze ein und bereitet den ersten Stimmzettel-Stapel vor

**Verändernde Nutzerfunktionen:**

- `castOfferingVote(cycleId, burn)` — Stimme in Phase 1
- `castNonprofitVote(cycleId, nonprofit)` — Stimme in Phase 2

**Erlaubnisfreie Ausführung:**

- `prepareBallot(cycleId, maxPools)` verarbeitet 1 bis 100 Pool-IDs pro Aufruf während Phase 1
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — Treibt unvollständige Stimmzettelvorbereitung voran oder rechnet die bereite Phase ab; jeder kann sie aufrufen

**Eigentümer-Administration (Timelock):**

- `cancelCycle(cycleId)` — Nur vor der Ausführung von Phase 1
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)` (veraltete Kompatibilitätseinstellung; begrenzt die V2-Stimmzettelmitgliedschaft nicht)

**Ansichten:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` meldet Fortschritt und Abschluss der Vorbereitung
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` melden feste monetäre Zuteilungen
- `getCurrentVoterInfo(user)` meldet die aktuelle Berechtigung, die sich vom Snapshot eines bestehenden Zyklus unterscheidet
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` melden Beteiligung und bestätigte Abrechnung
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — Zyklusspezifische NFT-Berechtigung und Quadratwurzel-Stimmkraft; gibt Stimmkraft und Checkpoint-Bootstrap-Status zurück

### OliveAssembly

- `deposit(tokenId)` registriert ein genehmigtes OliveNFT pro Wallet in der Verwahrung von Assembly
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` erlauben vom Einzahler kontrollierte Abhebungen ohne Sperrfrist
- `registeredTokenId(user)` / `registeredCount()` melden aktuelle Registrierungen; die Anzahl impliziert keine Staking-Berechtigung
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` melden historische Registrierungs-Snapshots

### OBNStakingLens

Schreibgeschützte Analyseschicht; hält keine Mittel. Bildet aus StakingPoolsV93 entfernte Anzeige-/Analyseansichten nach — alle Schreibaufrufe bleiben auf OBNStakingPools.

**Ansichten:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — Rohe Staking-Stimmkraft mit Checkpoints, ohne NFT-Berechtigung oder Quadratwurzel-Gewichtung; verwenden Sie für die jährliche Abstimmung `getVotingPowerForCycle` von AnnualGovernanceV2

**Admin:**

- `upgradeToAndCall(newImplementation, data)` (nur Eigentümer)

---

## 14) Schlusswort

Wenn wir die Finanzschienen für künftige Generationen entwerfen, sollten wir bereit sein, eine bessere Frage zu stellen:

Können diese Schienen helfen, eine bessere Welt zu schaffen?

Krypto hat uns etwas gegeben, das es zuvor nicht gab: die Fähigkeit, Verhalten in Geld zu programmieren. Ein digitaler Vermögenswert muss nicht mehr stillstehen. Er kann sich nach Regeln bewegen. Er kann nach Regeln belohnen. Er kann Wert nach Regeln leiten. Er kann mehr werden als etwas, das Menschen kaufen, verkaufen und worauf sie spekulieren.

Das sollte etwas bedeuten.

Das Olive Branch Network entstand aus der Überzeugung, dass programmierbares Geld nicht gleichgültig sein sollte. Wenn wir Token so gestalten können, dass sie Liquidität belohnen, Netzwerke sichern, Treasuries finanzieren und Governance antreiben, dann können wir sie auch so gestalten, dass sie Organisationen unterstützen, die in der Welt nachweislich Gutes tun.

OBN ist der Versuch zu beweisen, dass Beiträge direkt in den Vermögenswert selbst eingebaut werden können.

Nutzer müssen ihr Kapital nicht opfern, um teilzunehmen. Sie müssen keine separate Spende leisten. Sie müssen nicht zwischen Verdienen und Helfen wählen. Wenn Nutzer staken, verdienen sie. Wenn sie beanspruchen, empfangen gemeinnützige Organisationen. Wenn das Netzwerk wächst, wächst die Beitragsebene mit.

Das ist Proof-of-Contribution.

Das Protokoll ist im Kern bewusst einfach: Nutzer staken in gemeinnützige Pools, Belohnungen werden per Vertrag aufgeteilt, und ein Teil der Emissionen wird an reale Anliegen geleitet. Die fest codierte Belohnungsaufteilung hält das System ehrlich. ExtendOliveBranch gibt der Community einen wiederkehrenden Weg, zusätzliche gemeinnützige Finanzierung zu lenken. TheOffering bietet Stakern eine jährliche Wahl zwischen dem Verbrennen von Angebot und dem Ausweiten von mehr Wert an gemeinnützige Organisationen.

OBN ist nicht um Abschöpfung herum aufgebaut. Es ist um Ausrichtung herum aufgebaut.

Nutzer werden für ihre Teilnahme belohnt. Gemeinnützige Organisationen erhalten fortlaufende Unterstützung. Die Governance entscheidet, wie mit den jährlichen Protokollströmen verfahren wird. Jede Aktion hinterlässt eine transparente On-Chain-Aufzeichnung.

Das ist nicht nur ein Staking-Protokoll.

Es ist ein Beitragsmotor.

Es ist eine Gemeinwohlebene.

Es ist der ernsthafte Versuch, eine Frage zu beantworten, der Krypto zu lange ausgewichen ist:

Wenn wir Geld so programmieren können, dass es fast alles tut, warum programmieren wir es dann nicht so, dass es Gutes tut?

Jeder Stake wird zum Beweis.

Jede Beanspruchung erzeugt eine Aufzeichnung.

Jeder Pool steht für ein Anliegen.

Und jedes Jahr entscheidet die Community, wie weit sie den Olivenzweig reicht.

---

## Anhang B — Bereitgestellte Verträge (Base Mainnet)

Diese Referenz beschreibt das Staking-Verhalten von V9.3.1 und das am 7. Oktober 2026 (Base-Block 52283807) aktivierte AnnualGovernanceV2-Upgrade. Die Governance-Überarbeitung ändert die Staking-Version nicht. Bereitstellungstransaktionen, Proxy-Aktivierung und Dienstaktivierung werden im [operativen Release-Protokoll](../governance-operations/2026-09-24-staking-v931-autoclaim-record.json) nachverfolgt.

Verwenden Sie den Staking-Proxy für Einzahlungen, Beanspruchungen, Abhebungen und Zustimmungsänderungen. `MonthlyAutoClaimUpgradeable` ist in die V9.3.1-Implementierung kompiliert und nicht separat bereitgestellt.

| Vertrag | Typ | Adresse | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | NFT-registrierte Quadratwurzel-Abstimmung mit stapelweiser Stimmzettelvorbereitung; aktualisiert am 7. Oktober 2026. Verwenden Sie für Interaktionen den obigen Proxy. | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Netzwerk:** Base Mainnet (Chain ID: 8453)

**Wichtige Hinweise:**

- OBNToken und OBNStakingPools verwenden das UUPS-Proxy-Muster für von der Governance kontrollierte Upgrades
- TeamVesting und OBNTimeLock sind konstruktionsbedingt nicht upgradefähig
- TheOffering und ExtendOliveBranch sind konstruktionsbedingt nicht upgradefähig
- Alle Admin-Funktionen auf UUPS-Proxys laufen über OBNTimeLock (24 Stunden Verzögerung) mittels des 2-of-3 OPERATOR_SAFE

---

**Version:** 9.3.1 Proof-of-Contribution / AnnualGovernanceV2-Governance-Überarbeitung

**Datum:** 13. Oktober 2026

**Kanonisches Repository:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

# Olive Branch Network 백서 — Proof-of-Contribution

[English](WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · **한국어** · [日本語](WHITEPAPER.ja.md) · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · [Português](WHITEPAPER.pt.md) · [Español](WHITEPAPER.es.md) · [Bahasa Indonesia](WHITEPAPER.id.md)

> 이 번역본은 편의를 위해 제공됩니다. 영어 원본([WHITEPAPER.md](WHITEPAPER.md))이 공식 문서이며, 내용이 다를 경우 영어 원본이 우선합니다. 이 번역본은 리비전 `3c740d855`을 바탕으로 AI의 도움을 받아 작성되었으며 아직 전문 번역가의 검토를 거치지 않았습니다. 컨트랙트 이름, 함수 이름, 주소는 영어 그대로 표기합니다.

## 목적

Olive Branch Network는 일상적인 온체인 참여를 비영리단체를 위한 지속적인 자금으로 전환하는 동시에 참여한 사용자에게 보상을 제공하도록 설계된 Proof-of-Contribution 스테이킹 프로토콜입니다. 사용자는 비영리단체별 풀에 OBN을 스테이킹하여 스테이킹 발행량을 받고, 그 발행량의 정해진 일부가 현실 세계의 대의로 전달되도록 돕습니다.

목표는 사용자에게 수익과 기여 중 하나를 선택하게 하는 것이 아닙니다. 목표는 하나의 프로토콜 행동으로 두 가지가 모두 이루어지게 하는 것입니다.

OBN은 스테이킹 활동이 사용자가 지지하는 대의와 연결된 투명한 온체인 기록을 만들어 내는 기여 계층을 도입합니다. 모든 스테이킹, 수령, 비영리단체 분배, 거버넌스 투표, 소각, 연간 배분은 추적하고 검증하며 그 위에 무언가를 구축할 수 있는 공개 시스템의 일부가 됩니다.

이것이 Proof-of-Contribution의 기반입니다. 디지털 자산이 투기, 수익, 거버넌스뿐 아니라 측정 가능한 기여에도 사용되는 모델입니다.

이 문서는 프로토콜 아키텍처, 토큰 경제, 비영리 풀 모델, 거버넌스 구조, 업그레이드 경로, 보안 가정, 그리고 OBN을 통해 비영리단체를 지원하는 전체 과정을 정의합니다.

---

## 1) 요약

**미션:** 스테이킹 발행량의 고정된 일부를 승인된 비영리 풀 지갑으로 자동적이고 투명하며 온체인에서 검증 가능하게 전달함으로써, 기여를 가장 쉬운 길로 만듭니다.

**핵심 아이디어:** OBN은 **Proof-of-Contribution**을 중심으로 구축되었습니다. 이는 사용자가 자본을 스테이킹하는 것뿐 아니라 현실 세계의 비영리 대의로 가치가 흘러가도록 지속적으로 도움으로써 참여를 증명하는 모델입니다. 모든 스테이킹, 수령, 비영리 보상 흐름은 온체인 기여 계층의 일부가 됩니다.

**메커니즘:** 사용자는 비영리단체별 풀에 OBN을 스테이킹합니다. 발행량 분할은 하드코딩되어 있습니다. 스테이커 88%, 비영리단체 직접 지급 10%, ExtendOliveBranch 1%(연간 비영리 분배), TheOffering 1%(연간 소각 또는 기부 투표)입니다.

**설계상의 보장:**

- 컨트랙트 수준의 고정된 4분할(88/10/1/1)
- 특정 시점에 모든 풀의 토큰당 APR 동일(설계상 풀 APR이 평준화됨)
- 온체인 비영리 자금 흐름과 사용자 기여 뷰를 통한 Proof-of-Contribution 회계
- 풀마다 charityWallet 하나; 풀에 "retire/active" 플래그 없음
- 관리자 잠금은 증가만 가능하고 잔액이 줄면 자동으로 축소되며, 부트스트랩 전용임
- 단일 민터: setMinterOnce 이후에는 스테이킹 컨트랙트만 OBN을 민팅할 수 있음
- 10년에 걸쳐 감소하는 일정을 가진 타임스탬프 기반 발행 단계
- 비영리단체 자체 스테이킹 방지, 풀 수명 주기 관리, 원자적 부트스트랩 마이그레이션, 긴급 강제 퇴장 제어

**거버넌스 및 업그레이드 가능성:** Token, Staking, AnnualGovernance, Lens, OliveAssembly는 Timelock이 소유한 UUPS 프록시입니다. AnnualGovernanceV2는 2026년 10월 7일부터 운영 중이며, NFT 등록과 스냅샷 스테이크가 연간 배분에 대한 제곱근 투표권을 결정합니다. 더 폭넓은 DAO 통제는 향후의 거버넌스 단계로 남아 있습니다.

---

## 2) Proof-of-Contribution

### 2.1 Proof-of-Contribution의 의미

Proof-of-Contribution은 OBN의 핵심 정체성입니다.

기존 스테이킹 시스템에서 사용자는 자본을 잠그고 수익을 얻음으로써 참여를 증명합니다. OBN은 이 스테이킹 기반을 유지하면서 두 번째 계층을 더합니다. 모든 사용자 행동이 비영리 풀에 자금을 제공하는 데에도 도움이 됩니다. 즉 참여는 투기, 소유, 수익 추출만으로 측정되지 않습니다. 기여로도 측정됩니다.

사용자가 비영리 풀에 OBN을 스테이킹할 때, 단순히 어디에서 보상을 받을지 선택하는 것이 아닙니다. 자신의 참여가 어떤 대의를 지원할지 선택하는 것입니다. 보상을 수령하면 프로토콜은 비영리단체 몫을 선택된 풀의 charityWallet으로 자동으로 민팅합니다. 그 결과, 일상적인 프로토콜 참여에서 생성된 투명한 온체인 기여 기록이 남습니다.

따라서 OBN은 스테이킹을 기여 메커니즘으로 전환합니다.

### 2.2 이것이 중요한 이유

대부분의 크립토 프로토콜은 유동성, 거래량, 가격, 사용자 수, TVL로 성공을 측정합니다. OBN은 이러한 지표를 유지하면서 또 하나의 중요한 척도를 더합니다. 바로 네트워크가 공익 단체로 얼마나 많은 가치를 전달하는가입니다.

이는 다른 유형의 네트워크 효과를 만듭니다.

- 더 많은 사용자가 더 많은 스테이킹 활동을 만듭니다
- 더 많은 스테이킹 활동이 더 많은 발행량을 만듭니다
- 더 많은 발행량이 더 많은 비영리 자금을 만듭니다
- 더 많은 비영리 자금이 더 눈에 보이는 임팩트를 만듭니다
- 더 눈에 보이는 임팩트가 프로토콜의 정체성과 신뢰성을 강화합니다

Proof-of-Contribution은 사익과 공익을 일치시킵니다. 사용자는 수익을 얻고 비영리단체는 자금을 받으며, 프로토콜은 사용자에게 별도의 기부를 요구하지 않고도 투명한 기여 내역을 쌓을 수 있습니다.

### 2.3 온체인 정체성 계층으로서의 기여

OBN은 다음을 포함한 기존 및 향후 프로토콜 뷰를 통해 기여를 추적할 수 있습니다.

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- 풀 수준의 자선 분배
- 각 비영리단체 지갑으로 민팅된 총 charity 금액
- 스테이킹 기간과 참여 내역

이러한 지표를 통해 프로토콜은 향후 기여 대시보드, 사용자 임팩트 프로필, 비영리단체 보고 페이지, 거버넌스 도구를 구축할 수 있습니다. 시간이 지나면 Proof-of-Contribution은 사용자가 네트워크에 어떻게 참여했고 어떤 대의를 지원했는지 보여 주는 정체성 계층이 될 수 있습니다.

이를 위해 사용자가 수익을 희생할 필요는 없습니다. 프로토콜은 수익과 기여가 같은 행동으로 이루어지도록 설계되었습니다.

---

## 3) 컨트랙트 구성

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**표준:** ERC20, EIP-2612 Permit, ERC20Votes(체크포인트 투표권), Burnable.

**핵심 기능:**

- **ERC20Upgradeable:** 표준 토큰 전송, 승인, 잔액
- **ERC20PermitUpgradeable:** 가스 없는 승인을 위한 EIP-2612 permit()
- **ERC20VotesUpgradeable:** 거버넌스를 위한 체크포인트 투표권(투표 위임, 과거 조회)
- **ERC20BurnableUpgradeable:** 사용자가 자발적으로 토큰을 소각할 수 있음
- **UUPSUpgradeable:** 소유자 승인으로 업그레이드 가능
- **OwnableUpgradeable:** 이전 가능한 단일 소유자

초기 공급량 1,000,000,000 OBN의 **과거 제네시스 민팅(initialize 시 1회)**. 이 최초 민팅 대상은 현재 미사용 준비금 배분을 나타내지 않습니다.

- 40% 유동성 — DEX 풀 부트스트랩용
- 30% 에어드롭 — 커뮤니티 초기 분배
- 10% 최초 자선 배분
- 10% 트레저리 — 프로토콜 거버넌스 및 운영용
- 10% 팀 — 클리프와 베스팅 일정이 있는 TeamVesting 컨트랙트로

전체 분배는 `initialize()`에 하드코딩되어 원자적으로 이루어지며, 제네시스 중 추가 민팅은 없습니다.

**단일 민터 모델(엄격한 규칙):**

- `setMinterOnce(address minterAddr)`는 정확히 하나의 민터(스테이킹 컨트랙트)를 설정하며 한 번만 호출할 수 있습니다
- `setMinterOnce` 호출 후에는 컨트랙트를 업그레이드하지 않는 한 민터를 변경할 수 없습니다
- 민터만 `mint(to, amount)`를 호출하여 스테이킹 보상을 분배할 수 있습니다
- 이 하드코딩된 제약은 임의 발행 위험을 제거하고 예측 가능한 토큰 공급을 보장합니다

**업그레이드 게이트:** `_authorizeUpgrade`가 소유자로 제한된 UUPS(부트스트랩 이후 DAO가 통제할 예정).

**투표 위임:** 사용자는 `delegate(delegatee)`로 자신의 투표권을 지정할 수 있습니다(ERC20Votes 패턴).

**왜 이런 구조인가?**
1회성 분배는 초기 공급량에 대한 모호함을 없앱니다. 단일 민터는 임의 발행 위험을 제거합니다. ERC20Votes는 토큰을 DAO 통제에 맞추고 향후 거버넌스를 가능하게 합니다. 소각 기능은 향후 통합을 위한 자발적 흡수 장치를 제공합니다. Permit 지원(EIP-2612)은 별도의 승인 트랜잭션을 없애 UX를 개선합니다.

### 3.2 OBNStakingPools (타임스탬프 단계, 풀별 회계, UUPS)

**하드코딩된 보상 분할(BPS):**

- STAKER_BPS = 8_800 → 88% 사용자에게
- CHARITY_BPS = 1_000 → 10% 자선 지갑으로(직접, 행동별)
- CHARITY_FUND_BPS = 100 → 1% ExtendOliveBranch로
- TREASURY_BPS = 100 → 1% TheOffering으로

`charityFund` 주소는 **ExtendOliveBranch**로, `treasury` 주소는 **TheOffering**으로 연결됩니다. 두 곳 모두 각 연간 주기 동안 OBN을 적립합니다. AnnualGovernance는 각 주기 종료 시 커뮤니티 투표를 통해 두 잔액을 처리합니다. 컨트랙트 세부 사항은 3.4–3.6절을 참조하십시오.

**발행 단계(배포 시 초기화):**

- 0–2년차: 10.00% APY
- 2–4년차: 7.50% APY
- 4–6년차: 5.00% APY
- 6–8년차: 2.50% APY
- 8–10년차: 1.25% APY

거버넌스는 향후 단계를 연속적으로 추가할 수 있으며, 이전 단계는 변경 불가능합니다.

**풀별 동일 APR:** 구조상 토큰당 APR은 어떤 풀을 선택하는지가 아니라 활성 단계에만 좌우됩니다.

**Proof-of-Contribution 회계:** 스테이킹 컨트랙트는 사용자 및 풀 기여 뷰를 제공하여, 각 사용자의 참여에 귀속되는 비영리 자금 규모를 프로토콜이 계산할 수 있게 합니다.

**데이터 모델:** PoolInfo { address charityWallet; uint256 totalStaked; } (풀당 지갑 하나).

#### 3.2.1 핵심 사용자 행동

**범위가 제한된 풀별 엔드포인트:**

- `deposit(pid, amount)` — 풀에 OBN 스테이킹
- `depositFor(pid, amount, beneficiary)` — 다른 주소를 대신하여 스테이킹
- `depositWithPermit(...)` — ERC20 Permit으로 스테이킹(별도 승인 불필요)
- `withdraw(pid, amount)` — 잠기지 않은 잔액 출금
- `claim(pid)` — 대기 중인 보상 수령
- `claimFor(pid, user)` — 다른 주소를 대신한 수령(소유자 전용)
- `claimMultiple(pids[])` — 한 트랜잭션으로 여러 풀의 대기 보상 수령
- `setAutoClaimEnabled(bool)` — 호출 지갑의 모든 풀에 대한 동의 설정
- `autoClaimFor(pids[], user, month, consentNonce)` — 전담 실행자가 승인된 월간 배치를 제출

스테이커는 자신의 지갑이 보유한 현재 및 향후 모든 풀에 대해 후원형 월간 자동 수령에 온체인으로 동의할 수 있습니다. 자동화 계정은 수령 가능한 사용자 보상이 양수인 풀을 트랜잭션당 최대 32개까지 묶고, 구성된 페이마스터를 통해 가스를 지불합니다. 컨트랙트는 UTC 달력 월마다 풀당 한 번의 성공적인 자동 수령을 허용합니다. 보상은 수동 수령과 동일한 88% / 10% / 1% / 1% 분할을 따르며 같은 수령자에게 전달됩니다. 사용자는 언제든지 동의를 철회할 수 있으며 예치, 출금, 수동 수령은 계속 가능합니다. 자동 수령은 원금을 이전하거나 보상을 복리화하거나 투표권을 변경하지 않습니다.

동의를 변경하면 이전에 대기 중인 요청은 무효화됩니다. 다시 활성화해도 월간 한도는 초기화되지 않습니다. UTC 달력 월은 이동하는 30일 간격이 아니며, 수동 수령은 자동 허용량을 소비하지 않습니다. 풀은 정수 반올림 후 사용자 몫이 양수이면 적격이며, 서비스 수준의 최소 보상 기준은 없습니다. 옵트인 또는 옵트아웃 트랜잭션의 후원 여부는 지갑 지원에 따라 달라집니다. 소유자 전용 `claimFor`는 자동 수령 동의와 무관합니다. 배포 및 활성화 상태는 부록 B에 기록되어 있습니다.

자동 수령 설정은 스테이킹 주소에 연결되며 향후의 신원 또는 투표 자격 시스템과 분리되어 있습니다. 실행자는 보상의 방향을 바꾸거나, 사용자의 스테이크를 출금하거나, 동의를 변경할 수 없습니다.

**자선 메커니즘:**

- 보상의 10%는 사용자 행동(수령, 예치, 출금)마다 해당 풀의 charityWallet으로 직접 민팅됩니다
- 1%는 ExtendOliveBranch에 지속적으로 적립되며, 커뮤니티는 주기마다 어떤 승인된 비영리단체가 해당 주기의 고정 배분액을 받을지 투표합니다
- 1%는 TheOffering에 지속적으로 적립되며, 커뮤니티는 주기마다 주기 시작 시 확정된 배분액을 소각할지 ExtendOliveBranch에 기부할지 투표합니다
- 글로벌 TVL 버퍼 없음; 원자적 실행을 위해 행동별로 분할이 이루어집니다

#### 3.2.2 풀 수명 주기 관리

**종료 메커니즘:**

- `shutdownPool(pid)` — 새로운 예치를 차단하며 수령과 출금은 계속됩니다
- 풀을 제거하지 않고 사용자가 질서 있게 퇴장할 수 있게 합니다
- 스테이커를 위해 풀 데이터가 그대로 유지됩니다

**풀 제거:**

- `removePool(pid)` — 풀이 완전히 비었을 때(totalStaked == 0) 소프트 삭제
- PID 재색인 없음; 하위 호환성 유지
- **트레저리 안전장치:** 제거 전에 레거시 charity가 적립되어 있으면 풀의 charityWallet으로 내보내고, 지갑이 영 주소이면 treasury로 돌립니다
- 제거 후 사용자가 수령해도 보상 손실을 방지합니다

#### 3.2.3 비영리단체 자체 스테이킹 방지

**정책:** 비영리단체는 영구 잠금된 부트스트랩 예치를 정확히 한 번만 받을 수 있습니다. 그 밖의 모든 자체 스테이킹은 차단됩니다.

**적용:** `_enforceCharitySelfStakePolicy` 함수는 다음을 확인합니다.

- 수혜자가 풀의 자선 지갑인가?
- 그렇다면, charityFund에서 온 것이고 잠겨 있으며 현재 잔액이 0인가?
- 모두 참이면 허용합니다(최초 부트스트랩). 그렇지 않으면 거부합니다.

**근거:** 풀 보상 역학을 깨뜨리거나 공격을 가능하게 할 수 있는 비영리단체의 우발적 또는 악의적 자체 스테이킹을 방지합니다.

#### 3.2.4 원자적 부트스트랩 마이그레이션

**함수:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**원자성 보장:**

- 대기 보상 보존(1 wei 허용 오차까지 검증)
- 오버플로 방지와 함께 잠금 금액을 안전하게 복사
- 동일 트랜잭션에서 자선 지갑을 원자적으로 업데이트
- 이전 사용자의 풀 카운터 비활성화
- 풀에 처음 스테이킹하는 경우 새 사용자 활성화

**사전 조건:**

- oldNonprofit이 풀의 현재 자선 지갑임
- oldNonprofit ≠ newNonprofit
- oldNonprofit의 스테이크가 0이 아님
- newNonprofit이 이 풀에 아직 스테이크가 없음

**목적:** 보상 손실이나 고착 없이 비영리단체 포지션을 원활히 이전할 수 있게 합니다(예: 주소 침해, 지갑 교체).

#### 3.2.5 긴급 강제 퇴장

**함수:** `forceExitUserToSelf(pid, user, claimRewards)` (소유자 전용, nonReentrant)

**동작:**

- 잠금을 무시하고 사용자를 풀에서 강제 퇴장시킵니다
- 원금을 즉시 사용자에게 반환합니다
- 선택적으로 대기 보상을 사용자에게 민팅합니다
- 잠금, 보상 부채, 활성 스테이커 카운터를 정리합니다

**사용 사례:** 사용자 복구가 필요한 풀 제거 시의 긴급 거버넌스 제어로, 풀이 종료된 후 사용됩니다.

#### 3.2.6 자선 지갑 업데이트

**함수:** `updateCharityWallet(pid, newWallet)` (소유자 전용)

**허용 사항:** 풀의 자선 주소 업데이트(예: 침해되었거나 새 주소로 교체하는 경우).

**추적 방법:** CharityWalletUpdated 이벤트.

#### 3.2.7 잠금 관리

**함수:** `setLockedAmount(pid, user, amount)` (charityFund 전용)

**규칙:**

- 증가하거나 유지만 가능하며 절대 감소할 수 없습니다
- 사용자의 잔액을 초과할 수 없습니다
- 잔액이 잠금 금액 아래로 떨어지면 잠금이 자동으로 축소됩니다
- 부트스트랩 예치 전용입니다

**관측 가능성:**

분석 읽기는 프런트엔드와 대시보드를 위한 표준 읽기 계층인 **OBNStakingLens**(3.7절)를 통해 제공됩니다. 잠금 및 잔액 읽기는 스테이킹 컨트랙트에 직접 남아 있습니다.

- `pendingRewards(pid, user)` — 대기 중인 총액(GROSS) 반환
- `pendingRewardsMultiple(pids[], user)` — 여러 풀의 대기 금액과 합계 반환
- `unlockedBalance(pid, user)` — 잔액에서 잠금을 뺀 값 반환
- `stakeElapsed(user)` — 총 스테이킹 시간(초)(언스테이킹 후에도 유지)
- `charityContributedByUserInPool(pid, user)` — 풀에서 사용자에게 귀속되는 민팅된 총 charity
- `totalCharityContributedByUser(user)` — 모든 풀에서 사용자에게 귀속되는 민팅된 총 charity

OBNStakingLens의 전체 뷰(getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor)는 3.7절을 참조하십시오.

### 3.3 TeamVesting (선형, 클리프 있음; 업그레이드 불가)

**클리프:** 약 4개월; **기간:** 이후 약 20개월 선형.

**`release()`:** 베스팅된 토큰을 teamWallet으로 스트리밍합니다.

**헬퍼:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**안전장치:** 베스팅 토큰은 회수할 수 없으며, 잘못 들어온 ERC20만 회수할 수 있습니다.

### 3.4 TheOffering (업그레이드 불가)

TheOffering은 프로토콜의 연간 소각-또는-기부 금고입니다. 스테이킹 컨트랙트는 1% treasury 발행 슬롯을 이 주소로 보냅니다. OBN은 각 연간 주기 내내 지속적으로 적립됩니다.

각 주기가 끝나면 AnnualGovernance는 커뮤니티의 1단계 투표 결과를 실행합니다.

- **BURN:** 주기 시작 시 확정된 배분액이 영구적으로 소각되어 OBN 총공급량이 줄어듭니다.
- **GIVE:** 주기 시작 시 확정된 배분액이 ExtendOliveBranch로 이전되어 해당 주기의 비영리 분배가 늘어납니다.

**접근 제어:** `timelockOwner`(Timelock)는 `emergencySweep`을 포함한 관리 기능을 제어합니다. `governance`(AnnualGovernance)는 `burn()` 또는 `sendToExtend()`를 호출할 수 있는 유일한 주소입니다. `governance` 주소는 `address(0)`로 초기화되며 Timelock을 통해 `setGovernance()`로 AnnualGovernance에 연결됩니다.

**업그레이드 불가:** TheOffering은 프록시 없는 표준 컨트랙트로 배포됩니다. 생성자 인수(`obn` 토큰 주소, `timelockOwner`)는 변경할 수 없습니다. 교체가 필요하면 Timelock이 새 컨트랙트를 배포하고 스테이킹 프록시에서 `setTreasury(newAddress)`를 호출하여 발행 경로를 변경해야 합니다.

### 3.5 ExtendOliveBranch (업그레이드 불가)

ExtendOliveBranch는 프로토콜의 연간 비영리 분배 금고입니다. 스테이킹 컨트랙트는 1% charityFund 발행 슬롯을 이 주소로 보냅니다. OBN은 지속적으로 적립되며, 커뮤니티가 1단계에서 GIVE에 투표하면 TheOffering의 기부도 받을 수 있습니다.

각 주기가 끝나면 AnnualGovernance는 커뮤니티의 2단계 투표를 실행합니다. 승리한 비영리 풀의 charityWallet이 ExtendOliveBranch의 고정된 주기 배분액을 단일 트랜잭션으로 받습니다.

**승인된 비영리단체 레지스트리:** ExtendOliveBranch는 승인된 수령 주소의 화이트리스트를 유지합니다. `setApprovedNonprofit(address, bool)`은 Timelock이 호출할 수 있습니다. 모든 풀 자선 지갑은 화이트리스트에 유지되며, 새 풀은 `schedule_addPool.js`를 통해 `addPool`과 함께 원자적으로 승인됩니다.

**분배:** `distributeFromGovernance(to, amount)`는 `governance` 주소만 호출할 수 있습니다. 금고는 이 경로에서 화이트리스트 검사를 반복하지 않습니다. AnnualGovernanceV2가 투표지 배치를 준비할 때 각 수령자를 검증하고, 선택된 투표지 구성원에게만 지급합니다.

**업그레이드 불가:** TheOffering과 동일한 불변성 보장입니다. 생성자 인수(`obn`, `timelockOwner`)는 변경할 수 없습니다.

### 3.6 AnnualGovernanceV2 (운영 중인 구현; 기존 UUPS 프록시)

AnnualGovernance는 TheOffering과 ExtendOliveBranch 모두에 대한 연간 의사결정 주기를 조정합니다. Timelock이 소유한 기존 UUPS 프록시는 [리포지토리 배포 문서](README.md#annual-governance)에 기록된 대로 **2026년 10월 7일, Base 블록 52283807**에서 AnnualGovernanceV2로 업그레이드되었습니다. OliveAssembly는 새로운 투표 규칙을 위한 체크포인트 NFT 등록을 제공합니다. 배포 자체는 연간 주기를 시작하지 않습니다.

**주기 구조:** 각 연간 주기는 두 개의 순차적인 단계로 진행됩니다.

1. **1단계 — 소각 또는 기부:** 자격을 갖춘 등록 스테이커가 주기 시작 시 확정된 TheOffering의 배분액에 투표합니다. 승리한 결과는 원자적으로 실행됩니다. BURN은 `TheOffering.burn()`을, GIVE는 `TheOffering.sendToExtend()`를 호출합니다.

2. **2단계 — 비영리단체 선택:** 자격을 갖춘 등록 스테이커가 ExtendOliveBranch의 주기 시작 배분액과 해당 주기의 GIVE 이전액(있는 경우)을 어떤 승인된 비영리단체가 받을지 선택합니다. 이후 수령액은 다음 주기를 위해 남습니다. 투표지에 엄격한 상한은 없습니다. 허가 없는 배치가 호출당 최대 100개의 풀 ID를 오름차순으로 처리하며, 완전히 제거된 풀을 제외하고 자선 지갑 중복을 제거합니다. 종료된 풀은 완전히 제거될 때까지 적격 상태를 유지합니다. 승리한 charityWallet은 `ExtendOliveBranch.distributeFromGovernance()`를 통해 고정 배분액을 받습니다.

**동점 처리:**

- 1단계: GIVE는 득표 합계가 BURN을 엄격히 초과할 때만 승리합니다. 정확한 동점 또는 참여 없음은 BURN으로 결정됩니다.
- 2단계: 득표 합계가 가장 높은 비영리단체가 승리하며, 동점이면 투표지에서 가장 앞에 있는 단체가 승리합니다. 투표가 전혀 없으면 잔액은 분배되지 않고 다음 주기로 이월됩니다.

**투표 무결성:**

- 자격 요건은 OliveAssembly에 등록된 OliveNFT 하나와 주기 시작 전 `block.number - 1` 시점의 총 스테이킹 잔액 최소 1 OBN입니다. 두 단계는 해당 스냅샷을 공유합니다. 이후의 등록이나 스테이킹은 해당 주기의 투표권을 늘릴 수 없고, 이후의 출금은 해당 권리를 지우지 않습니다.
- 투표권은 스냅샷 스테이크의 제곱근입니다. 100 OBN을 스테이킹하면 10 투표권 단위를 얻습니다. 컨트랙트는 `floor(sqrt(stakeInWei)) * 1e9`를 계산하며 18자리 소수 단위로 표현합니다. 지갑의 추가 NFT는 투표권을 더하지 않으며, V2 이전의 과거 주기는 원래의 선형 가중치를 유지합니다.
- voteAdmin Safe는 Timelock 지연 없이 1단계를 직접 시작하고 첫 투표지 배치를 준비합니다. 누구나 준비를 이어 가고 각 단계를 정산할 수 있습니다. 1단계는 정확히 30일간 지속되며 투표지 준비가 완료될 때까지 정산할 수 없습니다. 2단계는 1단계의 실제 정산 시점부터 온전히 30일을 갖습니다.

**실행:** AnnualGovernance는 TheOffering과 ExtendOliveBranch를 직접 호출합니다. 투표가 종료되면 추가 멀티시그 승인이 필요 없으며, 결과는 컨트랙트가 강제합니다.

**업그레이드 가능성:** AnnualGovernance는 UUPS 프록시입니다. DAO가 성숙함에 따라 더 정교한 투표 메커니즘(위임, 정족수 요건, 시간 가중 투표)을 Timelock이 관리하는 업그레이드를 통해 추가할 수 있습니다.

**준비 시점:** 투표자 자격과 스테이크는 이전 블록 스냅샷을 사용하며, 자금 잔액과 풀 내역 길이는 Safe의 시작 트랜잭션에서 확정됩니다. 각 풀의 지갑/제거 상태와 각 신규 수령자의 승인 여부는 해당 배치가 실행될 때 읽습니다. 이후의 풀 ID는 제외되며, 이미 포함된 수령자는 이후 승인이 철회되더라도 고정됩니다. 승인되지 않은 수령자는 해당 배치를 되돌리며, Timelock은 1단계 정산 전에 구성을 수정하거나 주기를 취소해야 합니다. 준비 중에는 비영리단체 구성 변경을 피하십시오.

**운영 매개변수와 안전장치:** `owner` = Timelock; `voteAdmin` = OperatorSafe. 레거시 `maxBallotSize` 저장소는 호환성을 위해 유지되지만 구성원을 제한하지 않습니다. Governance와 OliveAssembly 업그레이드는 준비 기간을 포함한 활성 주기 내내 차단됩니다. 취소는 1단계 실행 전에만 가능합니다. 배분액은 분리 보관이 아니라 기존 금고 내의 회계상 예약이며, 부족분은 정산이 성공하기 전에 보충되어야 합니다.

**OliveAssembly 등록:** Assembly 프록시가 OliveNFT를 전송하도록 승인한 다음 `deposit(tokenId)`를 호출하여 등록합니다. Assembly는 지갑당 NFT 하나를 보관하며, 등록은 출금할 때까지 주기를 넘어 유지됩니다. 예치자는 잠금 기간 없이 `withdraw()`, `withdrawTo(recipient)`, `withdrawExpected(tokenId, recipient)`를 사용할 수 있습니다. 등록된 NFT는 관리자가 출금할 수 없습니다. NFT 등록은 고유한 인간 신원을 입증하지 않습니다.

### 3.7 OBNStakingLens (UUPS 프록시)

OBNStakingLens는 읽기 전용 분석 전용 컨트랙트입니다. 프런트엔드, 대시보드, 오프체인 분석 도구를 위한 표준 읽기 계층입니다. 분석 읽기를 별도의 업그레이드 가능한 프록시로 통합하면 스테이킹 컨트랙트의 외부 표면을 최소하고 안정적으로 유지하면서 분석 기능을 독립적으로 발전시킬 수 있습니다.

**주요 뷰:**

- `getGlobalStats()` — 풀 수, 총 TVL, 고유 스테이커 수, 현재 초당 보상
- `getPoolStats(pid)` — 풀별 통계: 자선 지갑, 스테이킹 금액, 스테이커 수, 누산기 상태
- `getUserPoolView(pid, user)` — 사용자별 스테이킹 데이터: 잔액, 잠금, 대기 보상, 활성 상태
- `getPoolAPR(pid)` — 풀의 스테이커 몫에 대한 현재 APR
- `pendingCharityFor(pid, user)` — 사용자에게 귀속되는 대기 비영리 기여 추정치

**접근 제어:** `owner`(Timelock)가 업그레이드를 제어합니다. Lens는 뷰 전용 호출자로서 스테이킹 프록시를 읽으며 자체적으로 변경 가능한 상태를 갖지 않습니다.

**초기화:** `initialize(stakingPools, timelock)` — 스테이킹 프록시 주소와 Timelock 소유자를 설정합니다.

---

## 4) 토큰 경제와 장기 지속 가능성

### 4.1 발행 수학(직관)

단계 APR 기준을 B(BPS 단위), 글로벌 TVL을 G, 풀 TVL을 P라고 합시다.

**풀에 대한 연간 총액:** YearlyPoolGross = P × (B / 10,000)

**스테이커는 그중 88%를 받고,** 나머지는 비영리단체 charityWallet(10%), ExtendOliveBranch(1%), TheOffering(1%)으로 전달됩니다.

**토큰당 APR은** 0.88 × (B / 10,000)**로 단순화되며, 풀 전체에서 동일합니다** — 공급 규모와 무관합니다.

### 4.2 감소하는 발행량이 지속 가능성을 뒷받침합니다

**매도 압력 감소:** 시간이 지나며 발행량이 줄어 구조적 매도 압력이 감소합니다.

**대의 기반 수요:** 프로토콜은 사용자, 비영리단체, 장기적 네트워크 신뢰성 사이에 지속적인 일치를 만듭니다.

**TVL 신뢰성:** 부트스트랩 잠금이 지속적인 TVL을 만들어 신뢰와 가격 발견을 개선합니다.

**예측 가능성:** 분할과 단계가 온체인에 있으므로 참여자는 장기 계획을 세울 수 있습니다.

**기여 내역:** Proof-of-Contribution은 또 다른 형태의 프로토콜 가치를 더합니다. 사용자 참여를 통해 생성된 공익 자금의 투명한 증거입니다.

### 4.3 발행 분할의 최소주의(1% + 1%)

사용자는 88%를 받고, 비영리단체 직접 자금이 10%를 차지하며, 나머지 2%는 ExtendOliveBranch와 TheOffering에 적립됩니다. 각각은 커뮤니티 거버넌스 투표를 통해 매년 처리됩니다.

거버넌스로 적립되는 흐름을 각각 1%로 유지하면 프로토콜이 간결하고 사용자와 자선 중심으로 유지됩니다. 어느 흐름도 몰래 방향을 바꿀 수 없으며, 둘 다 AnnualGovernance를 통해 온체인에서 투명하게 관리됩니다.

### 4.4 연간 거버넌스 흐름(1% + 1%)

두 1% 발행 흐름은 모두 AnnualGovernance가 관리하며 각각 명확한 목적이 있습니다. V2는 주기 시작 시 두 잔액을 확정하고, 2단계는 해당 주기의 GIVE 이전액만 더합니다. 이후 수령액은 다음 주기를 위해 남습니다.

**ExtendOliveBranch(발행량의 1%):** 각 연간 주기 내내 OBN을 지속적으로 적립합니다. 각 주기가 끝나면 스테이커는 AnnualGovernance 2단계에서 어떤 승인된 비영리 풀이 고정된 주기 배분액을 받을지 투표합니다. 이는 커뮤니티에 프로토콜 차원의 자원을 특정 대의로 향하게 하는 투명하고 반복적인 메커니즘을 제공합니다.

**TheOffering(발행량의 1%):** OBN을 지속적으로 적립합니다. 각 주기가 끝나면 스테이커는 AnnualGovernance 1단계에서 두 결과 중 하나를 선택합니다. 주기 시작 배분액을 BURN하거나(영구적 디플레이션) ExtendOliveBranch에 GIVE합니다(해당 주기의 비영리 분배에 추가). 이 투표는 커뮤니티에 공급 정책에 대한 지속적인 통제권을 부여하며, 프로토콜 TVL과 연간 적립액이 커질수록 더 중요한 결정이 됩니다.

전체 보상 구조:

- **행동별 10% 배분**은 모든 수령 시 선택된 풀의 charityWallet으로 직접 원자적으로 전달됩니다.
- **ExtendOliveBranch 1% 흐름**은 적립되어 거버넌스가 선택한 비영리단체에 매년 재분배됩니다.
- **TheOffering 1% 흐름**은 적립되어 소각되거나 그해의 비영리 분배에 추가됩니다.

### 4.5 소각 가능성(선택적 흡수 장치)

OBN은 스테이킹을 통해 인플레이션이 발생하지만, 자발적 소각(예: 향후 앱 수수료)이 발행량을 상쇄할 수 있으며 이는 탈중앙적이고 시장 주도적입니다.

---

## 5) 프로토콜 메커니즘과 근거

### 5.1 비영리 분배

**행동별 모델:** 모든 수령/예치/출금 시 사용자 대기 보상의 10%가 해당 풀의 charityWallet으로 직접 민팅됩니다.

**원자적 실행:** 외부 호출이나 글로벌 버퍼가 없으며, 모든 분할은 사용자의 트랜잭션 안에서 이루어집니다.

**배분 경합 없음:** 각 풀의 자선은 독립적이며 글로벌 재배분 함수가 없습니다.

**Proof-of-Contribution:** 자선 분배가 사용자 행동과 풀 선택에 연결되어 있으므로, 프로토콜은 기여를 특정 사용자와 비영리 풀에 귀속시킬 수 있습니다.

### 5.2 연간 거버넌스 흐름과 비영리 시드 준비금

**비영리 시드 준비금:** 300M OBN 배분이 각 1M OBN의 영구 스테이킹 비영리 시드에 자금을 제공합니다. 이는 지속적인 스테이킹 발행 및 연간 거버넌스 배분과 별개입니다. 준비금 회계는 11절을 참조하십시오.

**ExtendOliveBranch(지속 발행량의 1%):** 지속적으로 적립됩니다. AnnualGovernance 2단계 투표가 어떤 승인된 비영리단체가 고정 주기 배분액을 받을지 선택합니다. 프로토콜의 연간 지정 기여 메커니즘입니다.

**TheOffering(지속 발행량의 1%):** 지속적으로 적립됩니다. AnnualGovernance 1단계 투표가 주기 시작 배분액을 소각할지 ExtendOliveBranch에 기부할지 선택합니다. 프로토콜의 연간 공급 정책 메커니즘입니다.

이 세 가지 구분은 중요합니다.

- **10% 비영리 보상 몫**은 자동적이고 행동별이며 풀에 특정됩니다.
- **비영리 시드 준비금**은 배분된 보유분에서 부트스트랩 스테이크에 자금을 제공합니다.
- **1% + 1% 연간 거버넌스 흐름**은 커뮤니티 투표로 매년 처리되는 지속적인 발행량입니다.

### 5.3 영구 잠금(부트스트랩 전용; 증가만 가능)

**정책:** 관리자는 lockedAmount를 증가만 시킬 수 있고 절대 줄일 수 없습니다. 사용자의 잔액이 저장된 잠금 아래로 떨어지면 잠금은 자동으로 축소됩니다.

**목적:** 오직 부트스트랩 메커니즘을 위한 것입니다. 잠금은 시드 원금을 출금할 수 없게 하면서 수혜자가 첫날부터 수익을 얻을 수 있게 합니다. 이는 TVL 무결성을 지키고 시드 토큰의 즉각적인 대량 매도를 방지합니다.

**사용자 스테이크는 기본적으로 잠기지 않으며,** 사용자는 언제나 잠기지 않은 잔액을 출금할 수 있습니다.

### 5.4 발행 제어기 없음

단계가 발행량을 완전히 규정하며 외부 "비율 조절 장치"는 없습니다. DAO는 공지(timelock)와 함께 향후 단계를 연속적으로 추가할 수 있습니다.

---

## 6) 비영리단체: 지갑, 온보딩, 표시

### 6.1 풀당 지갑 하나

각 풀은 단일 charityWallet에 매핑됩니다. 이를 통해 라우팅이 결정적으로 유지되고 보고가 단순해집니다.

### 6.2 주소 우선 등재

저희는 신뢰할 수 있는 단체가 이미 공개한 이더리움 주소를 색인하여 플랫폼에 온보딩하고 있습니다.

또한 이메일과 전화로 단체에 연락하여 플랫폼에 대해 알리고 있습니다.

직접적인 관계나 공식적인 인정이 없는 한, 모든 자선 페이지에는 기본적으로 "제휴 없음 / 보증 아님" 배너가 명확히 표시됩니다.


### 6.3 부트스트랩 프로그램

**목표:** 새로 온보딩된 각 자선 단체가 첫날부터 수익을 얻고 풀이 신뢰할 수 있는 TVL로 시작하도록 합니다.

**자금 출처:** 300M OBN 비영리 시드 준비금이 비영리단체당 1M OBN의 부트스트랩 스테이크에 자금을 제공합니다. 준비금이 소진되면 커뮤니티 자금 시딩이 지속적인 온보딩을 지원하며, 풀 수에 엄격한 상한은 없습니다.

**메커니즘:**

1. 거버넌스 또는 승인된 실행자(ExtendOliveBranch로 설정된 `charityFund` 주소)가 `charityFundBootstrap(pid, amount, beneficiary)`를 호출하거나 해당되는 경우 `depositForWithLock(pid, amount, beneficiary)`를 사용합니다.
2. 부트스트랩 OBN은 해당 비영리단체의 풀/수혜자를 위해 스테이킹되고 영구적으로 잠깁니다.
3. 잠금은 시드 원금의 출금을 막아 즉각적인 대량 매도 위험을 없애는 한편, 포지션은 지속적으로 수익을 얻습니다.
4. 비영리단체는 잠긴 부트스트랩 포지션의 스테이커 몫 수익과 charityWallet으로 전달되는 풀의 10% 자선 배분을 모두 누립니다.

**보고:** 각 부트스트랩은 온체인에서 투명하며 정기 공개 자료에 포함됩니다.

**보호:** `_enforceCharitySelfStakePolicy`는 각 비영리단체가 잠긴 부트스트랩 포지션을 하나만 받도록 보장합니다. 향후 일반 스테이크는 외부 사용자에게서 나와야 하며, 비영리단체 지갑 마이그레이션은 프로토콜의 거버넌스 통제 마이그레이션 절차를 따라야 합니다.

### 6.4 등재 해제 정책

기준을 충족하지 못하면 프런트엔드에서 해당 비영리단체를 제거하고 그 풀의 홍보를 중단합니다.

사용자 스테이크와 대기 보상은 풀이 종료되고 프로토콜에서 제거되기 전에 사용자에게 반환되어야 합니다.

**풀 종료.** 비영리단체가 떠나면 해당 풀은 종료됩니다. 새로운 스테이크는 차단되지만 기존 스테이커는 계속 언스테이킹과 수령을 할 수 있으며, 남아 있는 스테이크는 통상적인 88/10/1/1 분배에 따라 계속 보상을 얻습니다. 풀을 제거하기 전에 남아 있는 모든 스테이커를 강제 퇴장시킵니다. `forceExitUserToSelf`는 각 스테이크를 대기 보상과 함께 해당 스테이커 본인의 지갑으로 반환하며, 다른 어디로도 보낼 수 없습니다. 비영리단체의 잠긴 시드 스테이크는 비영리 시드 준비금으로 반환됩니다. 그런 다음 스테이크가 전혀 남지 않았을 때에만 풀이 제거됩니다.

OBN은 라우팅 및 스테이킹 프로토콜이며, 등록된 비영리단체나 인증 기관이 아닙니다. 사용자는 단체를 독립적으로 확인하고 세무 전문가와 상담해야 합니다.

---

## 7) 거버넌스와 업그레이드 가능성

### 7.1 UUPS 프록시와 권한

Token, Staking, AnnualGovernance, Lens, OliveAssembly 업그레이드에는 Timelock 소유자의 승인이 필요합니다. OperatorSafe는 24시간 Timelock을 통해 관리 변경을 예약합니다. AnnualGovernance와 OliveAssembly는 활성 주기 중의 업그레이드도 추가로 거부합니다.

연간 배분 투표는 NFT 등록 기반 제곱근 투표 모델로 운영되고 있습니다. voteAdmin Safe가 주기를 시작하고, 허가 없는 호출자가 투표지를 준비하고 결과를 실행합니다. 이는 프로토콜 업그레이드 권한을 연간 투표자에게 이전하지 않습니다. 더 폭넓은 DAO 통제는 향후 단계로 남아 있습니다.

### 7.2 하드코딩 대 거버넌스 관리

**하드코딩 또는 컨트랙트 수준의 제약(해당하는 경우 변경하려면 업그레이드 필요):**

- 4분할: 88% / 10% / 1% / 1%
- 10년 발행 일정(2년마다 변경): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- 관리자 잠금 의미 체계(증가만 가능, 자동 축소)
- OBNToken의 단일 민터
- 비영리단체 자체 스테이킹 정책
- 부트스트랩 마이그레이션의 원자성 보장
- 컨트랙트 뷰로 제공되는 기여 회계

**거버넌스 관리(특정 구현에서 필요하지 않는 한 업그레이드 불필요):**

- 풀 추가(`addPool(charityWallet)`)
- 비영리 시드 준비금 또는 승인된 커뮤니티 자금원에서 부트스트랩 스테이크 실행
- voteAdmin Safe를 통해 AnnualGovernance 주기 시작; AnnualGovernanceV2는 재량적 선별이 아닌 허가 없는 배치를 통해 투표지 구성원을 도출
- 향후 단계를 연속적으로 추가(`addPhase`)
- 풀 종료 또는 제거
- TheOffering과 ExtendOliveBranch의 지출 및 사용 보고
- 비영리단체 온보딩, 등재 해제, 교체, 마이그레이션 기준

### 7.3 거버넌스

거버넌스는 어떤 비영리단체를 포함할지 관리할 수 있지만, 기본 가정은 OBN이 비영리 풀을 중심으로 유지된다는 것입니다.

### 7.4 AnnualGovernance

AnnualGovernance는 OBN의 반복적인 커뮤니티 결정을 위한 온체인 메커니즘으로, TheOffering과 ExtendOliveBranch에 대해 정의되고 컨트랙트로 강제되는 주기를 제공합니다.

**주기 구조:**

각 주기는 voteAdmin이 열 때 시작됩니다. 1단계와 2단계는 순차적으로 진행됩니다.

- **1단계(소각 또는 기부):** 자격을 갖춘 등록 스테이커가 TheOffering의 주기 시작 배분액에 투표합니다. BURN은 공급량을 영구적으로 줄입니다. GIVE는 그 배분액을 ExtendOliveBranch로 이전하여 해당 주기의 비영리 분배를 늘립니다.
- **2단계(비영리단체 선택):** 스테이커가 어떤 승인된 비영리 풀이 ExtendOliveBranch의 고정 주기 배분액을 받을지 투표합니다. 투표지 배치는 적격 풀 ID를 스캔하고 `setApprovedNonprofit`을 통해 ExtendOliveBranch에 유지되는 화이트리스트에 대해 자선 지갑을 검증합니다.

**동점 처리:**

- 1단계: BURN이 기본적으로 승리합니다. GIVE가 승리하려면 BURN의 득표 합계를 엄격히 초과해야 합니다. 동점(또는 투표 없음)은 BURN으로 결정됩니다.
- 2단계: 가장 많이 득표한 비영리단체가 승리하며, 동점이면 투표지 인덱스가 가장 낮은 단체가 승리합니다. 투표가 없으면 잔액은 분배되지 않고 다음 주기로 이월됩니다.

**투표 무결성:**

- 이전 블록 스냅샷 시점에 등록된 OliveNFT 하나와 총 스테이크 최소 1 OBN이 필요합니다. 투표권은 스냅샷 스테이크의 제곱근이며 두 단계는 동일한 권리를 사용합니다(3.6절).
- AnnualGovernanceV2에는 풀이나 투표지에 대한 엄격한 상한이 없습니다. 각 준비 트랜잭션은 최대 100개의 풀 ID를 처리하며, 이 작업 범위는 구성원 제한이 아닙니다. 2단계는 준비가 완료되기를 기다립니다.
- Safe는 주기를 한 번 시작하며, 허가 없는 키퍼 호출이 투표지를 준비하고 단계 전환을 실행합니다. 2단계는 1단계의 실제 정산 시점부터 온전히 30일을 갖습니다.

**실행:**

AnnualGovernance는 `TheOffering.burn()`, `TheOffering.sendToExtend()` 또는 `ExtendOliveBranch.distributeFromGovernance()`를 직접 호출합니다. 투표가 종료되면 추가 멀티시그 승인이 필요 없으며, 결과는 컨트랙트가 강제합니다.

**업그레이드 가능성:**

AnnualGovernance는 UUPS 프록시입니다. DAO가 성숙함에 따라 Timelock은 더 정교한 투표 메커니즘(위임, 정족수 요건, 시간 가중 투표권)을 지원하도록 이를 업그레이드할 수 있습니다.

---

## 8) 보안 모델

### 8.1 핵심 원칙

- **Checks-Effects-Interactions:** 외부 호출 전에 상태 업데이트
- **재진입 방지:** 모든 상태 변경 경로에 nonReentrant 적용
- **SafeERC20:** 모든 토큰 전송에 사용
- **정밀 수학:** 정확한 계산을 위한 Math.mulDiv
- **무제한 루프 없음:** 풀별 엔드포인트, 범위가 제한된 업데이트

### 8.2 강화

**원자적 작업:** 부트스트랩 마이그레이션, 풀 제거, 강제 퇴장은 모두 원자적으로 완료됩니다.

**보상 보존:** 마이그레이션 중 대기 보상이 보존되는지(1 wei 허용 오차까지) 명시적으로 검증합니다.

**잠금 오버플로 방지:** 잠금 금액을 설정하기 전에 NewLock ≤ userBalance를 강제합니다.

**트레저리 폴백:** 고착된 보상은 손실되지 않고 treasury로 전달됩니다.

**긴급 제어:** 강제 퇴장을 통해 거버넌스가 긴급 상황에서 사용자를 구제할 수 있습니다.

### 8.3 설계상의 절충

동일한 APR은 APR 게이밍이 아닌 임팩트에 초점을 맞추게 합니다.

행동별 자선 민팅은 원자적이지만 모든 행동마다 민팅이 필요합니다(가스 절충).

단계 추가는 어느 정도의 재량을 집중시키며, timelock + DAO 투표로 완화합니다.

AnnualGovernance는 매 주기 투명하고 책임 있는 커뮤니티 투표를 통해 TheOffering과 ExtendOliveBranch 잔액을 처리합니다.

---

## 9) 투명성과 보고

### 9.1 이벤트

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 뷰

**OBNStakingLens(표준 분석 읽기 계층):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Proof-of-Contribution 보고

Proof-of-Contribution 보고는 OBN의 가장 중요한 투명성 계층 중 하나가 되어야 합니다.

향후 대시보드는 다음을 보여 줄 수 있습니다.

- 비영리단체에 기여된 총 OBN
- 풀별로 기여된 총 OBN
- 각 사용자에게 귀속되는 총 OBN 기여
- 지갑별 평생 기여 내역
- 여러 비영리 풀에 걸친 사용자 기여
- 기여 기준 상위 풀
- 풀별 활성 스테이커
- 풀별 현재 스테이킹된 OBN
- 시간에 따른 자선 발행량
- 주기별 TheOffering 적립, 소각 내역, 기부 내역
- 주기별 ExtendOliveBranch 적립 및 비영리 분배 내역
- 주기별 AnnualGovernance 투표 결과

이러한 보고서는 사용자가 무엇을 벌었는지뿐 아니라 자신의 참여가 무엇을 만들어 내는 데 도움이 되었는지도 이해하도록 도와야 합니다.

### 9.4 공시

OBN은 다음을 다루는 정기 공개 보고서를 발행해야 합니다.

- 비영리 시드 준비금 잔액, 시드 배치, 별도의 프로토콜 준비금
- 실행된 부트스트랩
- 비영리 풀 상태
- 풀 추가, 제거 또는 마이그레이션
- 직접 자선 분배
- 주기별 TheOffering과 ExtendOliveBranch의 잔액, 적립, 사용
- Proof-of-Contribution 지표

---

## 10) 사용자 여정

1. **OBN 획득** — 사용자는 이용 가능한 유동성 공급원을 통해 OBN을 획득합니다.
2. **대의에 따라 비영리 풀 선택** — 특정 시점의 APR은 풀 전체에서 동일하므로, 사용자는 수익 차이가 아닌 미션을 기준으로 선택합니다.
3. **스테이킹** — 사용자는 `deposit`으로 스테이킹하거나, `depositFor`로 다른 주소를 위해 스테이킹하거나, 지원되는 경우 Permit을 사용합니다.
4. **보상 획득** — 사용자는 발행량의 스테이커 몫을 받습니다.
5. **기여 생성** — 사용자가 풀과 상호작용할 때 선택된 비영리단체가 프로토콜이 정의한 몫을 받습니다.
6. **Proof-of-Contribution 구축** — 사용자 기여는 풀 전체와 시간에 걸쳐 추적될 수 있습니다.
7. **잠기지 않은 원금은 언제든 출금** — 부트스트랩 잠금은 일반 사용자 스테이크에 적용되지 않습니다.
8. **TheOffering 투표** — 주기가 시작되기 전에 OliveAssembly에 OliveNFT 하나를 등록하고 최소 1 OBN을 스테이킹합니다. 적격 지갑은 1단계에서 TheOffering의 고정 배분액을 소각할지 ExtendOliveBranch로 보낼지 투표합니다.
9. **ExtendOliveBranch 투표** — 그런 다음 동일한 적격 지갑이 어떤 승인된 비영리단체가 ExtendOliveBranch의 고정 주기 배분액을 받을지 투표합니다.

OBN은 사용자가 수익과 기여 중 하나를 선택할 필요가 없도록 설계되었습니다. 둘 다 같은 프로토콜 행동으로 이루어집니다.

---

## 11) 토큰 공급과 분배

**초기 공급량:** 1,000,000,000 OBN.

**과거 제네시스 분배(initialize 시; 현재 준비금 잔액 아님):**

- 40% 유동성
- 30% 에어드롭
- 10% 최초 자선 배분
- 10% 트레저리
- 10% 팀(TeamVesting으로; 약 4개월 클리프, 약 20개월 선형 베스팅)

비영리 시드 준비금의 총 배분은 **300M OBN**이며, **50M OBN**은 프로토콜 필요를 위해 별도로 보유합니다. 트레저리와 에어드롭 보유분은 시드 배분으로 통합되었습니다. 그 시점에 11M OBN이 이미 11개 비영리 시드에 자금을 제공했으며, 각 1M OBN씩 289개의 추가 시드를 위한 289M OBN이 남았습니다.

**지속 발행:** 스테이킹 발행을 통해서만 이루어지며, 스테이킹 컨트랙트가 유일한 민터입니다.

**발행량에 대한 보상 분할:**

- 88% 스테이커
- 10% 선택된 비영리 풀
- 1% ExtendOliveBranch(연간 비영리 분배)
- 1% TheOffering(연간 소각 또는 기부 투표)

**자발적 소각:** 향후 흡수 장치를 위해 burn으로 이용할 수 있습니다.

---

## 12) 로드맵(참고용)

### 12.1 발아

- 기본 프로토콜 개념 수립
- 스마트 컨트랙트 구축 및 테스트
- OBNToken과 OBNStakingPools를 Base에 배포
- 초기 프런트엔드 출시
- 유동성 시딩
- 초기 에어드롭 캠페인 운영
- Farcaster 및 Base 네이티브 사용자 흐름 통합
- 공개 비영리단체 지갑 색인 시작
- 초기 Proof-of-Contribution 내러티브 확립

### 12.2 생장

- 프런트엔드에 확장된 기여 추적 구현
- Proof-of-Contribution 대시보드 구축
- 비영리단체 보고 페이지 개선
- 배포된 AnnualGovernanceV2와 OliveAssembly를 사용하여 연간 주기를 운영하고, 커뮤니티 등록, 투표, 허가 없는 정산 진행
- 교육 미디어 제작
- 추가 비영리단체 온보딩
- 파트너십 모색
- 가능한 경우 필수 기여자 채용
- 제3자 보안 감사 수행
- 법률 및 거버넌스 작업 완료
- DAO 백엔드/프런트엔드 구축 및 테스트

### 12.3 개화

- DAO를 배포하고 거버넌스를 커뮤니티에 이양
- timelock 거버넌스를 통해 업그레이드 권한 이전
- 거버넌스가 성숙함에 따라 AnnualGovernance voteAdmin을 DAO 통제 주소로 이전
- 비영리 네트워크 유지
- DAO 기능으로 프런트엔드 업데이트
- 기여 평판 및 보고 도구 확장
- 공익 수요의 변화에 맞춰 프로토콜 유지 및 조정

---

## 13) 부록 — 주요 함수

### OBNStakingPools

**사용자 변경 함수:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (charityFund 전용)
- `charityFundBootstrap(pid, amount, beneficiary)` (charityFund 전용)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — 호출 지갑 전용

**위임 실행:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — 실행자 전용; 현재 동의와 월 필요; 엄격히 오름차순인 풀 ID 1–32개

**관리자 변경 함수:**

- `claimFor(pid, user)` (소유자 전용; 자동 수령 동의와 무관)
- `setAutoClaimExecutor(executor)` (소유자 전용; 영 주소는 자동화를 일시 중지)
- `initializeV931(executor)` (소유자 전용, 업그레이드 중 1회성 reinitializer)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (charityFund 전용)
- `setVersion(newVersion)` (소유자 전용)
- `upgradeTo(newImplementation, data)` (소유자 전용, 거버넌스 호환)

**뷰:**

- `pendingRewards(pid, user)` — 대기 중인 총액(GROSS)
- `pendingRewardsMultiple(pids[], user)` — 여러 풀의 대기 금액과 합계
- `autoClaimExecutor()` — 승인된 자동화 스마트 계정
- `autoClaimPreference(user)` — 동의 및 동의 nonce
- `currentAutoClaimMonth()` — UTC 연도 × 12 + 월(1월 = 1)
- `lastAutoClaimMonth(pid, user)` — 마지막으로 성공한 자동 수령 월
- `unlockedBalance(pid, user)` — 출금 가능 금액
- `stakeElapsed(user)` — 총 스테이킹 시간(초)
- `poolLength()` — 풀 수
- `charityContributedByUserInPool(pid, user)` — 풀에서의 사용자 자선 기여
- `totalCharityContributedByUser(user)` — 모든 풀에 걸친 사용자의 총 자선 기여

`getGlobalStats`, `getPoolStats`, `getUserPoolView`, `getUserStats`, `getPoolAPR`과 같은 표시 및 분석 뷰는 프런트엔드 표준 읽기 계층인 **OBNStakingLens**를 통해 제공됩니다.

### OBNToken

**변경 함수:**

- `setMinterOnce(minter)` (소유자 전용, 1회)
- `mint(to, amount)` (민터 전용)
- 표준 ERC20: `transfer`, `approve`, `transferFrom`
- `permitAndCall` 지원(EIP-2612)
- `burn(amount)` — 자발적 소각
- `delegate(delegatee)` — 투표 위임(ERC20Votes)

**뷰:**

- 표준 ERC20: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**변경 함수:**

- `release()` — 베스팅된 토큰을 teamWallet으로 해제
- `updateTeamWallet(newWallet)` (소유자 전용)
- `rescueERC20(token, amount)` (소유자 전용, 베스팅 토큰 제외)

**뷰:**

- `vestedAmount(timestamp)` — 특정 시점의 총 베스팅량
- `claimableNow()` — 현재 수령 가능 금액
- `timeUntilCliff()` — 클리프 카운트다운
- `timeUntilNextRelease()` — 다음 해제 카운트다운
- `nextReleaseTimestamp()` — 다음 해제 시각

### TheOffering

**거버넌스 변경 함수:**

- `burn(amount)` (governance 전용) — BURN 투표 후 고정 주기 배분액 소각
- `sendToExtend(amount)` (governance 전용) — GIVE 투표 후 고정 주기 배분액을 ExtendOliveBranch로 전송

**관리자 변경 함수:**

- `setGovernance(newGovernance)` (timelockOwner 전용) — 거버넌스 주소를 연결 또는 업데이트; `address(0)`은 일시 중지
- `emergencySweep(token, to)` (timelockOwner 전용)

### ExtendOliveBranch

**분배 변경 함수:**

- `distribute(nonprofit, amount)` (timelockOwner 또는 governance) — 화이트리스트 적용
- `distributeFromGovernance(nonprofit, amount)` (governance 전용) — 화이트리스트 검사를 의도적으로 생략; 수령자는 투표지 배치 준비 시 이미 검증되고 고정됨

**관리자 변경 함수:**

- `setApprovedNonprofit(nonprofit, approved)` (timelockOwner 전용) — 분배 화이트리스트 관리
- `setGovernance(newGovernance)` (timelockOwner 전용)
- `emergencySweep(token, to)` (timelockOwner 전용)

**뷰:**

- `approvedNonprofit(nonprofit)` — 화이트리스트 상태

### AnnualGovernance

**투표 관리자 변경 함수:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (voteAdmin 전용) — 두 기간이 모두 2,592,000초(30일)여야 함; 자격, 스테이크, 자금 배분을 스냅샷하고 풀 수 경계를 고정하며 첫 투표지 배치를 준비

**사용자 변경 함수:**

- `castOfferingVote(cycleId, burn)` — 1단계 투표
- `castNonprofitVote(cycleId, nonprofit)` — 2단계 투표

**허가 없는 실행:**

- `prepareBallot(cycleId, maxPools)`는 1단계 동안 호출당 1–100개의 풀 ID를 처리합니다
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — 미완료된 투표지 준비를 진행하거나 준비된 단계를 정산하며, 누구나 호출할 수 있음

**소유자(Timelock) 관리:**

- `cancelCycle(cycleId)` — 1단계 실행 전에만 가능
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)` (레거시 호환 설정; V2 투표지 구성원을 제한하지 않음)

**뷰:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)`는 준비 진행 상황과 완료 여부를 보고합니다
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)`는 고정된 금전 배분을 보고합니다
- `getCurrentVoterInfo(user)`는 기존 주기 스냅샷과 구별되는 현재 자격을 보고합니다
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)`는 참여와 확정된 정산을 보고합니다
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — 주기별 NFT 자격과 제곱근 투표권; 투표권과 체크포인트 부트스트랩 상태를 반환

### OliveAssembly

- `deposit(tokenId)`는 Assembly 보관 하에 승인된 OliveNFT를 지갑당 하나 등록합니다
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)`는 잠금 기간 없이 예치자가 통제하는 출금을 허용합니다
- `registeredTokenId(user)` / `registeredCount()`는 현재 등록을 보고하며, 수는 스테이킹 자격을 의미하지 않습니다
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)`는 과거 등록 스냅샷을 보고합니다

### OBNStakingLens

읽기 전용 분석 계층이며 자금을 보유하지 않습니다. StakingPoolsV93에서 제거된 표시/분석 뷰를 재현하며, 모든 쓰기 호출은 OBNStakingPools에 남아 있습니다.

**뷰:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — NFT 자격이나 제곱근 가중치가 없는 원시 체크포인트 스테이킹 파워; 연간 투표에는 AnnualGovernanceV2의 `getVotingPowerForCycle`을 사용

**관리:**

- `upgradeToAndCall(newImplementation, data)` (소유자 전용)

---

## 14) 맺음말

우리가 미래 세대를 위한 금융 인프라를 설계하고 있다면, 더 나은 질문을 던질 준비가 되어 있어야 합니다.

그 인프라가 더 나은 세상을 만드는 데 도움이 될 수 있을까?

크립토는 이전에 존재하지 않았던 것을 주었습니다. 돈에 행동을 코딩하는 능력입니다. 디지털 자산은 더 이상 가만히 있을 필요가 없습니다. 규칙에 따라 움직일 수 있습니다. 규칙에 따라 보상할 수 있습니다. 규칙에 따라 가치를 전달할 수 있습니다. 사람들이 사고팔고 투기하는 대상 그 이상이 될 수 있습니다.

이는 중요한 일이어야 합니다.

Olive Branch Network는 프로그래밍 가능한 돈이 무관심해서는 안 된다는 믿음에서 만들어졌습니다. 유동성에 보상하고, 네트워크를 보호하고, 트레저리에 자금을 대고, 거버넌스를 구동하도록 토큰을 설계할 수 있다면, 세상에서 검증 가능한 선을 행하는 단체를 지원하도록 설계할 수도 있습니다.

OBN은 기여가 자산 자체에 직접 내장될 수 있음을 증명하려는 시도입니다.

사용자는 참여하기 위해 원금을 희생할 필요가 없습니다. 별도로 기부할 필요도 없습니다. 버는 것과 돕는 것 중 하나를 선택할 필요도 없습니다. 사용자가 스테이킹하면 수익을 얻습니다. 수령하면 비영리단체가 받습니다. 네트워크가 성장하면 기여 계층도 함께 성장합니다.

그것이 Proof-of-Contribution입니다.

프로토콜의 핵심은 의도적으로 단순합니다. 사용자는 비영리 풀에 스테이킹하고, 보상은 컨트랙트에 따라 분할되며, 발행량의 일부는 현실 세계의 대의로 전달됩니다. 하드코딩된 보상 분할은 시스템을 정직하게 유지합니다. ExtendOliveBranch는 커뮤니티가 추가적인 비영리 자금을 지정할 수 있는 반복적인 방법을 제공합니다. TheOffering은 스테이커에게 공급량을 소각할지 비영리단체로 더 많은 가치를 확장할지에 대한 연례 선택권을 제공합니다.

OBN은 추출을 중심으로 만들어지지 않았습니다. 일치를 중심으로 만들어졌습니다.

사용자는 참여에 대한 보상을 받습니다. 비영리단체는 지속적인 지원을 받습니다. 거버넌스는 연간 프로토콜 흐름을 어떻게 처리할지 결정합니다. 모든 행동은 투명한 온체인 기록을 남깁니다.

이것은 단순한 스테이킹 프로토콜이 아닙니다.

기여의 엔진입니다.

공익의 계층입니다.

크립토가 너무 오랫동안 피해 온 질문에 답하려는 진지한 시도입니다.

돈이 거의 무엇이든 하도록 코딩할 수 있다면, 왜 선을 행하도록 코딩하지 않는가?

모든 스테이킹은 증거가 됩니다.

모든 수령은 기록을 만듭니다.

모든 풀은 하나의 대의를 대표합니다.

그리고 매년 커뮤니티는 올리브 가지를 얼마나 멀리 내밀지 결정합니다.

---

## 부록 B — 배포된 컨트랙트(Base Mainnet)

이 참고 자료는 V9.3.1 스테이킹 동작과 2026년 10월 7일(Base 블록 52283807)에 활성화된 AnnualGovernanceV2 업그레이드를 설명합니다. 거버넌스 개정은 스테이킹 버전을 변경하지 않습니다. 배포 트랜잭션, 프록시 활성화, 서비스 활성화는 [운영 릴리스 기록](governance-operations/2026-09-24-staking-v931-autoclaim-record.json)에서 추적됩니다.

예치, 수령, 출금, 동의 변경에는 스테이킹 프록시를 사용하십시오. `MonthlyAutoClaimUpgradeable`은 V9.3.1 구현에 컴파일되어 있으며 별도로 배포되지 않습니다.

| 컨트랙트 | 유형 | 주소 | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | 배치형 투표지 준비를 갖춘 NFT 등록 제곱근 투표; 2026년 10월 7일 업그레이드. 상호작용에는 위의 프록시를 사용하십시오. | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**네트워크:** Base Mainnet (Chain ID: 8453)

**주요 참고 사항:**

- OBNToken과 OBNStakingPools는 거버넌스 통제 업그레이드를 위해 UUPS 프록시 패턴을 사용합니다
- TeamVesting과 OBNTimeLock은 설계상 업그레이드할 수 없습니다
- TheOffering과 ExtendOliveBranch는 설계상 업그레이드할 수 없습니다
- UUPS 프록시의 모든 관리 함수는 2-of-3 OPERATOR_SAFE를 통해 OBNTimeLock(24시간 지연)을 거칩니다

---

**버전:** 9.3.1 Proof-of-Contribution / AnnualGovernanceV2 거버넌스 개정

**날짜:** 2026년 10월 13일

**공식 리포지토리:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

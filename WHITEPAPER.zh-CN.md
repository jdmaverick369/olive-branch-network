# Olive Branch Network 白皮书 — Proof-of-Contribution

[English](WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · [한국어](WHITEPAPER.ko.md) · [日本語](WHITEPAPER.ja.md) · **简体中文** · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · [Português](WHITEPAPER.pt.md) · [Español](WHITEPAPER.es.md) · [Bahasa Indonesia](WHITEPAPER.id.md)

> 本译文仅为方便阅读而提供。英文版([WHITEPAPER.md](WHITEPAPER.md))为权威版本;如有差异,以英文版为准。本译文基于修订版本 `3c740d855`,在 AI 协助下完成,尚未经过专业译者审校。合约名称、函数名称和地址均保留英文原文。

## 宗旨

Olive Branch Network 是一种 Proof-of-Contribution 质押协议,旨在将日常的链上参与转化为对公益组织的持续资助,同时继续奖励参与的用户。用户将 OBN 质押到各公益组织专属的资金池中,赚取质押释放,并帮助将这些释放的一个既定比例输送给现实世界中的公益事业。

我们的目标不是让用户在赚取收益和作出贡献之间二选一,而是让两者通过同一个协议操作同时实现。

OBN 引入了一个贡献层,质押活动会在其中产生与用户所支持事业相关联的透明链上记录。每一次质押、领取、公益分配、治理投票、销毁和年度分配,都会成为一个可被追踪、验证并在其上继续构建的公开系统的一部分。

这就是 Proof-of-Contribution 的基础:在这种模式下,数字资产不仅用于投机、收益或治理,也用于可衡量的贡献。

本文定义了协议架构、代币经济、公益资金池模型、治理结构、升级路径、安全假设,以及通过 OBN 支持公益组织的端到端流程。

---

## 1) 执行摘要

**使命:** 将质押释放的固定比例自动、透明且可在链上验证地输送到经批准的公益资金池钱包,让贡献成为阻力最小的路径。

**核心理念:** OBN 围绕 **Proof-of-Contribution** 构建:在这种模式下,用户不仅通过质押资本来证明参与,还通过持续帮助将价值输送给现实世界的公益事业来证明参与。每一次质押、领取和公益奖励流都会成为链上贡献层的一部分。

**机制:** 用户将 OBN 质押到各公益组织专属的资金池。释放分配比例已硬编码:88% 归质押者,10% 直接归公益组织,1% 归 ExtendOliveBranch(年度公益分配),1% 归 TheOffering(年度销毁或捐赠投票)。

**设计保证:**

- 合约层面固定的四方分配(88/10/1/1)
- 在任一时刻,所有资金池的每枚代币 APR 相同(资金池 APR 按设计趋于一致)
- 通过链上公益资金流和用户贡献视图实现 Proof-of-Contribution 核算
- 每个资金池一个 charityWallet;资金池没有 "retire/active" 标记
- 管理员锁定只增不减,余额下降时自动缩减;仅用于引导阶段
- 单一铸造者:在 setMinterOnce 之后,只有质押合约可以铸造 OBN
- 基于时间戳的释放阶段,采用 10 年递减计划
- 公益组织自质押防护、资金池生命周期管理、原子化引导迁移、紧急强制退出控制

**治理与可升级性:** Token、Staking、AnnualGovernance、Lens 和 OliveAssembly 均为 Timelock 拥有的 UUPS 代理。AnnualGovernanceV2 自 2026 年 10 月 7 日起上线:NFT 注册和快照质押量决定年度分配的平方根投票权。更广泛的 DAO 控制仍是未来的治理步骤。

---

## 2) Proof-of-Contribution

### 2.1 Proof-of-Contribution 的含义

Proof-of-Contribution 是 OBN 的核心身份。

在传统质押系统中,用户通过锁定资本并赚取收益来证明参与。OBN 保留了这一质押基础,但增加了第二层:每一次用户操作也都在帮助资助一个公益资金池。这意味着参与不仅以投机、所有权或收益获取来衡量,也以贡献来衡量。

当用户将 OBN 质押到公益资金池时,他们不只是在选择在哪里赚取奖励,而是在选择自己的参与将支持哪项事业。当他们领取奖励时,协议会自动将公益份额铸造到所选资金池的 charityWallet。结果是一份由日常协议参与产生的透明链上贡献记录。

因此,OBN 把质押变成了一种贡献机制。

### 2.2 为什么这很重要

大多数加密协议以流动性、交易量、价格、用户数和 TVL 来衡量成功。OBN 保留这些指标,但增加了另一项重要衡量标准:网络向公益组织输送了多少价值。

这形成了一种不同类型的网络效应:

- 更多用户带来更多质押活动
- 更多质押活动带来更多释放
- 更多释放带来更多公益资金
- 更多公益资金带来更显著的影响
- 更显著的影响增强协议的身份和可信度

Proof-of-Contribution 使自身利益与公共利益保持一致。用户可以赚取收益,公益组织可以获得资金,协议可以建立透明的贡献历史,而无需用户另行捐赠。

### 2.3 作为链上身份层的贡献

OBN 可以通过现有和未来的协议视图追踪贡献,包括:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- 资金池层面的慈善分配
- 铸造到每个公益组织钱包的 charity 总额
- 质押时长和参与历史

这些指标使协议能够构建未来的贡献仪表板、用户影响力档案、公益组织报告页面和治理工具。随着时间推移,Proof-of-Contribution 可以成为一个身份层,展示用户如何参与网络以及帮助支持了哪些事业。

这不要求用户牺牲收益。协议的设计使赚取收益和作出贡献发生在同一操作中。

---

## 3) 合约套件

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**标准:** ERC20、EIP-2612 Permit、ERC20Votes(带检查点的投票权)、Burnable。

**核心功能:**

- **ERC20Upgradeable:** 标准代币转账、授权、余额
- **ERC20PermitUpgradeable:** 用于无 Gas 授权的 EIP-2612 permit()
- **ERC20VotesUpgradeable:** 用于治理的带检查点投票权(投票委托、历史查询)
- **ERC20BurnableUpgradeable:** 用户可自愿销毁代币
- **UUPSUpgradeable:** 经所有者授权可升级
- **OwnableUpgradeable:** 可转移的单一所有者

初始供应量 1,000,000,000 OBN 的**历史创世铸造(在 initialize 时一次性完成)**。这些最初的铸造去向并不代表当前未使用的储备分配:

- 40% 流动性 — 用于引导 DEX 资金池
- 30% 空投 — 面向社区的早期分发
- 10% 最初的慈善分配
- 10% 金库 — 用于协议治理和运营
- 10% 团队 — 进入带有悬崖期和归属计划的 TeamVesting 合约

全部分配硬编码于 `initialize()` 并以原子方式完成;创世期间不会发生额外铸造。

**单一铸造者模型(硬性规则):**

- `setMinterOnce(address minterAddr)` 设置唯一一个铸造者(质押合约),且只能调用一次
- 调用 `setMinterOnce` 后,除非升级合约,否则无法更改铸造者
- 只有铸造者可以调用 `mint(to, amount)` 来分发质押奖励
- 这一硬编码约束消除了临时增发风险,并确保代币供应可预测

**升级门控:** `_authorizeUpgrade` 限于所有者的 UUPS(引导阶段后将由 DAO 控制)。

**投票委托:** 用户可通过 `delegate(delegatee)` 指定其投票权(ERC20Votes 模式)。

**为什么采用这种结构?**
一次性分配消除了初始供应量的歧义。唯一的铸造者消除了临时增发风险。ERC20Votes 使代币与 DAO 控制相匹配,并支持未来的治理。可销毁性为未来的集成提供了自愿的消耗机制。Permit 支持(EIP-2612)通过省去单独的授权交易来改善用户体验。

### 3.2 OBNStakingPools(时间戳阶段、按资金池核算、UUPS)

**硬编码的奖励分配(BPS):**

- STAKER_BPS = 8_800 → 88% 归用户
- CHARITY_BPS = 1_000 → 10% 归慈善钱包(直接,按操作)
- CHARITY_FUND_BPS = 100 → 1% 归 ExtendOliveBranch
- TREASURY_BPS = 100 → 1% 归 TheOffering

`charityFund` 地址指向 **ExtendOliveBranch**,`treasury` 地址指向 **TheOffering**。两者在每个年度周期内都会累积 OBN。AnnualGovernance 在每个周期结束时通过社区投票处理这两笔余额。合约详情见第 3.4–3.6 节。

**释放阶段(部署时初始化):**

- 第 0–2 年:10.00% APY
- 第 2–4 年:7.50% APY
- 第 4–6 年:5.00% APY
- 第 6–8 年:2.50% APY
- 第 8–10 年:1.25% APY

治理可以连续追加未来阶段;之前的阶段保持不可变。

**各资金池 APR 相同:** 根据构造,每枚代币的 APR 仅取决于当前有效阶段,与你选择哪个资金池无关。

**Proof-of-Contribution 核算:** 质押合约提供用户和资金池贡献视图,使协议能够计算可归属于每位用户参与的公益资金数额。

**数据模型:** PoolInfo { address charityWallet; uint256 totalStaked; }(每个资金池一个钱包)。

#### 3.2.1 核心用户操作

**有界的按资金池端点:**

- `deposit(pid, amount)` — 将 OBN 质押到资金池
- `depositFor(pid, amount, beneficiary)` — 代表另一地址质押
- `depositWithPermit(...)` — 使用 ERC20 Permit 质押(无需单独授权)
- `withdraw(pid, amount)` — 提取未锁定余额
- `claim(pid)` — 领取待领奖励
- `claimFor(pid, user)` — 仅所有者可调用,代表另一地址领取
- `claimMultiple(pids[])` — 在一笔交易中领取多个资金池的待领奖励
- `setAutoClaimEnabled(bool)` — 设置调用钱包对其所有资金池的同意状态
- `autoClaimFor(pids[], user, month, consentNonce)` — 专用执行者提交经授权的月度批次

质押者可在链上选择加入赞助式月度自动领取,适用于其钱包持有的所有当前和未来资金池。自动化账户将可领取用户奖励为正的资金池打包,每笔交易最多 32 个资金池,并通过配置的 paymaster 支付 Gas。合约允许每个资金池在每个 UTC 日历月成功自动领取一次。奖励遵循与手动领取相同的 88% / 10% / 1% / 1% 分配,并发送给相同的接收方。用户可随时撤销同意;存入、提取和手动领取仍然可用。自动领取不会转移本金、复投奖励或改变投票权。

同意变更会使先前排队的请求失效。重新启用不会重置月度限制。UTC 日历月不是滚动的 30 天区间;手动领取不会消耗自动额度。当用户份额在整数取整后为正时,资金池即符合条件,不设服务层面的最低奖励门槛。选择加入或退出交易是否获得赞助取决于钱包支持情况。仅限所有者的 `claimFor` 独立于自动领取同意。部署和激活状态记录在附录 B 中。

自动领取偏好附属于质押地址,并与任何未来的身份或投票资格系统分离。执行者无法改变奖励去向、提取用户的质押或更改其同意状态。

**慈善机制:**

- 奖励的 10% 按每次用户操作(领取、存入、提取)直接铸造到该资金池的 charityWallet
- 1% 持续累积到 ExtendOliveBranch;社区每个周期投票决定由哪个经批准的公益组织接收该周期的固定分配额
- 1% 持续累积到 TheOffering;社区每个周期投票决定销毁周期开始时确定的分配额或将其捐赠给 ExtendOliveBranch
- 没有全局 TVL 缓冲;分配按操作进行,以实现原子执行

#### 3.2.2 资金池生命周期管理

**关闭机制:**

- `shutdownPool(pid)` — 阻止新的存入;领取和提取继续进行
- 允许用户在不移除资金池的情况下有序退出
- 资金池数据为质押者保持完整

**移除资金池:**

- `removePool(pid)` — 资金池完全为空(totalStaked == 0)后软删除
- 不重新索引 PID;向后兼容
- **金库安全:** 如果移除前累积了遗留 charity,则转入资金池的 charityWallet;如果钱包为零地址,则转向 treasury
- 防止用户在移除后领取时损失奖励

#### 3.2.3 公益组织自质押防护

**政策:** 公益组织只能接收恰好一笔永久锁定的引导存款。所有其他自质押均被阻止。

**执行:** `_enforceCharitySelfStakePolicy` 函数检查:

- 受益人是否为该资金池的慈善钱包?
- 如果是,这笔存款是否来自 charityFund,且已锁定,且其当前余额为零?
- 如果全部为真,则允许(首次引导)。否则拒绝。

**理由:** 防止公益组织意外或恶意自质押,这可能破坏资金池奖励动态或引发攻击。

#### 3.2.4 原子化引导迁移

**函数:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**原子性保证:**

- 保留待领奖励(验证精度为 1 wei 容差)
- 安全复制锁定数额并防止溢出
- 在同一交易中原子更新慈善钱包
- 停用旧用户的资金池计数器
- 如果是新用户的首次资金池质押,则激活新用户

**前提条件:**

- oldNonprofit 是该资金池当前的慈善钱包
- oldNonprofit ≠ newNonprofit
- oldNonprofit 的质押量不为零
- newNonprofit 在该资金池中尚无质押

**目的:** 实现公益组织头寸的无缝转移(例如地址泄露、钱包轮换),且不会损失或滞留奖励。

#### 3.2.5 紧急强制退出

**函数:** `forceExitUserToSelf(pid, user, claimRewards)`(仅所有者,nonReentrant)

**行为:**

- 无视锁定,强制用户退出资金池
- 立即将本金退还给用户
- 可选择将待领奖励铸造给用户
- 清除锁定、奖励债务和活跃质押者计数器

**用例:** 在用户需要恢复资金的资金池移除场景中的紧急治理控制;在资金池关闭后使用。

#### 3.2.6 慈善钱包更新

**函数:** `updateCharityWallet(pid, newWallet)`(仅所有者)

**允许:** 更新资金池的慈善地址(例如遭到泄露或轮换到新地址)。

**追踪方式:** CharityWalletUpdated 事件。

#### 3.2.7 锁定管理

**函数:** `setLockedAmount(pid, user, amount)`(仅 charityFund)

**规则:**

- 只能增加或保持不变;绝不能减少
- 不能超过用户余额
- 余额降至锁定数额以下时,锁定自动缩减
- 仅用于引导存款

**可观测性:**

分析读取通过 **OBNStakingLens**(第 3.7 节)提供,它是前端和仪表板的规范读取层。锁定和余额读取仍直接保留在质押合约上:

- `pendingRewards(pid, user)` — 返回待领总额(GROSS)
- `pendingRewardsMultiple(pids[], user)` — 返回多个资金池的待领数额及总计
- `unlockedBalance(pid, user)` — 返回余额减去锁定部分
- `stakeElapsed(user)` — 总质押秒数(解除质押后仍保留)
- `charityContributedByUserInPool(pid, user)` — 资金池中可归属于用户的已铸造 charity 总额
- `totalCharityContributedByUser(user)` — 所有资金池中可归属于用户的已铸造 charity 总额

完整的 OBNStakingLens 视图(getGlobalStats、getPoolStats、getUserPoolView、getPoolAPR、pendingCharityFor)见第 3.7 节。

### 3.3 TeamVesting(线性,含悬崖期;不可升级)

**悬崖期:** 约 4 个月;**期限:** 此后约 20 个月线性释放。

**`release()`:** 将已归属代币流式发送到 teamWallet。

**辅助函数:** claimableNow、timeUntilCliff、timeUntilNextRelease、nextReleaseTimestamp。

**安全:** 无法取回归属代币;只能取回误入的 ERC20。

### 3.4 TheOffering(不可升级)

TheOffering 是协议的年度销毁或捐赠金库。质押合约将 1% 的 treasury 释放份额发送到此地址。OBN 在每个年度周期内持续累积。

在每个周期结束时,AnnualGovernance 执行社区第 1 阶段投票的结果:

- **BURN:** 周期开始时确定的分配额被永久销毁,减少 OBN 总供应量。
- **GIVE:** 周期开始时确定的分配额转入 ExtendOliveBranch,增加该周期的公益分配。

**访问控制:** `timelockOwner`(Timelock)控制包括 `emergencySweep` 在内的管理功能。`governance`(AnnualGovernance)是唯一有权调用 `burn()` 或 `sendToExtend()` 的地址。`governance` 地址初始化为 `address(0)`,并通过 Timelock 使用 `setGovernance()` 连接到 AnnualGovernance。

**不可升级:** TheOffering 作为无代理的标准合约部署。构造函数参数(`obn` 代币地址、`timelockOwner`)不可变。如需替换,Timelock 必须部署新合约并在质押代理上调用 `setTreasury(newAddress)` 以重新定向释放。

### 3.5 ExtendOliveBranch(不可升级)

ExtendOliveBranch 是协议的年度公益分配金库。质押合约将 1% 的 charityFund 释放份额发送到此地址。OBN 持续累积,当社区在第 1 阶段投票 GIVE 时,还可能收到来自 TheOffering 的捐赠。

在每个周期结束时,AnnualGovernance 执行社区第 2 阶段投票:获胜公益资金池的 charityWallet 在一笔交易中收到 ExtendOliveBranch 的固定周期分配额。

**经批准公益组织登记册:** ExtendOliveBranch 维护一份经批准接收地址的白名单。Timelock 可调用 `setApprovedNonprofit(address, bool)`。所有资金池慈善钱包都保留在白名单中;新资金池通过 `schedule_addPool.js` 与 `addPool` 一起原子获批。

**分配:** `distributeFromGovernance(to, amount)` 只能由 `governance` 地址调用。金库不会在此路径上重复白名单检查:AnnualGovernanceV2 在准备选票批次时验证每个接收方,并且只向被选中的选票成员付款。

**不可升级:** 与 TheOffering 相同的不可变性保证。构造函数参数(`obn`、`timelockOwner`)不可变。

### 3.6 AnnualGovernanceV2(上线实现;现有 UUPS 代理)

AnnualGovernance 协调 TheOffering 和 ExtendOliveBranch 的年度决策周期。正如[代码库部署文档](README.md#annual-governance)所记录,其现有的由 Timelock 拥有的 UUPS 代理已于 **2026 年 10 月 7 日,在 Base 区块 52283807** 升级为 AnnualGovernanceV2。OliveAssembly 为新投票规则提供带检查点的 NFT 注册。部署本身不会启动年度周期。

**周期结构:** 每个年度周期依次运行两个阶段:

1. **第 1 阶段 — 销毁或捐赠:** 符合资格的已注册质押者对周期开始时确定的 TheOffering 分配额进行投票。获胜结果以原子方式执行:BURN 调用 `TheOffering.burn()`;GIVE 调用 `TheOffering.sendToExtend()`。

2. **第 2 阶段 — 选择公益组织:** 符合资格的已注册质押者选择由哪个经批准的公益组织接收 ExtendOliveBranch 的周期初分配额,以及该周期的 GIVE 转账(如有)。之后收到的资金留待下一周期。选票没有硬性上限:无需许可的批次每次调用最多按升序处理 100 个资金池 ID,排除已完全移除的资金池并对慈善钱包去重。已关闭的资金池在完全移除前仍符合条件。获胜的 charityWallet 通过 `ExtendOliveBranch.distributeFromGovernance()` 收到固定分配额。

**平票处理:**

- 第 1 阶段:只有当 GIVE 的票数严格超过 BURN 时才获胜。完全平票或无人参与均判定为 BURN。
- 第 2 阶段:票数最高的公益组织获胜;平票时由在选票上位置最靠前的公益组织获胜。如果完全没有投票,余额将结转到下一周期,而不是被分配。

**投票完整性:**

- 资格要求在 OliveAssembly 中注册一枚 OliveNFT,并在周期开始前的 `block.number - 1` 时总质押余额至少为 1 OBN。两个阶段共用该快照;之后的注册或质押无法为该周期增加投票权,之后的提取也不会抹去其权利。
- 投票权是快照质押量的平方根:质押 100 OBN 获得 10 个投票权单位。合约计算 `floor(sqrt(stakeInWei)) * 1e9`,以 18 位小数单位表示。钱包中额外的 NFT 不增加投票权;V2 之前的历史周期保留其原有的线性权重。
- voteAdmin Safe 无需 Timelock 延迟直接启动第 1 阶段,并准备第一个选票批次。任何人都可以继续准备并结算各阶段。第 1 阶段恰好持续 30 天,在选票准备完成前不能结算;第 2 阶段从第 1 阶段实际结算起拥有完整的 30 天。

**执行:** AnnualGovernance 直接调用 TheOffering 和 ExtendOliveBranch。投票结束后无需额外的多签批准 — 结果由合约强制执行。

**可升级性:** AnnualGovernance 是 UUPS 代理。随着 DAO 走向成熟,可通过 Timelock 治理的升级添加更复杂的投票机制(委托、法定人数要求、时间加权投票)。

**准备时序:** 投票者资格和质押量使用前一区块的快照;资金余额和资金池历史长度在 Safe 的启动交易中确定。每个资金池的钱包/移除状态和每个新接收方的批准状态在其批次执行时读取。之后的资金池 ID 被排除,已纳入的接收方保持固定,即使其批准随后被撤销。未获批准的接收方会使该批次回滚;Timelock 必须在第 1 阶段结算前修复配置或取消周期。准备期间应避免更改公益组织配置。

**上线参数与保障措施:** `owner` = Timelock;`voteAdmin` = OperatorSafe。遗留的 `maxBallotSize` 存储为兼容性而保留,但不限制成员资格。Governance 和 OliveAssembly 的升级在整个活跃周期内(包括准备阶段)都被阻止。取消仅在第 1 阶段执行前可用。分配额是现有金库中的会计预留,而非隔离托管;结算成功前必须补足任何差额。

**OliveAssembly 注册:** 授权 Assembly 代理转移一枚 OliveNFT,然后调用 `deposit(tokenId)` 进行注册。Assembly 每个钱包持有一枚 NFT;注册跨周期持续有效,直至提取。存入者可使用 `withdraw()`、`withdrawTo(recipient)` 或 `withdrawExpected(tokenId, recipient)`,没有锁定期。已注册的 NFT 不能由管理员提取。NFT 注册并不确立唯一的人类身份。

### 3.7 OBNStakingLens(UUPS 代理)

OBNStakingLens 是专用的只读分析合约。它是前端、仪表板和链下分析工具的规范读取层。将分析读取整合到单独的可升级代理中,使质押合约的外部接口保持精简稳定,同时分析能力可以独立演进。

**主要视图:**

- `getGlobalStats()` — 资金池数量、总 TVL、唯一质押者数、当前每秒奖励
- `getPoolStats(pid)` — 每个资金池的统计数据:慈善钱包、质押数额、质押者数量、累积器状态
- `getUserPoolView(pid, user)` — 用户专属质押数据:余额、锁定、待领奖励、活跃状态
- `getPoolAPR(pid)` — 资金池质押者份额的当前 APR
- `pendingCharityFor(pid, user)` — 可归属于用户的待定公益贡献估算

**访问控制:** `owner`(Timelock)控制升级。Lens 作为只读调用者从质押代理读取数据,自身不持有可变状态。

**初始化:** `initialize(stakingPools, timelock)` — 设置质押代理地址和 Timelock 所有者。

---

## 4) 代币经济与长期可持续性

### 4.1 释放数学(直观理解)

设阶段 APR 基数为 B(以 BPS 计),全局 TVL 为 G,资金池 TVL 为 P。

**资金池的年度总额:** YearlyPoolGross = P × (B / 10,000)

**质押者获得其中的 88%;** 其余部分流向公益组织 charityWallet(10%)、ExtendOliveBranch(1%)、TheOffering(1%)。

**每枚代币的 APR 简化为** 0.88 × (B / 10,000),**在各资金池间相等** — 与供应规模无关。

### 4.2 递减的释放支持可持续性

**抛压衰减:** 随着时间推移,更低的发行量降低结构性抛压。

**事业驱动的需求:** 协议在用户、公益组织和网络长期可信度之间建立持续的一致性。

**TVL 可信度:** 引导锁定创造持久的 TVL,提升信心和价格发现。

**可预测性:** 由于分配比例和阶段都在链上,参与者可以进行长期规划。

**贡献历史:** Proof-of-Contribution 增加了另一种形式的协议价值:通过用户参与产生公益资金的透明证据。

### 4.3 释放分配的极简主义(1% + 1%)

用户获得 88%,直接公益资金占 10%,其余 2% 累积到 ExtendOliveBranch 和 TheOffering — 每项都通过社区治理投票每年处理一次。

将治理累积流各保持在 1% 可确保协议保持精简,并以用户和慈善为中心。两条流都不能被悄悄改道;两者都通过 AnnualGovernance 在链上透明治理。

### 4.4 年度治理流(1% + 1%)

两条 1% 释放流都由 AnnualGovernance 治理,且各有明确的目的。V2 在周期开始时确定两笔余额;第 2 阶段仅加上该周期的 GIVE 转账。之后收到的资金留待下一周期。

**ExtendOliveBranch(释放的 1%):** 在每个年度周期内持续累积 OBN。在每个周期结束时,质押者在 AnnualGovernance 第 2 阶段投票选择由哪个经批准的公益资金池接收固定周期分配额。这为社区提供了一种透明、定期的机制,将协议层面的资源导向特定事业。

**TheOffering(释放的 1%):** 持续累积 OBN。在每个周期结束时,质押者在 AnnualGovernance 第 1 阶段投票,在两种结果中选择:BURN 周期初分配额(永久通缩),或将其 GIVE 给 ExtendOliveBranch(增加该周期的公益分配)。这项投票赋予社区对供应政策的持续控制权 — 随着协议 TVL 和年度累积增长,这一决定将愈发重要。

完整的奖励结构:

- **按操作的 10% 分配**在每次领取时直接且原子地流向所选资金池的 charityWallet。
- **1% ExtendOliveBranch 流**累积后每年重新分配给由治理选出的公益组织。
- **1% TheOffering 流**累积后要么被销毁,要么加入当年的公益分配。

### 4.5 可销毁性(可选的消耗机制)

OBN 通过质押产生通胀,但自愿销毁(例如未来的应用费用)可以抵消发行 — 去中心化且由市场驱动。

---

## 5) 协议机制与理由

### 5.1 公益分配

**按操作模型:** 每次领取/存入/提取时,用户待领奖励的 10% 直接铸造到该资金池的 charityWallet。

**原子执行:** 没有外部调用或全局缓冲;所有分配都在用户的交易内完成。

**无分配争用:** 每个资金池的慈善分配相互独立;没有全局再分配函数。

**Proof-of-Contribution:** 由于慈善分配与用户操作和资金池选择相关联,协议可以将贡献归属于特定用户和公益资金池。

### 5.2 年度治理流与公益种子储备

**公益种子储备:** 300M OBN 的分配用于资助永久质押的公益种子,每份 1M OBN。它独立于持续的质押释放和年度治理分配。储备核算见第 11 节。

**ExtendOliveBranch(持续释放的 1%):** 持续累积。AnnualGovernance 第 2 阶段投票选择由哪个经批准的公益组织接收固定周期分配额。这是协议的年度定向贡献机制。

**TheOffering(持续释放的 1%):** 持续累积。AnnualGovernance 第 1 阶段投票选择销毁周期初分配额或将其捐赠给 ExtendOliveBranch。这是协议的年度供应政策机制。

这种三方区分非常重要:

- **10% 公益奖励份额**是自动的、按操作的、特定于资金池的。
- **公益种子储备**从已分配的持仓中资助引导质押。
- **1% + 1% 年度治理流**是通过社区投票每年处理的持续释放。

### 5.3 永久锁定(仅限引导;只增不减)

**政策:** 管理员只能增加 lockedAmount,绝不能减少;如果用户余额降至存储的锁定数额以下,锁定将自动缩减。

**目的:** 纯粹用于引导机制。锁定确保种子本金无法提取,同时让受益人从第一天起赚取收益。这维护了 TVL 的完整性,并防止种子代币被立即抛售。

**用户质押默认不锁定;** 用户始终可以提取其未锁定余额。

### 5.4 没有释放控制器

阶段完全规定了发行量;不存在外部的"速率旋钮"。DAO 可以在预先通知(timelock)后连续追加未来阶段。

---

## 6) 公益组织:钱包、入驻与展示

### 6.1 每个资金池一个钱包

每个资金池对应一个 charityWallet。这使路由保持确定性,报告保持简单。

### 6.2 地址优先上架

我们正在索引信誉良好的组织已公开发布的以太坊地址,并将其纳入我们的平台。

此外,我们正在通过电子邮件和电话联系这些组织,告知他们我们的平台。

除非存在直接关系或正式确认,否则每个慈善页面默认显示醒目的"无关联 / 未获背书"横幅。


### 6.3 引导计划

**目标:** 确保每个新入驻的慈善组织从第一天起就能获得收益,并让资金池以可信的 TVL 起步。

**资金来源:** 300M OBN 公益种子储备为每个公益组织资助 1M OBN 的引导质押。储备耗尽后,社区资助的种子计划支持继续入驻;资金池数量没有硬性上限。

**机制:**

1. 治理或授权执行者(`charityFund` 地址,设置为 ExtendOliveBranch)调用 `charityFundBootstrap(pid, amount, beneficiary)` 或在适用时使用 `depositForWithLock(pid, amount, beneficiary)`。
2. 引导 OBN 被质押并为该公益组织的资金池/受益人永久锁定。
3. 锁定防止提取种子本金,消除立即抛售的风险,同时头寸持续赚取收益。
4. 公益组织同时受益于其锁定引导头寸的质押者份额收益,以及流向 charityWallet 的资金池 10% 慈善分配。

**报告:** 每次引导都在链上透明,并纳入定期公开披露。

**保护:** `_enforceCharitySelfStakePolicy` 确保每个公益组织只能获得一个锁定的引导头寸。未来的普通质押必须来自外部用户,而公益组织钱包迁移必须遵循协议由治理控制的迁移流程。

### 6.4 下架政策

如果未达标准,我们会从前端移除该公益组织并停止推广该资金池。

在资金池关闭并从协议中移除之前,应将用户质押和待领奖励退还给用户。

OBN 是路由和质押协议,而不是注册公益组织或认证机构。用户应自行核实组织并咨询税务专业人士。

---

## 7) 治理与可升级性

### 7.1 UUPS 代理与权限

Token、Staking、AnnualGovernance、Lens 和 OliveAssembly 的升级需要 Timelock 所有者授权。OperatorSafe 通过 24 小时 Timelock 安排管理变更。AnnualGovernance 和 OliveAssembly 还会在活跃周期内拒绝升级。

年度分配投票已在 NFT 注册、平方根投票模型下上线。voteAdmin Safe 启动周期;无需许可的调用者准备选票并执行结果。这不会将协议升级权限转移给年度投票者。更广泛的 DAO 控制仍是未来的步骤。

### 7.2 硬编码与治理控制

**硬编码或合约层面的约束(如适用,更改需要升级):**

- 四方分配:88% / 10% / 1% / 1%
- 10 年释放计划(每 2 年变更):10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- 管理员锁定语义(只增不减、自动缩减)
- OBNToken 中的单一铸造者
- 公益组织自质押政策
- 引导迁移的原子性保证
- 由合约视图公开的贡献核算

**治理控制(除非特定实现需要,否则无需升级):**

- 添加资金池(`addPool(charityWallet)`)
- 从公益种子储备或授权的社区资金来源执行引导质押
- 通过 voteAdmin Safe 启动 AnnualGovernance 周期;AnnualGovernanceV2 通过无需许可的批次得出选票成员,而不是通过酌情挑选
- 连续追加未来阶段(`addPhase`)
- 关闭或移除资金池
- TheOffering 和 ExtendOliveBranch 的支出和使用报告
- 公益组织入驻、下架、替换和迁移的标准

### 7.3 治理

治理可以管理纳入哪些公益组织,但默认假设应是 OBN 始终以公益资金池为中心。

### 7.4 AnnualGovernance

AnnualGovernance 是 OBN 定期社区决策的链上机制,为 TheOffering 和 ExtendOliveBranch 提供明确且由合约强制执行的周期。

**周期结构:**

每个周期在 voteAdmin 开启时开始。第 1 阶段和第 2 阶段依次进行。

- **第 1 阶段(销毁或捐赠):** 符合资格的已注册质押者对 TheOffering 的周期初分配额投票。BURN 永久减少供应量。GIVE 将该分配额转入 ExtendOliveBranch,增加该周期的公益分配。
- **第 2 阶段(选择公益组织):** 质押者投票选择由哪个经批准的公益资金池接收 ExtendOliveBranch 的固定周期分配额。选票批次扫描符合条件的资金池 ID,并依据通过 `setApprovedNonprofit` 在 ExtendOliveBranch 中维护的白名单验证其慈善钱包。

**平票处理:**

- 第 1 阶段:BURN 默认获胜 — GIVE 必须严格超过 BURN 的票数才能获胜。平票(或完全没有投票)判定为 BURN。
- 第 2 阶段:票数最多的公益组织获胜;平票时由选票索引最小的公益组织获胜。如果没有投票,余额将结转到下一周期,而不是被分配。

**投票完整性:**

- 在前一区块快照时需要一枚已注册的 OliveNFT 和至少 1 OBN 的总质押。投票权是快照质押量的平方根,两个阶段使用相同的权利(第 3.6 节)。
- AnnualGovernanceV2 对资金池或选票没有硬性上限。每笔准备交易最多处理 100 个资金池 ID;这一工作量限制并非成员资格限制。第 2 阶段等待准备完成。
- Safe 启动周期一次;无需许可的 keeper 调用准备选票并执行阶段转换。第 2 阶段从第 1 阶段实际结算起拥有完整的 30 天。

**执行:**

AnnualGovernance 直接调用 `TheOffering.burn()`、`TheOffering.sendToExtend()` 或 `ExtendOliveBranch.distributeFromGovernance()`。投票结束后无需额外的多签批准 — 结果由合约强制执行。

**可升级性:**

AnnualGovernance 是 UUPS 代理。随着 DAO 走向成熟,Timelock 可以将其升级以支持更复杂的投票机制(委托、法定人数要求、时间加权投票权)。

---

## 8) 安全模型

### 8.1 核心原则

- **Checks-Effects-Interactions:** 在外部调用之前更新状态
- **重入防护:** 所有状态变更路径都使用 nonReentrant
- **SafeERC20:** 用于所有代币转账
- **精确数学:** 使用 Math.mulDiv 进行精确计算
- **无无界循环:** 按资金池的端点,有界更新

### 8.2 加固

**原子操作:** 引导迁移、资金池移除、强制退出均以原子方式完成。

**奖励保留:** 显式验证迁移期间待领奖励得以保留(容差 1 wei)。

**锁定溢出防护:** 在设置锁定数额之前强制 NewLock ≤ userBalance。

**金库兜底:** 滞留的奖励被转向 treasury 而不是丢失。

**紧急控制:** 强制退出使治理能够在紧急情况下帮助用户恢复资金。

### 8.3 设计权衡

相同的 APR 使关注点保持在影响力上,而不是 APR 博弈。

按操作的慈善铸造是原子的,但要求每次操作都进行铸造(Gas 权衡)。

追加阶段会集中一部分裁量权;timelock + DAO 投票可缓解这一点。

AnnualGovernance 每个周期通过透明、负责的社区投票处理 TheOffering 和 ExtendOliveBranch 的余额。

---

## 9) 透明度与报告

### 9.1 事件

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 视图

**OBNStakingLens(规范分析读取层):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Proof-of-Contribution 报告

Proof-of-Contribution 报告应成为 OBN 最重要的透明度层之一。

未来的仪表板可能显示:

- 向公益组织贡献的 OBN 总额
- 按资金池统计的 OBN 贡献总额
- 可归属于每位用户的 OBN 贡献总额
- 按钱包统计的终身贡献历史
- 用户在多个公益资金池中的贡献
- 按贡献排名的顶级资金池
- 每个资金池的活跃质押者
- 每个资金池当前质押的 OBN
- 随时间变化的慈善释放
- 按周期统计的 TheOffering 累积、销毁历史和捐赠历史
- 按周期统计的 ExtendOliveBranch 累积和公益分配历史
- 按周期统计的 AnnualGovernance 投票结果

这些报告应帮助用户不仅了解自己赚取了什么,还了解自己的参与帮助产生了什么。

### 9.4 披露

OBN 应发布定期公开报告,内容涵盖:

- 公益种子储备余额、种子部署和单独的协议储备
- 已执行的引导
- 公益资金池状态
- 资金池的添加、移除或迁移
- 直接慈善分配
- 按周期统计的 TheOffering 和 ExtendOliveBranch 余额、累积和使用情况
- Proof-of-Contribution 指标

---

## 10) 用户旅程

1. **获取 OBN** — 用户通过可用的流动性来源获取 OBN。
2. **按事业选择公益资金池** — 在任一时刻各资金池的 APR 相同,因此用户根据使命而非收益差异进行选择。
3. **质押** — 用户通过 `deposit` 质押,通过 `depositFor` 为其他地址质押,或在支持时使用 Permit。
4. **赚取奖励** — 用户获得释放中的质押者部分。
5. **产生贡献** — 当用户与资金池交互时,所选公益组织收到协议规定的份额。
6. **建立 Proof-of-Contribution** — 用户贡献可以跨资金池并随时间追踪。
7. **随时提取未锁定本金** — 引导锁定不适用于普通用户质押。
8. **对 TheOffering 投票** — 在周期开始前,在 OliveAssembly 中注册一枚 OliveNFT 并质押至少 1 OBN。符合资格的钱包在第 1 阶段投票决定 TheOffering 的固定分配额是被销毁还是发送给 ExtendOliveBranch。
9. **对 ExtendOliveBranch 投票** — 然后相同的合格钱包投票决定由哪个经批准的公益组织接收 ExtendOliveBranch 的固定周期分配额。

OBN 的设计使用户无需在赚取收益和作出贡献之间选择。两者都通过同一个协议操作实现。

---

## 11) 代币供应与分配

**初始供应量:** 1,000,000,000 OBN。

**历史创世分配(initialize 时;不代表当前储备余额):**

- 40% 流动性
- 30% 空投
- 10% 最初的慈善分配
- 10% 金库
- 10% 团队(进入 TeamVesting;约 4 个月悬崖期,约 20 个月线性归属)

公益种子储备的总分配额为 **300M OBN**,另有 **50M OBN** 单独持有以满足协议需求。金库和空投持仓已整合到种子分配中。当时已有 11M OBN 资助了 11 个公益种子,剩余 289M OBN 用于另外 289 个种子,每个 1M OBN。

**持续发行:** 仅通过质押释放;质押合约是唯一的铸造者。

**释放的奖励分配:**

- 88% 质押者
- 10% 所选公益资金池
- 1% ExtendOliveBranch(年度公益分配)
- 1% TheOffering(年度销毁或捐赠投票)

**自愿销毁:** 可通过 burn 使用,以供未来的消耗机制。

---

## 12) 路线图(指示性)

### 12.1 萌芽

- 形成基础协议概念
- 构建并测试智能合约
- 将 OBNToken 和 OBNStakingPools 部署到 Base
- 推出初始前端
- 注入初始流动性
- 开展早期空投活动
- 集成 Farcaster 和 Base 原生用户流程
- 开始公开索引公益组织钱包
- 确立最初的 Proof-of-Contribution 叙事

### 12.2 生长

- 在前端实现扩展的贡献追踪
- 构建 Proof-of-Contribution 仪表板
- 改进公益组织报告页面
- 使用已部署的 AnnualGovernanceV2 和 OliveAssembly 运行年度周期,包括社区注册、投票和无需许可的结算
- 制作教育类媒体内容
- 接纳更多公益组织
- 探索合作伙伴关系
- 在可能时聘用关键贡献者
- 获得第三方安全审计
- 完成法律和治理工作
- 构建并测试 DAO 后端/前端

### 12.3 绽放

- 部署 DAO 并将治理移交给社区
- 通过 timelock 治理转移升级权限
- 随着治理走向成熟,将 AnnualGovernance voteAdmin 转移到 DAO 控制的地址
- 维护公益网络
- 使用 DAO 功能更新前端
- 扩展贡献声誉和报告工具
- 随公益需求的变化维护和调整协议

---

## 13) 附录 — 关键函数

### OBNStakingPools

**用户变更操作:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)`(仅 charityFund)
- `charityFundBootstrap(pid, amount, beneficiary)`(仅 charityFund)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — 仅调用钱包

**委托执行:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — 仅执行者;要求当前同意和月份;1–32 个严格升序的资金池 ID

**管理员变更操作:**

- `claimFor(pid, user)`(仅所有者;独立于自动领取同意)
- `setAutoClaimExecutor(executor)`(仅所有者;零地址暂停自动化)
- `initializeV931(executor)`(仅所有者,升级期间的一次性 reinitializer)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)`(仅 charityFund)
- `setVersion(newVersion)`(仅所有者)
- `upgradeTo(newImplementation, data)`(仅所有者,与治理兼容)

**视图:**

- `pendingRewards(pid, user)` — 待领总额(GROSS)
- `pendingRewardsMultiple(pids[], user)` — 多个资金池的待领数额及总计
- `autoClaimExecutor()` — 经授权的自动化智能账户
- `autoClaimPreference(user)` — 同意状态和同意 nonce
- `currentAutoClaimMonth()` — UTC 年 × 12 + 月(一月 = 1)
- `lastAutoClaimMonth(pid, user)` — 上次成功自动领取的月份
- `unlockedBalance(pid, user)` — 可提取数额
- `stakeElapsed(user)` — 总质押秒数
- `poolLength()` — 资金池数量
- `charityContributedByUserInPool(pid, user)` — 用户在资金池中的慈善贡献
- `totalCharityContributedByUser(user)` — 用户在所有资金池中的慈善贡献总额

`getGlobalStats`、`getPoolStats`、`getUserPoolView`、`getUserStats` 和 `getPoolAPR` 等展示和分析视图通过作为前端规范读取层的 **OBNStakingLens** 提供。

### OBNToken

**变更操作:**

- `setMinterOnce(minter)`(仅所有者,一次)
- `mint(to, amount)`(仅铸造者)
- 标准 ERC20:`transfer`、`approve`、`transferFrom`
- `permitAndCall` 支持(EIP-2612)
- `burn(amount)` — 自愿销毁
- `delegate(delegatee)` — 投票委托(ERC20Votes)

**视图:**

- 标准 ERC20:`balanceOf`、`allowance`、`totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**变更操作:**

- `release()` — 将已归属代币释放到 teamWallet
- `updateTeamWallet(newWallet)`(仅所有者)
- `rescueERC20(token, amount)`(仅所有者,不包括归属代币)

**视图:**

- `vestedAmount(timestamp)` — 某时间点的归属总额
- `claimableNow()` — 当前可领取数额
- `timeUntilCliff()` — 悬崖期倒计时
- `timeUntilNextRelease()` — 下次释放倒计时
- `nextReleaseTimestamp()` — 下次释放时间

### TheOffering

**治理变更操作:**

- `burn(amount)`(仅 governance) — 在 BURN 投票后销毁固定周期分配额
- `sendToExtend(amount)`(仅 governance) — 在 GIVE 投票后将固定周期分配额发送给 ExtendOliveBranch

**管理员变更操作:**

- `setGovernance(newGovernance)`(仅 timelockOwner) — 连接或更新治理地址;`address(0)` 使其暂停
- `emergencySweep(token, to)`(仅 timelockOwner)

### ExtendOliveBranch

**分配变更操作:**

- `distribute(nonprofit, amount)`(timelockOwner 或 governance) — 强制执行白名单
- `distributeFromGovernance(nonprofit, amount)`(仅 governance) — 有意省略白名单检查;接收方已在其选票批次准备时得到验证并固定

**管理员变更操作:**

- `setApprovedNonprofit(nonprofit, approved)`(仅 timelockOwner) — 管理分配白名单
- `setGovernance(newGovernance)`(仅 timelockOwner)
- `emergencySweep(token, to)`(仅 timelockOwner)

**视图:**

- `approvedNonprofit(nonprofit)` — 白名单状态

### AnnualGovernance

**投票管理员变更操作:**

- `startAnnualCycle(phase1Duration, phase2Duration)`(仅 voteAdmin) — 要求两个时长都等于 2,592,000 秒(30 天);对资格、质押和资金分配进行快照,冻结资金池数量边界,并准备第一个选票批次

**用户变更操作:**

- `castOfferingVote(cycleId, burn)` — 第 1 阶段投票
- `castNonprofitVote(cycleId, nonprofit)` — 第 2 阶段投票

**无需许可的执行:**

- `prepareBallot(cycleId, maxPools)` 在第 1 阶段每次调用处理 1 到 100 个资金池 ID
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — 推进未完成的选票准备或结算已就绪的阶段;任何人都可以调用

**所有者(Timelock)管理:**

- `cancelCycle(cycleId)` — 仅在第 1 阶段执行前
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)`(遗留兼容设置;不限制 V2 选票成员资格)

**视图:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` 报告准备进度和完成情况
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` 报告固定的资金分配额
- `getCurrentVoterInfo(user)` 报告当前资格,与现有周期快照不同
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` 报告参与情况和已确认的结算
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — 特定周期的 NFT 资格和平方根投票权;返回投票权和检查点引导状态

### OliveAssembly

- `deposit(tokenId)` 为每个钱包注册一枚经批准的 OliveNFT,由 Assembly 托管
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` 允许存入者自行控制提取,没有锁定期
- `registeredTokenId(user)` / `registeredCount()` 报告当前注册情况;该数量并不代表质押资格
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` 报告历史注册快照

### OBNStakingLens

只读分析层;不持有资金。重建了从 StakingPoolsV93 移除的展示/分析视图 — 所有写入调用仍在 OBNStakingPools 上。

**视图:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — 原始的带检查点质押权,不含 NFT 资格或平方根权重;年度投票请使用 AnnualGovernanceV2 的 `getVotingPowerForCycle`

**管理:**

- `upgradeToAndCall(newImplementation, data)`(仅所有者)

---

## 14) 结语

如果我们正在为未来几代人设计金融基础设施,那么我们就应该愿意提出一个更好的问题:

这些基础设施能否帮助创造一个更美好的世界?

加密货币给了我们前所未有的东西:将行为编码进货币的能力。数字资产不必再静止不动。它可以按规则流动。它可以按规则奖励。它可以按规则输送价值。它可以不只是人们买卖和投机的对象。

这应当是有意义的。

Olive Branch Network 源于这样一种信念:可编程货币不应漠不关心。如果我们能够设计代币来奖励流动性、保护网络、资助金库并驱动治理,那么我们也能设计它们来支持在世界上切实行善且可验证的组织。

OBN 试图证明,贡献可以直接内嵌于资产本身。

用户无需牺牲本金即可参与。他们无需另行捐赠。他们无需在赚取收益和提供帮助之间选择。当用户质押时,他们赚取收益。当他们领取时,公益组织获得资金。当网络成长时,贡献层也随之成长。

这就是 Proof-of-Contribution。

协议的核心刻意保持简单:用户质押到公益资金池,奖励由合约分配,一部分释放被输送到现实世界的事业。硬编码的奖励分配让系统保持诚实。ExtendOliveBranch 为社区提供了一种定期引导额外公益资金的方式。TheOffering 为质押者提供了每年的选择:销毁供应,或向公益组织延伸更多价值。

OBN 不是围绕榨取而构建的。它是围绕一致性而构建的。

用户因参与而获得奖励。公益组织获得持续支持。治理决定如何处理年度协议流。每一次操作都留下透明的链上记录。

这不仅仅是一个质押协议。

它是一台贡献引擎。

它是一个公共利益层。

它是对加密领域回避太久的一个问题的认真回答:

如果我们能编程让货币做几乎任何事,为什么不编程让它行善?

每一次质押都成为证明。

每一次领取都创造记录。

每一个资金池都代表一项事业。

而每一年,社区都会决定把橄榄枝伸得多远。

---

## 附录 B — 已部署合约(Base Mainnet)

本参考资料描述 V9.3.1 质押行为以及于 2026 年 10 月 7 日(Base 区块 52283807)激活的 AnnualGovernanceV2 升级。治理修订不改变质押版本。部署交易、代理激活和服务激活在[运营发布记录](governance-operations/2026-09-24-staking-v931-autoclaim-record.json)中追踪。

存入、领取、提取和同意变更请使用质押代理。`MonthlyAutoClaimUpgradeable` 已编译到 V9.3.1 实现中,不单独部署。

| 合约 | 类型 | 地址 | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | NFT 注册的平方根投票,并采用批量选票准备;于 2026 年 10 月 7 日升级。交互请使用上方的代理。 | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**网络:** Base Mainnet (Chain ID: 8453)

**要点说明:**

- OBNToken 和 OBNStakingPools 使用 UUPS 代理模式进行由治理控制的升级
- TeamVesting 和 OBNTimeLock 按设计不可升级
- TheOffering 和 ExtendOliveBranch 按设计不可升级
- UUPS 代理上的所有管理函数都经由 2-of-3 OPERATOR_SAFE 通过 OBNTimeLock(24 小时延迟)

---

**版本:** 9.3.1 Proof-of-Contribution / AnnualGovernanceV2 治理修订版

**日期:** 2026 年 10 月 13 日

**规范代码库:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

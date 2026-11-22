# Olive Branch Network ホワイトペーパー — Proof-of-Contribution

[English](../WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · [한국어](WHITEPAPER.ko.md) · **日本語** · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · [Português](WHITEPAPER.pt.md) · [Español](WHITEPAPER.es.md) · [Bahasa Indonesia](WHITEPAPER.id.md)

> この翻訳は便宜上提供するものです。英語版([WHITEPAPER.md](../WHITEPAPER.md))が正本であり、両者に相違がある場合は英語版が優先します。この翻訳はリビジョン `3c740d855` をもとに AI の支援を受けて作成したもので、専門の翻訳者によるレビューはまだ受けていません。コントラクト名、関数名、アドレスは英語のまま記載しています。

## 目的

Olive Branch Network は、日常的なオンチェーン参加を非営利団体への継続的な資金へと変えながら、参加したユーザーにも報酬を提供するように設計された Proof-of-Contribution ステーキングプロトコルです。ユーザーは非営利団体ごとのプールに OBN をステーキングしてステーキング発行分を獲得し、その発行分の一定割合が現実世界の活動へ届くことを支援します。

目的は、ユーザーに収益と貢献のどちらかを選ばせることではありません。同じプロトコル上の行動によって、その両方を実現することです。

OBN は、ステーキング活動がユーザーの支援する活動に結びついた透明なオンチェーン記録を生み出す貢献レイヤーを導入します。あらゆるステーキング、受け取り、非営利団体への分配、ガバナンス投票、バーン、年次配分は、追跡、検証、そして発展が可能な公開システムの一部となります。

これが Proof-of-Contribution の基盤です。デジタル資産を投機、利回り、ガバナンスのためだけでなく、測定可能な貢献のためにも用いるモデルです。

本書は、プロトコルのアーキテクチャ、トークンエコノミクス、非営利プールモデル、ガバナンス構造、アップグレード経路、セキュリティ上の前提、そして OBN を通じて非営利団体を支援するエンドツーエンドのプロセスを定義します。

---

## 1) エグゼクティブサマリー

**ミッション:** ステーキング発行分の固定割合を承認済みの非営利プールウォレットへ、自動的かつ透明に、オンチェーンで検証可能な形で届けることで、貢献を最も抵抗の少ない道にします。

**中核となる考え:** OBN は **Proof-of-Contribution** を中心に構築されています。これは、ユーザーが資本をステーキングするだけでなく、現実世界の非営利活動へ価値が届くよう継続的に支援することで参加を証明するモデルです。あらゆるステーキング、受け取り、非営利向けリワードの流れが、オンチェーン貢献レイヤーの一部となります。

**メカニズム:** ユーザーは非営利団体ごとのプールに OBN をステーキングします。発行分の分割はハードコードされています。ステーカー 88%、非営利団体への直接分配 10%、ExtendOliveBranch 1%(年次の非営利分配)、TheOffering 1%(年次のバーンまたは寄付の投票)です。

**設計上の保証:**

- コントラクトレベルで固定された4分割(88/10/1/1)
- ある時点ですべてのプールのトークンあたり APR が等しい(設計上、プールの APR は均一化される)
- オンチェーンの非営利資金フローとユーザー貢献ビューによる Proof-of-Contribution の会計
- プールごとに charityWallet は1つ。プールに「retire/active」フラグはない
- 管理者ロックは増加のみ可能で、残高が減ると自動的に縮小する。ブートストラップ専用
- 単一ミンター:setMinterOnce 後は、ステーキングコントラクトのみが OBN をミントできる
- 10年間で逓減するスケジュールを持つタイムスタンプベースの発行フェーズ
- 非営利団体の自己ステーキング防止、プールのライフサイクル管理、アトミックなブートストラップ移行、緊急強制退出の制御

**ガバナンスとアップグレード可能性:** Token、Staking、AnnualGovernance、Lens、OliveAssembly は Timelock が所有する UUPS プロキシです。AnnualGovernanceV2 は2026年10月7日から稼働しており、NFT の登録とスナップショット時のステークが年次配分に対する平方根投票権を決定します。より広範な DAO による管理は今後のガバナンス上のステップです。

---

## 2) Proof-of-Contribution

### 2.1 Proof-of-Contribution の意味

Proof-of-Contribution は OBN の中核となるアイデンティティです。

従来のステーキングシステムでは、ユーザーは資本をロックして利回りを得ることで参加を証明します。OBN はそのステーキング基盤を維持しつつ、第2のレイヤーを加えます。ユーザーのあらゆる行動が非営利プールへの資金提供にもつながります。つまり、参加は投機、所有、利回りの獲得だけでなく、貢献によっても測られます。

ユーザーが非営利プールに OBN をステーキングするとき、単に報酬を得る場所を選んでいるのではありません。自身の参加がどの活動を支援するかを選んでいるのです。リワードを受け取ると、プロトコルは非営利団体の取り分を選択したプールの charityWallet へ自動的にミントします。その結果、通常のプロトコル参加から、透明なオンチェーンの貢献記録が生まれます。

こうして OBN はステーキングを貢献のメカニズムに変えます。

### 2.2 なぜ重要なのか

ほとんどの暗号資産プロトコルは、流動性、取引量、価格、ユーザー数、TVL で成功を測ります。OBN はこれらの指標を維持しつつ、もう一つ重要な指標を加えます。ネットワークが公益団体へどれだけの価値を届けているかです。

これは異なる種類のネットワーク効果を生み出します。

- ユーザーが増えるとステーキング活動が増える
- ステーキング活動が増えると発行分が増える
- 発行分が増えると非営利資金が増える
- 非営利資金が増えると目に見えるインパクトが増える
- 目に見えるインパクトが増えるとプロトコルのアイデンティティと信頼性が強まる

Proof-of-Contribution は自己利益と公益を一致させます。ユーザーは収益を得られ、非営利団体は資金を受け取ることができ、プロトコルはユーザーに別途の寄付を求めることなく、透明な貢献履歴を築くことができます。

### 2.3 オンチェーンのアイデンティティレイヤーとしての貢献

OBN は、次のような既存および将来のプロトコルビューを通じて貢献を追跡できます。

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- プールレベルの慈善分配
- 各非営利ウォレットへミントされた charity の合計
- ステーキング期間と参加履歴

これらの指標により、プロトコルは将来の貢献ダッシュボード、ユーザーのインパクトプロフィール、非営利団体の報告ページ、ガバナンスツールを構築できます。やがて Proof-of-Contribution は、ユーザーがネットワークにどのように参加し、どの活動を支援したかを示すアイデンティティレイヤーとなり得ます。

これにユーザーが利回りを犠牲にする必要はありません。プロトコルは、収益と貢献が同じ行動の中で起こるように設計されています。

---

## 3) コントラクト群

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**標準:** ERC20、EIP-2612 Permit、ERC20Votes(チェックポイント付き投票権)、Burnable。

**主な機能:**

- **ERC20Upgradeable:** 標準的なトークン送金、承認、残高
- **ERC20PermitUpgradeable:** ガスレス承認のための EIP-2612 permit()
- **ERC20VotesUpgradeable:** ガバナンス用のチェックポイント付き投票権(投票の委任、履歴の照会)
- **ERC20BurnableUpgradeable:** ユーザーは自発的にトークンをバーンできる
- **UUPSUpgradeable:** オーナーの承認によりアップグレード可能
- **OwnableUpgradeable:** 移転可能な単一オーナー

初期供給量 1,000,000,000 OBN の**過去のジェネシスミント(initialize 時に1回のみ)**。これらの当初のミント先は、現在の未使用準備金の配分を表すものではありません。

- 40% 流動性 — DEX プールのブートストラップ用
- 30% エアドロップ — コミュニティへの初期分配
- 10% 当初の慈善配分
- 10% トレジャリー — プロトコルのガバナンスと運営用
- 10% チーム — クリフとベスティングスケジュールを持つ TeamVesting コントラクトへ

全分配は `initialize()` にハードコードされアトミックに行われます。ジェネシス中に追加のミントはありません。

**単一ミンターモデル(厳格なルール):**

- `setMinterOnce(address minterAddr)` は正確に1つのミンター(ステーキングコントラクト)を設定し、1回しか呼び出せません
- `setMinterOnce` の呼び出し後は、コントラクトをアップグレードしない限りミンターを変更できません
- ステーキング報酬を分配するために `mint(to, amount)` を呼び出せるのはミンターだけです
- このハードコードされた制約は場当たり的な発行リスクを排除し、予測可能なトークン供給を保証します

**アップグレードゲート:** `_authorizeUpgrade` をオーナーに限定した UUPS(ブートストラップ後は DAO が管理する予定)。

**投票の委任:** ユーザーは `delegate(delegatee)` で自身の投票権を指定できます(ERC20Votes パターン)。

**なぜこの構造なのか?**
1回限りの分配は初期供給量の曖昧さを取り除きます。唯一のミンターは場当たり的な発行リスクを排除します。ERC20Votes はトークンを DAO による管理に適合させ、将来のガバナンスを可能にします。バーン機能は将来の統合に向けた自発的なシンクを提供します。Permit のサポート(EIP-2612)は別途の承認トランザクションをなくすことで UX を改善します。

### 3.2 OBNStakingPools(タイムスタンプフェーズ、プールごとの会計、UUPS)

**ハードコードされたリワード分割(BPS):**

- STAKER_BPS = 8_800 → 88% をユーザーへ
- CHARITY_BPS = 1_000 → 10% を慈善ウォレットへ(直接、行動ごと)
- CHARITY_FUND_BPS = 100 → 1% を ExtendOliveBranch へ
- TREASURY_BPS = 100 → 1% を TheOffering へ

`charityFund` アドレスは **ExtendOliveBranch** に、`treasury` アドレスは **TheOffering** に送られます。どちらも各年次サイクルを通じて OBN を蓄積します。AnnualGovernance は各サイクルの終わりにコミュニティ投票によって両方の残高を処理します。コントラクトの詳細はセクション 3.4–3.6 を参照してください。

**発行フェーズ(デプロイ時に初期化):**

- 0–2年目: 10.00% APY
- 2–4年目: 7.50% APY
- 4–6年目: 5.00% APY
- 6–8年目: 2.50% APY
- 8–10年目: 1.25% APY

ガバナンスは将来のフェーズを連続して追加できますが、過去のフェーズは変更できません。

**プール間で等しい APR:** 構造上、トークンあたりの APR は有効なフェーズのみに依存し、どのプールを選ぶかには依存しません。

**Proof-of-Contribution の会計:** ステーキングコントラクトはユーザーとプールの貢献ビューを公開し、プロトコルが各ユーザーの参加に帰属する非営利資金を計算できるようにします。

**データモデル:** PoolInfo { address charityWallet; uint256 totalStaked; }(プールごとに1ウォレット)。

#### 3.2.1 ユーザーの主な行動

**上限のあるプール別エンドポイント:**

- `deposit(pid, amount)` — プールに OBN をステーキング
- `depositFor(pid, amount, beneficiary)` — 他のアドレスに代わってステーキング
- `depositWithPermit(...)` — ERC20 Permit でステーキング(別途の承認不要)
- `withdraw(pid, amount)` — ロックされていない残高を出金
- `claim(pid)` — 保留中のリワードを受け取る
- `claimFor(pid, user)` — オーナー専用の、他のアドレスに代わる受け取り
- `claimMultiple(pids[])` — 1トランザクションで複数プールの保留リワードを受け取る
- `setAutoClaimEnabled(bool)` — 呼び出したウォレットの全プールに対する同意を設定
- `autoClaimFor(pids[], user, month, consentNonce)` — 専用の実行者が承認済みの月次バッチを提出

ステーカーは、自身のウォレットが保有する現在および将来のすべてのプールについて、スポンサー付きの月次自動受け取りにオンチェーンでオプトインできます。自動化アカウントは、受け取り可能なユーザーリワードがプラスのプールを1トランザクションあたり最大 32 プールまでバッチ処理し、設定されたペイマスターを通じてガスを支払います。コントラクトは、UTC の暦月ごとにプールあたり1回の自動受け取りの成功を許可します。リワードは手動受け取りと同じ 88% / 10% / 1% / 1% の分割に従い、同じ受取人へ届きます。ユーザーはいつでも同意を解除でき、入金、出金、手動受け取りは引き続き利用できます。自動受け取りは元本を移転せず、リワードを複利運用せず、投票権も変更しません。

同意の変更は、以前にキューに入ったリクエストを無効にします。再度有効にしても月次の上限はリセットされません。UTC の暦月は 30 日間のローリング期間ではなく、手動受け取りは自動の許容回数を消費しません。プールは、整数丸め後のユーザーの取り分がプラスであれば対象となり、サービスレベルの最低リワード基準はありません。オプトインまたはオプトアウトのトランザクションへのスポンサーはウォレットの対応状況によります。オーナー専用の `claimFor` は自動受け取りの同意とは独立しています。デプロイと有効化の状況は付録 B に記録されています。

自動受け取りの設定はステーキングアドレスに紐づき、将来のアイデンティティや投票資格のシステムとは分離されています。実行者はリワードの送り先を変更したり、ユーザーのステークを出金したり、同意を変更したりすることはできません。

**慈善の仕組み:**

- リワードの 10% は、ユーザーの行動(受け取り、入金、出金)ごとにそのプールの charityWallet へ直接ミントされます
- 1% は ExtendOliveBranch に継続的に蓄積され、コミュニティはサイクルごとに、どの承認済み非営利団体がそのサイクルの固定配分を受け取るかを投票します
- 1% は TheOffering に継続的に蓄積され、コミュニティはサイクルごとに、サイクル開始時に確定した配分をバーンするか ExtendOliveBranch に寄付するかを投票します
- グローバルな TVL バッファはなく、分割はアトミックな実行のために行動ごとに行われます

#### 3.2.2 プールのライフサイクル管理

**シャットダウンの仕組み:**

- `shutdownPool(pid)` — 新規の入金をブロックし、受け取りと出金は継続します
- プールを削除せずにユーザーが円滑に退出できるようにします
- プールデータはステーカーのためにそのまま残ります

**プールの削除:**

- `removePool(pid)` — プールが完全に空(totalStaked == 0)になった後のソフトデリート
- PID の再インデックスなし、後方互換性あり
- **トレジャリーの安全策:** 削除前にレガシーの charity が蓄積していれば、プールの charityWallet へ送られ、ウォレットがゼロの場合は treasury へ振り向けられます
- 削除後にユーザーが受け取ってもリワードの損失を防ぎます

#### 3.2.3 非営利団体の自己ステーキング防止

**ポリシー:** 非営利団体は永久ロックされたブートストラップ入金を正確に1回だけ受け取れます。その他の自己ステーキングはすべてブロックされます。

**適用:** `_enforceCharitySelfStakePolicy` 関数は次を確認します。

- 受益者はプールの慈善ウォレットか?
- そうであれば、charityFund からのものであり、かつロックされ、かつ現在の残高がゼロか?
- すべて真であれば許可します(最初のブートストラップ)。それ以外は拒否します。

**根拠:** プールのリワード動態を崩したり攻撃を可能にしたりするおそれのある、非営利団体による偶発的または悪意ある自己ステーキングを防ぎます。

#### 3.2.4 アトミックなブートストラップ移行

**関数:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**アトミック性の保証:**

- 保留リワードを保持(1 wei の許容誤差まで検証)
- オーバーフローを防止しつつロック額を安全にコピー
- 同一トランザクションで慈善ウォレットをアトミックに更新
- 旧ユーザーのプールカウンターを無効化
- 新ユーザーにとって最初のプールステークであれば有効化

**前提条件:**

- oldNonprofit がプールの現在の慈善ウォレットである
- oldNonprofit ≠ newNonprofit
- oldNonprofit のステークがゼロではない
- newNonprofit がこのプールにまだステークを持っていない

**目的:** リワードの損失や滞留なしに、非営利団体のポジションを円滑に移転できるようにします(例:アドレスの侵害、ウォレットのローテーション)。

#### 3.2.5 緊急強制退出

**関数:** `forceExitUserToSelf(pid, user, claimRewards)`(オーナー専用、nonReentrant)

**動作:**

- ロックを無視してユーザーをプールから強制退出させます
- 元本を直ちにユーザーへ返します
- 任意で保留リワードをユーザーへミントします
- ロック、リワード負債、アクティブステーカーカウンターをクリアします

**ユースケース:** ユーザーの救済が必要なプール削除時の緊急ガバナンス制御で、プールのシャットダウン後に使用します。

#### 3.2.6 慈善ウォレットの更新

**関数:** `updateCharityWallet(pid, newWallet)`(オーナー専用)

**許可:** プールの慈善アドレスの更新(例:侵害された場合や新しいアドレスへのローテーション)。

**追跡手段:** CharityWalletUpdated イベント。

#### 3.2.7 ロック管理

**関数:** `setLockedAmount(pid, user, amount)`(charityFund 専用)

**ルール:**

- 増加または維持のみ可能で、減少はできません
- ユーザーの残高を超えることはできません
- 残高がロック額を下回るとロックは自動的に縮小します
- ブートストラップ入金専用です

**可観測性:**

分析用の読み取りは、フロントエンドとダッシュボード向けの標準読み取りレイヤーである **OBNStakingLens**(セクション 3.7)を通じて提供されます。ロックと残高の読み取りはステーキングコントラクトに直接残ります。

- `pendingRewards(pid, user)` — 保留額の総額(GROSS)を返す
- `pendingRewardsMultiple(pids[], user)` — 複数プールの保留額と合計を返す
- `unlockedBalance(pid, user)` — 残高からロックを引いた額を返す
- `stakeElapsed(user)` — ステーキング秒数の合計(アンステーキング後も保持)
- `charityContributedByUserInPool(pid, user)` — プール内でユーザーに帰属するミント済み charity の合計
- `totalCharityContributedByUser(user)` — 全プールでユーザーに帰属するミント済み charity の合計

OBNStakingLens のビュー全体(getGlobalStats、getPoolStats、getUserPoolView、getPoolAPR、pendingCharityFor)はセクション 3.7 を参照してください。

### 3.3 TeamVesting(線形、クリフあり、アップグレード不可)

**クリフ:** 約4か月、**期間:** その後約20か月の線形。

**`release()`:** ベスティング済みトークンを teamWallet へストリーミングします。

**ヘルパー:** claimableNow、timeUntilCliff、timeUntilNextRelease、nextReleaseTimestamp。

**安全策:** ベスティング対象のトークンは回収できず、誤って届いた ERC20 のみ回収できます。

### 3.4 TheOffering(アップグレード不可)

TheOffering はプロトコルの年次バーンまたは寄付の保管庫です。ステーキングコントラクトは 1% の treasury 発行枠をこのアドレスへ送ります。OBN は各年次サイクルを通じて継続的に蓄積します。

各サイクルの終わりに、AnnualGovernance はコミュニティのフェーズ 1 投票結果を実行します。

- **BURN:** サイクル開始時に確定した配分が永久にバーンされ、OBN の総供給量が減少します。
- **GIVE:** サイクル開始時に確定した配分が ExtendOliveBranch へ移され、そのサイクルの非営利分配が増加します。

**アクセス制御:** `timelockOwner`(Timelock)は `emergencySweep` を含む管理機能を制御します。`governance`(AnnualGovernance)は `burn()` または `sendToExtend()` を呼び出せる唯一のアドレスです。`governance` アドレスは `address(0)` に初期化され、Timelock を通じて `setGovernance()` で AnnualGovernance に接続されます。

**アップグレード不可:** TheOffering はプロキシのない標準コントラクトとしてデプロイされます。コンストラクタ引数(`obn` トークンアドレス、`timelockOwner`)は不変です。置き換えが必要な場合、Timelock は新しいコントラクトをデプロイし、ステーキングプロキシで `setTreasury(newAddress)` を呼び出して発行先を変更する必要があります。

### 3.5 ExtendOliveBranch(アップグレード不可)

ExtendOliveBranch はプロトコルの年次非営利分配の保管庫です。ステーキングコントラクトは 1% の charityFund 発行枠をこのアドレスへ送ります。OBN は継続的に蓄積し、コミュニティがフェーズ 1 で GIVE に投票すると TheOffering からの寄付も受け取れます。

各サイクルの終わりに、AnnualGovernance はコミュニティのフェーズ 2 投票を実行します。勝利した非営利プールの charityWallet が ExtendOliveBranch の固定サイクル配分を単一トランザクションで受け取ります。

**承認済み非営利団体レジストリ:** ExtendOliveBranch は承認済み受取アドレスのホワイトリストを維持します。`setApprovedNonprofit(address, bool)` は Timelock が呼び出せます。すべてのプールの慈善ウォレットはホワイトリストに維持され、新しいプールは `schedule_addPool.js` を通じて `addPool` とともにアトミックに承認されます。

**分配:** `distributeFromGovernance(to, amount)` を呼び出せるのは `governance` アドレスのみです。保管庫はこの経路でホワイトリストの確認を繰り返しません。AnnualGovernanceV2 は投票用紙バッチの準備時に各受取人を検証し、選ばれた投票用紙メンバーにのみ支払います。

**アップグレード不可:** TheOffering と同じ不変性の保証です。コンストラクタ引数(`obn`、`timelockOwner`)は不変です。

### 3.6 AnnualGovernanceV2(稼働中の実装、既存の UUPS プロキシ)

AnnualGovernance は TheOffering と ExtendOliveBranch の両方の年次意思決定サイクルを調整します。Timelock が所有する既存の UUPS プロキシは、[リポジトリのデプロイ文書](../README.md#annual-governance)に記録されているとおり、**2026年10月7日、Base ブロック 52283807** で AnnualGovernanceV2 にアップグレードされました。OliveAssembly は新しい投票ルールのためのチェックポイント付き NFT 登録を提供します。デプロイ自体が年次サイクルを開始するわけではありません。

**サイクル構造:** 各年次サイクルは順に進む 2 つのフェーズで構成されます。

1. **フェーズ 1 — バーンか寄付か:** 資格のある登録済みステーカーが、サイクル開始時に確定した TheOffering の配分に投票します。勝利した結果はアトミックに実行されます。BURN は `TheOffering.burn()` を、GIVE は `TheOffering.sendToExtend()` を呼び出します。

2. **フェーズ 2 — 非営利団体の選択:** 資格のある登録済みステーカーが、ExtendOliveBranch のサイクル開始時の配分と、あればそのサイクルの GIVE 移転分を、どの承認済み非営利団体が受け取るかを選びます。後から受け取った分は次のサイクルに残ります。投票用紙に厳格な上限はありません。パーミッションレスのバッチが呼び出しごとに最大 100 のプール ID を昇順で処理し、完全に削除されたプールを除外し、慈善ウォレットの重複を排除します。シャットダウンされたプールは完全に削除されるまで対象のままです。勝利した charityWallet は `ExtendOliveBranch.distributeFromGovernance()` を通じて固定配分を受け取ります。

**同数の処理:**

- フェーズ 1:GIVE は得票合計が BURN を厳密に上回る場合のみ勝ちます。完全な同数または参加なしは BURN となります。
- フェーズ 2:得票合計が最も高い非営利団体が勝ち、同数の場合は投票用紙で最も早い位置の団体が勝ちます。投票が1票もなければ、残高は分配されず次のサイクルへ繰り越されます。

**投票の完全性:**

- 資格には、OliveAssembly に登録された OliveNFT 1 つと、サイクル開始前の `block.number - 1` 時点でのステーキング残高の合計が少なくとも 1 OBN 必要です。両フェーズはそのスナップショットを共有します。後からの登録やステーキングでそのサイクルの投票権を増やすことはできず、後からの出金でその権利が消えることもありません。
- 投票権はスナップショット時のステークの平方根です。100 OBN のステークで投票権は 10 単位です。コントラクトは `floor(sqrt(stakeInWei)) * 1e9` を計算し、18 桁小数の単位で表します。ウォレット内の追加の NFT は投票権を増やさず、V2 以前の過去のサイクルは当初の線形の重み付けを維持します。
- voteAdmin の Safe は Timelock の遅延なしにフェーズ 1 を直接開始し、最初の投票用紙バッチを準備します。準備の継続と各フェーズの決済は誰でも行えます。フェーズ 1 はちょうど 30 日間続き、投票用紙の準備が完了するまで決済できません。フェーズ 2 にはフェーズ 1 の実際の決済から丸 30 日間が与えられます。

**実行:** AnnualGovernance は TheOffering と ExtendOliveBranch を直接呼び出します。投票が終了すれば追加のマルチシグ承認は不要で、結果はコントラクトによって強制されます。

**アップグレード可能性:** AnnualGovernance は UUPS プロキシです。DAO の成熟に伴い、より高度な投票メカニズム(委任、定足数要件、時間加重投票)を Timelock が管理するアップグレードを通じて追加できます。

**準備のタイミング:** 投票者の資格とステークは1つ前のブロックのスナップショットを使用し、資金残高とプール履歴の長さは Safe の開始トランザクションで確定します。各プールのウォレット/削除の状態と各新規受取人の承認は、そのバッチの実行時に読み取られます。後のプール ID は除外され、すでに受け入れられた受取人は、その後承認が取り消されても固定されたままです。未承認の受取人はそのバッチをリバートさせ、Timelock はフェーズ 1 の決済前に設定を修復するかサイクルをキャンセルしなければなりません。準備中は非営利団体の設定変更を避けてください。

**稼働パラメータと安全策:** `owner` = Timelock、`voteAdmin` = OperatorSafe。レガシーの `maxBallotSize` ストレージは互換性のために残されていますが、メンバーを制限しません。Governance と OliveAssembly のアップグレードは、準備期間を含むアクティブなサイクル全体を通じてブロックされます。キャンセルはフェーズ 1 の実行前のみ可能です。配分は既存の保管庫内の会計上の予約であり、分別保管ではありません。不足分は決済が成功する前に補充する必要があります。

**OliveAssembly への登録:** Assembly プロキシに OliveNFT の移転を承認してから、`deposit(tokenId)` を呼び出して登録します。Assembly はウォレットごとに NFT を 1 つ保管し、登録は出金するまでサイクルをまたいで維持されます。預け入れ者はロック期間なしで `withdraw()`、`withdrawTo(recipient)`、`withdrawExpected(tokenId, recipient)` を使用できます。登録された NFT を管理者が引き出すことはできません。NFT の登録は固有の人間のアイデンティティを証明するものではありません。

### 3.7 OBNStakingLens(UUPS プロキシ)

OBNStakingLens は読み取り専用の分析専用コントラクトです。フロントエンド、ダッシュボード、オフチェーン分析ツールのための標準読み取りレイヤーです。分析用の読み取りを別個のアップグレード可能なプロキシに集約することで、ステーキングコントラクトの外部インターフェースを最小かつ安定に保ちながら、分析機能を独立して進化させることができます。

**主なビュー:**

- `getGlobalStats()` — プール数、総 TVL、ユニークステーカー数、現在の毎秒リワード
- `getPoolStats(pid)` — プールごとの統計:慈善ウォレット、ステーキング額、ステーカー数、累積器の状態
- `getUserPoolView(pid, user)` — ユーザー別のステーキングデータ:残高、ロック、保留リワード、アクティブ状態
- `getPoolAPR(pid)` — プールのステーカー取り分に対する現在の APR
- `pendingCharityFor(pid, user)` — ユーザーに帰属する保留中の非営利貢献の推定値

**アクセス制御:** `owner`(Timelock)がアップグレードを制御します。Lens はビュー専用の呼び出し元としてステーキングプロキシから読み取り、自身の可変状態を持ちません。

**初期化:** `initialize(stakingPools, timelock)` — ステーキングプロキシのアドレスと Timelock オーナーを設定します。

---

## 4) トークンエコノミクスと長期的な持続可能性

### 4.1 発行の数理(直感的な説明)

フェーズの APR 基準を B(BPS 単位)、グローバル TVL を G、プール TVL を P とします。

**プールへの年間総額:** YearlyPoolGross = P × (B / 10,000)

**ステーカーはその 88% を受け取り、** 残りは非営利団体の charityWallet(10%)、ExtendOliveBranch(1%)、TheOffering(1%)へ送られます。

**トークンあたりの APR は** 0.88 × (B / 10,000) **に単純化され、プール間で等しくなります** — 供給規模とは無関係です。

### 4.2 逓減する発行が持続可能性を支える

**売り圧の減衰:** 時間とともに発行量が減ることで、構造的な売り圧が低下します。

**活動に根ざした需要:** プロトコルは、ユーザー、非営利団体、ネットワークの長期的な信頼性の間に継続的な整合を生み出します。

**TVL の信頼性:** ブートストラップロックが持続的な TVL を生み、信頼と価格発見を改善します。

**予測可能性:** 分割とフェーズがオンチェーンにあるため、参加者は長期的な計画を立てられます。

**貢献履歴:** Proof-of-Contribution は別の形のプロトコル価値を加えます。ユーザーの参加を通じて生み出された公益資金の透明な証拠です。

### 4.3 発行分割のミニマリズム(1% + 1%)

ユーザーが 88% を受け取り、非営利団体への直接資金が 10% を占め、残りの 2% は ExtendOliveBranch と TheOffering に蓄積されます。それぞれはコミュニティのガバナンス投票によって毎年処理されます。

ガバナンスで蓄積される流れをそれぞれ 1% に保つことで、プロトコルは簡潔で、ユーザーと慈善を中心としたものであり続けます。どちらの流れも密かに振り向けることはできず、両方とも AnnualGovernance を通じてオンチェーンで透明に管理されます。

### 4.4 年次ガバナンスの流れ(1% + 1%)

2 つの 1% の発行の流れはいずれも AnnualGovernance が管理し、それぞれ明確な目的を持ちます。V2 はサイクル開始時に両方の残高を確定し、フェーズ 2 はそのサイクルの GIVE 移転分のみを加えます。後から受け取った分は次のサイクルに残ります。

**ExtendOliveBranch(発行分の 1%):** 各年次サイクルを通じて OBN を継続的に蓄積します。各サイクルの終わりに、ステーカーは AnnualGovernance のフェーズ 2 で、どの承認済み非営利プールが固定サイクル配分を受け取るかを投票します。これにより、コミュニティはプロトコルレベルの資源を特定の活動へ向ける、透明で定期的な仕組みを得ます。

**TheOffering(発行分の 1%):** OBN を継続的に蓄積します。各サイクルの終わりに、ステーカーは AnnualGovernance のフェーズ 1 で 2 つの結果から選びます。サイクル開始時の配分を BURN する(永久的なデフレ)か、ExtendOliveBranch に GIVE する(そのサイクルの非営利分配に追加)かです。この投票はコミュニティに供給政策に対する継続的な管理権を与えます。プロトコルの TVL と年間蓄積が増えるほど重要性が増す決定です。

リワード構造の全体:

- **行動ごとの 10% 配分**は、すべての受け取り時に選択したプールの charityWallet へ直接かつアトミックに送られます。
- **ExtendOliveBranch の 1% の流れ**は蓄積され、ガバナンスが選んだ非営利団体へ毎年再分配されます。
- **TheOffering の 1% の流れ**は蓄積され、バーンされるか、その年の非営利分配に追加されます。

### 4.5 バーン機能(任意のシンク)

OBN はステーキングによってインフレしますが、自発的なバーン(例:将来のアプリ手数料)によって発行を相殺でき、これは分散的で市場主導です。

---

## 5) プロトコルの仕組みと根拠

### 5.1 非営利分配

**行動ごとのモデル:** すべての受け取り/入金/出金で、ユーザーの保留リワードの 10% がそのプールの charityWallet へ直接ミントされます。

**アトミックな実行:** 外部呼び出しやグローバルバッファはなく、すべての分割はユーザーのトランザクション内で行われます。

**配分の競合なし:** 各プールの慈善は独立しており、グローバルな再配分関数はありません。

**Proof-of-Contribution:** 慈善分配はユーザーの行動とプールの選択に結びついているため、プロトコルは貢献を特定のユーザーと非営利プールに帰属させることができます。

### 5.2 年次ガバナンスの流れと非営利シード準備金

**非営利シード準備金:** 300M OBN の配分が、それぞれ 1M OBN の永久ステーキング非営利シードに資金を提供します。これは継続的なステーキング発行や年次ガバナンス配分とは別です。準備金の会計についてはセクション 11 を参照してください。

**ExtendOliveBranch(継続的な発行分の 1%):** 継続的に蓄積します。AnnualGovernance のフェーズ 2 投票が、どの承認済み非営利団体が固定サイクル配分を受け取るかを選びます。プロトコルの年次の指定貢献メカニズムです。

**TheOffering(継続的な発行分の 1%):** 継続的に蓄積します。AnnualGovernance のフェーズ 1 投票が、サイクル開始時の配分をバーンするか ExtendOliveBranch に寄付するかを選びます。プロトコルの年次供給政策メカニズムです。

この三者の区別は重要です。

- **10% の非営利リワード取り分**は自動的で、行動ごとで、プール固有です。
- **非営利シード準備金**は、配分された保有分からブートストラップステークに資金を提供します。
- **1% + 1% の年次ガバナンスの流れ**は、コミュニティ投票で毎年処理される継続的な発行分です。

### 5.3 永久ロック(ブートストラップ専用、増加のみ)

**ポリシー:** 管理者は lockedAmount を増やすことしかできず、減らすことはできません。ユーザーの残高が保存されたロックを下回るとロックは自動的に縮小します。

**目的:** もっぱらブートストラップの仕組みのためです。ロックはシードされた元本の引き出しを防ぎつつ、受益者が初日から利回りを得られるようにします。これにより TVL の完全性が保たれ、シードされたトークンの即時の大量売却を防ぎます。

**ユーザーのステークはデフォルトでロックされておらず、** ユーザーはいつでもロックされていない残高を出金できます。

### 5.4 発行コントローラーなし

フェーズが発行を完全に規定しており、外部の「レート調整つまみ」はありません。DAO は事前の通知(timelock)とともに将来のフェーズを連続して追加できます。

---

## 6) 非営利団体:ウォレット、オンボーディング、表示

### 6.1 プールごとに 1 ウォレット

各プールは単一の charityWallet に対応します。これによりルーティングが決定的に保たれ、報告が簡単になります。

### 6.2 アドレス優先の掲載

私たちは、信頼できる組織がすでに公開している Ethereum アドレスをインデックス化し、プラットフォームにオンボーディングしています。

さらに、メールや電話で組織に連絡し、プラットフォームについてお知らせしています。

直接の関係や正式な承認がない限り、すべての慈善ページにはデフォルトで「提携なし / 推薦なし」という明確なバナーが表示されます。


### 6.3 ブートストラッププログラム

**目的:** 新たにオンボーディングした各慈善団体が初日から収益を得て、プールが信頼できる TVL で始まるようにします。

**資金源:** 300M OBN の非営利シード準備金が、非営利団体あたり 1M OBN のブートストラップステークに資金を提供します。準備金が尽きた後はコミュニティ資金によるシーディングが継続的なオンボーディングを支え、プール数に厳格な上限はありません。

**仕組み:**

1. ガバナンスまたは承認された実行者(ExtendOliveBranch に設定された `charityFund` アドレス)が `charityFundBootstrap(pid, amount, beneficiary)` を呼び出すか、該当する場合は `depositForWithLock(pid, amount, beneficiary)` を使用します。
2. ブートストラップ OBN は、その非営利団体のプール/受益者のためにステーキングされ、永久にロックされます。
3. ロックはシード元本の引き出しを防ぎ、即時の大量売却リスクを排除しつつ、ポジションは継続的に利回りを得ます。
4. 非営利団体は、ロックされたブートストラップポジションのステーカー取り分の利回りと、charityWallet へ送られるプールの 10% 慈善配分の両方の恩恵を受けます。

**報告:** 各ブートストラップはオンチェーンで透明であり、定期的な公開情報に含まれます。

**保護:** `_enforceCharitySelfStakePolicy` は、各非営利団体がロックされたブートストラップポジションを 1 つしか受け取れないことを保証します。将来の通常のステークは外部ユーザーから来る必要があり、非営利団体のウォレット移行はプロトコルのガバナンス管理された移行プロセスに従う必要があります。

### 6.4 掲載取り消しポリシー

基準を満たさない場合、フロントエンドからその非営利団体を削除し、そのプールの宣伝を停止します。

プールがシャットダウンされプロトコルから削除される前に、ユーザーのステークと保留リワードはユーザーに返却されるべきです。

**プールの閉鎖。** 非営利団体が離脱すると、そのプールはシャットダウンされます。新規のステークはブロックされますが、既存のステーカーは引き続きステーク解除と受け取りができ、残っているステークは通常の 88/10/1/1 の分配でリワードを生み続けます。プールを削除する前に、残っているすべてのステーカーを強制退出させます。`forceExitUserToSelf` は各ステークを保留リワードとともにそのステーカー本人のウォレットに返却し、それ以外の宛先には送れません。非営利団体のロックされたシードステークは非営利シード準備金に返却されます。その後、ステークが何も残っていない状態になって初めて、プールは削除されます。

OBN はルーティングおよびステーキングのプロトコルであり、登録された非営利団体や認証機関ではありません。ユーザーは組織を自ら確認し、税務の専門家に相談してください。

---

## 7) ガバナンスとアップグレード可能性

### 7.1 UUPS プロキシと権限

Token、Staking、AnnualGovernance、Lens、OliveAssembly のアップグレードには Timelock オーナーの承認が必要です。OperatorSafe は 24 時間の Timelock を通じて管理上の変更をスケジュールします。AnnualGovernance と OliveAssembly はさらに、アクティブなサイクル中のアップグレードを拒否します。

年次配分の投票は、NFT 登録制の平方根投票モデルで稼働しています。voteAdmin の Safe がサイクルを開始し、パーミッションレスの呼び出し元が投票用紙を準備し結果を実行します。これによってプロトコルのアップグレード権限が年次投票者に移ることはありません。より広範な DAO による管理は今後のステップです。

### 7.2 ハードコードとガバナンス管理

**ハードコードまたはコントラクトレベルの制約(該当する場合、変更にはアップグレードが必要):**

- 4 分割:88% / 10% / 1% / 1%
- 10 年間の発行スケジュール(2 年ごとに変更):10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- 管理者ロックのセマンティクス(増加のみ、自動縮小)
- OBNToken の単一ミンター
- 非営利団体の自己ステーキングポリシー
- ブートストラップ移行のアトミック性の保証
- コントラクトのビューで公開される貢献の会計

**ガバナンス管理(特定の実装で必要な場合を除きアップグレード不要):**

- プールの追加(`addPool(charityWallet)`)
- 非営利シード準備金または承認されたコミュニティ資金源からのブートストラップステークの実行
- voteAdmin の Safe を通じた AnnualGovernance サイクルの開始。AnnualGovernanceV2 は裁量的な選定ではなく、パーミッションレスのバッチを通じて投票用紙のメンバーを導出する
- 将来のフェーズの連続した追加(`addPhase`)
- プールのシャットダウンまたは削除
- TheOffering と ExtendOliveBranch の支出および使途の報告
- 非営利団体のオンボーディング、掲載取り消し、交換、移行の基準

### 7.3 ガバナンス

ガバナンスはどの非営利団体を含めるかを管理できますが、基本的な前提は OBN が非営利プールを中心とし続けることです。

### 7.4 AnnualGovernance

AnnualGovernance は OBN の定期的なコミュニティ決定のためのオンチェーンメカニズムであり、TheOffering と ExtendOliveBranch について、定義されたコントラクト強制のサイクルを提供します。

**サイクル構造:**

各サイクルは voteAdmin が開始したときに始まります。フェーズ 1 とフェーズ 2 は順に進みます。

- **フェーズ 1(バーンか寄付か):** 資格のある登録済みステーカーが TheOffering のサイクル開始時の配分に投票します。BURN は供給量を永久に減らします。GIVE はその配分を ExtendOliveBranch へ移し、そのサイクルの非営利分配を増やします。
- **フェーズ 2(非営利団体の選択):** ステーカーが、どの承認済み非営利プールが ExtendOliveBranch の固定サイクル配分を受け取るかを投票します。投票用紙バッチは対象のプール ID をスキャンし、`setApprovedNonprofit` を通じて ExtendOliveBranch に維持されるホワイトリストと慈善ウォレットを照合します。

**同数の処理:**

- フェーズ 1:デフォルトで BURN が勝ちます。GIVE が勝つには BURN の得票合計を厳密に上回る必要があります。同数(または投票なし)は BURN となります。
- フェーズ 2:最多得票の非営利団体が勝ち、同数の場合は投票用紙のインデックスが最も低い団体が勝ちます。投票がなければ、残高は分配されず次のサイクルへ繰り越されます。

**投票の完全性:**

- 1 つ前のブロックのスナップショットで、登録された OliveNFT 1 つと少なくとも 1 OBN の合計ステークが必要です。投票権はスナップショット時のステークの平方根で、両フェーズは同じ権利を使用します(セクション 3.6)。
- AnnualGovernanceV2 にはプールや投票用紙の厳格な上限はありません。各準備トランザクションは最大 100 のプール ID を処理しますが、この処理上限はメンバー数の制限ではありません。フェーズ 2 は準備の完了を待ちます。
- Safe はサイクルを 1 回開始し、パーミッションレスのキーパー呼び出しが投票用紙を準備しフェーズ遷移を実行します。フェーズ 2 にはフェーズ 1 の実際の決済から丸 30 日間が与えられます。

**実行:**

AnnualGovernance は `TheOffering.burn()`、`TheOffering.sendToExtend()`、または `ExtendOliveBranch.distributeFromGovernance()` を直接呼び出します。投票が終了すれば追加のマルチシグ承認は不要で、結果はコントラクトによって強制されます。

**アップグレード可能性:**

AnnualGovernance は UUPS プロキシです。DAO の成熟に伴い、Timelock はより高度な投票メカニズム(委任、定足数要件、時間加重の投票権)をサポートするようアップグレードできます。

---

## 8) セキュリティモデル

### 8.1 基本原則

- **Checks-Effects-Interactions:** 外部呼び出しの前に状態を更新
- **リエントランシーガード:** すべての状態変更経路に nonReentrant
- **SafeERC20:** すべてのトークン送金に使用
- **精密な数学:** 正確な計算のための Math.mulDiv
- **無制限ループなし:** プールごとのエンドポイント、上限のある更新

### 8.2 堅牢化

**アトミックな操作:** ブートストラップ移行、プール削除、強制退出はすべてアトミックに完了します。

**リワードの保持:** 移行中に保留リワードが保持されること(1 wei の許容誤差まで)を明示的に検証します。

**ロックのオーバーフロー防止:** ロック額の設定前に NewLock ≤ userBalance を強制します。

**トレジャリーへのフォールバック:** 滞留したリワードは失われず treasury へ振り向けられます。

**緊急制御:** 強制退出により、ガバナンスは緊急時にユーザーを救済できます。

### 8.3 設計上のトレードオフ

等しい APR は、APR の駆け引きではなくインパクトに焦点を保ちます。

行動ごとの慈善ミントはアトミックですが、すべての行動でミントが必要です(ガスのトレードオフ)。

フェーズの追加は一定の裁量を集中させますが、timelock + DAO 投票で緩和します。

AnnualGovernance は、各サイクルの透明で説明責任のあるコミュニティ投票によって TheOffering と ExtendOliveBranch の残高を処理します。

---

## 9) 透明性と報告

### 9.1 イベント

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 ビュー

**OBNStakingLens(標準の分析読み取りレイヤー):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Proof-of-Contribution の報告

Proof-of-Contribution の報告は、OBN の最も重要な透明性レイヤーの一つとなるべきです。

将来のダッシュボードでは次を表示する可能性があります。

- 非営利団体に貢献された OBN の総額
- プール別に貢献された OBN の総額
- 各ユーザーに帰属する OBN 貢献の総額
- ウォレットごとの生涯貢献履歴
- 複数の非営利プールにわたるユーザー貢献
- 貢献額上位のプール
- プールごとのアクティブステーカー
- プールごとの現在ステーキング中の OBN
- 時間経過に伴う慈善発行分
- サイクルごとの TheOffering の蓄積、バーン履歴、寄付履歴
- サイクルごとの ExtendOliveBranch の蓄積と非営利分配履歴
- サイクルごとの AnnualGovernance の投票結果

これらの報告は、ユーザーが何を得たかだけでなく、自身の参加が何を生み出す助けになったかを理解できるようにするものです。

### 9.4 情報開示

OBN は次を対象とする定期的な公開報告を発行すべきです。

- 非営利シード準備金の残高、シードの展開、および別個のプロトコル準備金
- 実行されたブートストラップ
- 非営利プールの状況
- プールの追加、削除、または移行
- 直接の慈善分配
- サイクルごとの TheOffering と ExtendOliveBranch の残高、蓄積、使途
- Proof-of-Contribution の指標

---

## 10) ユーザージャーニー

1. **OBN を入手** — ユーザーは利用可能な流動性源を通じて OBN を入手します。
2. **活動で非営利プールを選ぶ** — ある時点の APR はプール間で等しいため、ユーザーは利回りの差ではなくミッションで選びます。
3. **ステーキング** — ユーザーは `deposit` でステーキングし、`depositFor` で他のアドレスのためにステーキングするか、対応している場合は Permit を使用します。
4. **リワードを獲得** — ユーザーは発行分のステーカー取り分を得ます。
5. **貢献を生み出す** — ユーザーがプールとやり取りすると、選択した非営利団体がプロトコルで定義された取り分を受け取ります。
6. **Proof-of-Contribution を築く** — ユーザーの貢献はプール全体と時間を通じて追跡できます。
7. **ロックされていない元本はいつでも出金** — ブートストラップロックは通常のユーザーステークには適用されません。
8. **TheOffering に投票** — サイクル開始前に OliveAssembly に OliveNFT を 1 つ登録し、少なくとも 1 OBN をステーキングします。資格のあるウォレットはフェーズ 1 で、TheOffering の固定配分をバーンするか ExtendOliveBranch へ送るかを投票します。
9. **ExtendOliveBranch に投票** — 続いて同じ資格のあるウォレットが、どの承認済み非営利団体が ExtendOliveBranch の固定サイクル配分を受け取るかを投票します。

OBN は、ユーザーが収益と貢献のどちらかを選ぶ必要がないように設計されています。両方が同じプロトコル上の行動で実現します。

---

## 11) トークンの供給と分配

**初期供給量:** 1,000,000,000 OBN。

**過去のジェネシス分配(initialize 時。現在の準備金残高ではない):**

- 40% 流動性
- 30% エアドロップ
- 10% 当初の慈善配分
- 10% トレジャリー
- 10% チーム(TeamVesting へ。約 4 か月のクリフ、約 20 か月の線形ベスティング)

非営利シード準備金の総配分は **300M OBN** で、**50M OBN** はプロトコルの必要のために別途保有されます。トレジャリーとエアドロップの保有分はシード配分に統合されました。その時点で 11M OBN がすでに 11 の非営利シードに資金を提供しており、それぞれ 1M OBN で 289 の追加シードのために 289M OBN が残りました。

**継続的な発行:** ステーキング発行を通じてのみ行われ、ステーキングコントラクトが唯一のミンターです。

**発行分のリワード分割:**

- 88% ステーカー
- 10% 選択された非営利プール
- 1% ExtendOliveBranch(年次の非営利分配)
- 1% TheOffering(年次のバーンまたは寄付の投票)

**自発的バーン:** 将来のシンクのために burn を通じて利用できます。

---

## 12) ロードマップ(目安)

### 12.1 発芽

- 基本的なプロトコルのコンセプトを形成
- スマートコントラクトの構築とテスト
- OBNToken と OBNStakingPools を Base にデプロイ
- 初期フロントエンドの公開
- 流動性のシーディング
- 初期エアドロップキャンペーンの実施
- Farcaster と Base ネイティブのユーザーフローの統合
- 非営利団体ウォレットの公開インデックス化の開始
- 初期の Proof-of-Contribution ナラティブの確立

### 12.2 生長

- フロントエンドに拡張された貢献追跡を実装
- Proof-of-Contribution ダッシュボードの構築
- 非営利団体の報告ページの改善
- デプロイ済みの AnnualGovernanceV2 と OliveAssembly を使用して年次サイクルを運用し、コミュニティの登録、投票、パーミッションレスな決済を実施
- 教育メディアの制作
- 追加の非営利団体のオンボーディング
- パートナーシップの模索
- 可能な場合に不可欠な貢献者を採用
- 第三者のセキュリティ監査の取得
- 法務およびガバナンス作業の完了
- DAO のバックエンド/フロントエンドの構築とテスト

### 12.3 開花

- DAO をデプロイしガバナンスをコミュニティへ移管
- timelock ガバナンスを通じてアップグレード権限を移管
- ガバナンスの成熟に伴い AnnualGovernance の voteAdmin を DAO 管理のアドレスへ移管
- 非営利ネットワークの維持
- DAO 機能によるフロントエンドの更新
- 貢献の評判と報告ツールの拡張
- 公益のニーズの変化に応じてプロトコルを維持し適応

---

## 13) 付録 — 主な関数

### OBNStakingPools

**ユーザーの変更関数:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)`(charityFund 専用)
- `charityFundBootstrap(pid, amount, beneficiary)`(charityFund 専用)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — 呼び出しウォレットのみ

**委任実行:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — 実行者専用。現在の同意と月が必要。厳密に昇順のプール ID 1–32 個

**管理者の変更関数:**

- `claimFor(pid, user)`(オーナー専用。自動受け取りの同意とは独立)
- `setAutoClaimExecutor(executor)`(オーナー専用。ゼロで自動化を一時停止)
- `initializeV931(executor)`(オーナー専用、アップグレード時の 1 回限りの reinitializer)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)`(charityFund 専用)
- `setVersion(newVersion)`(オーナー専用)
- `upgradeTo(newImplementation, data)`(オーナー専用、ガバナンス対応)

**ビュー:**

- `pendingRewards(pid, user)` — 保留額の総額(GROSS)
- `pendingRewardsMultiple(pids[], user)` — 複数プールの保留額と合計
- `autoClaimExecutor()` — 承認された自動化スマートアカウント
- `autoClaimPreference(user)` — 同意と同意ナンス
- `currentAutoClaimMonth()` — UTC の年 × 12 + 月(1 月 = 1)
- `lastAutoClaimMonth(pid, user)` — 最後に自動受け取りが成功した月
- `unlockedBalance(pid, user)` — 出金可能額
- `stakeElapsed(user)` — ステーキング秒数の合計
- `poolLength()` — プール数
- `charityContributedByUserInPool(pid, user)` — プール内のユーザーの慈善貢献
- `totalCharityContributedByUser(user)` — 全プールでのユーザーの慈善貢献の合計

`getGlobalStats`、`getPoolStats`、`getUserPoolView`、`getUserStats`、`getPoolAPR` などの表示および分析ビューは、フロントエンドの標準読み取りレイヤーである **OBNStakingLens** を通じて提供されます。

### OBNToken

**変更関数:**

- `setMinterOnce(minter)`(オーナー専用、1 回のみ)
- `mint(to, amount)`(ミンター専用)
- 標準 ERC20:`transfer`、`approve`、`transferFrom`
- `permitAndCall` のサポート(EIP-2612)
- `burn(amount)` — 自発的バーン
- `delegate(delegatee)` — 投票の委任(ERC20Votes)

**ビュー:**

- 標準 ERC20:`balanceOf`、`allowance`、`totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**変更関数:**

- `release()` — ベスティング済みトークンを teamWallet へリリース
- `updateTeamWallet(newWallet)`(オーナー専用)
- `rescueERC20(token, amount)`(オーナー専用、ベスティング対象トークンを除く)

**ビュー:**

- `vestedAmount(timestamp)` — ある時点のベスティング総額
- `claimableNow()` — 現在受け取り可能な額
- `timeUntilCliff()` — クリフまでのカウントダウン
- `timeUntilNextRelease()` — 次回リリースまでのカウントダウン
- `nextReleaseTimestamp()` — 次回リリース時刻

### TheOffering

**ガバナンスの変更関数:**

- `burn(amount)`(governance 専用) — BURN 投票後に固定サイクル配分をバーン
- `sendToExtend(amount)`(governance 専用) — GIVE 投票後に固定サイクル配分を ExtendOliveBranch へ送付

**管理者の変更関数:**

- `setGovernance(newGovernance)`(timelockOwner 専用) — ガバナンスアドレスの接続または更新。`address(0)` で一時停止
- `emergencySweep(token, to)`(timelockOwner 専用)

### ExtendOliveBranch

**分配の変更関数:**

- `distribute(nonprofit, amount)`(timelockOwner または governance) — ホワイトリストを適用
- `distributeFromGovernance(nonprofit, amount)`(governance 専用) — ホワイトリスト確認を意図的に省略。受取人は投票用紙バッチの準備時にすでに検証され固定されている

**管理者の変更関数:**

- `setApprovedNonprofit(nonprofit, approved)`(timelockOwner 専用) — 分配ホワイトリストを管理
- `setGovernance(newGovernance)`(timelockOwner 専用)
- `emergencySweep(token, to)`(timelockOwner 専用)

**ビュー:**

- `approvedNonprofit(nonprofit)` — ホワイトリストの状態

### AnnualGovernance

**投票管理者の変更関数:**

- `startAnnualCycle(phase1Duration, phase2Duration)`(voteAdmin 専用) — 両方の期間が 2,592,000 秒(30 日)である必要があり、資格、ステーク、資金配分をスナップショットし、プール数の境界を固定して最初の投票用紙バッチを準備

**ユーザーの変更関数:**

- `castOfferingVote(cycleId, burn)` — フェーズ 1 の投票
- `castNonprofitVote(cycleId, nonprofit)` — フェーズ 2 の投票

**パーミッションレスな実行:**

- `prepareBallot(cycleId, maxPools)` はフェーズ 1 中に呼び出しごとに 1 から 100 のプール ID を処理します
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — 未完了の投票用紙準備を進めるか準備が整ったフェーズを決済し、誰でも呼び出せます

**オーナー(Timelock)管理:**

- `cancelCycle(cycleId)` — フェーズ 1 の実行前のみ
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)`(レガシー互換設定。V2 の投票用紙メンバーを制限しない)

**ビュー:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` は準備の進捗と完了を報告します
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` は固定の金銭配分を報告します
- `getCurrentVoterInfo(user)` は既存のサイクルスナップショットとは異なる現在の資格を報告します
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` は参加と確定した決済を報告します
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — サイクル固有の NFT 資格と平方根投票権。投票権とチェックポイントのブートストラップ状態を返す

### OliveAssembly

- `deposit(tokenId)` は承認済みの OliveNFT をウォレットごとに 1 つ Assembly の保管下で登録します
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` はロック期間なしで預け入れ者が管理する出金を可能にします
- `registeredTokenId(user)` / `registeredCount()` は現在の登録を報告しますが、この数はステーキング資格を意味しません
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` は過去の登録スナップショットを報告します

### OBNStakingLens

読み取り専用の分析レイヤーで、資金を保有しません。StakingPoolsV93 から削除された表示/分析ビューを再現し、すべての書き込み呼び出しは OBNStakingPools に残ります。

**ビュー:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — NFT 資格や平方根の重み付けのない生のチェックポイント付きステーキングパワー。年次投票には AnnualGovernanceV2 の `getVotingPowerForCycle` を使用

**管理:**

- `upgradeToAndCall(newImplementation, data)`(オーナー専用)

---

## 14) 結びの言葉

私たちが未来の世代のための金融インフラを設計しているのなら、より良い問いを立てる覚悟を持つべきです。

そのインフラは、より良い世界を作る助けになるでしょうか?

暗号資産は、それまで存在しなかったものを私たちに与えました。お金に振る舞いをコーディングする能力です。デジタル資産はもはや静止している必要はありません。ルールによって動くことができます。ルールによって報いることができます。ルールによって価値を届けることができます。人々が売買し投機する対象以上のものになることができます。

それは意味を持つはずです。

Olive Branch Network は、プログラム可能なお金は無関心であってはならないという信念から生まれました。流動性に報い、ネットワークを守り、トレジャリーに資金を提供し、ガバナンスを動かすようにトークンを設計できるのなら、世界で検証可能な善を行う組織を支援するようにも設計できます。

OBN は、貢献を資産そのものに直接組み込めることを証明しようとする試みです。

ユーザーは参加のために元本を犠牲にする必要はありません。別途寄付をする必要もありません。稼ぐことと助けることのどちらかを選ぶ必要もありません。ユーザーがステーキングすれば、収益を得ます。受け取れば、非営利団体が受け取ります。ネットワークが成長すれば、貢献レイヤーも共に成長します。

それが Proof-of-Contribution です。

プロトコルの中核は意図的に単純です。ユーザーは非営利プールにステーキングし、リワードはコントラクトによって分割され、発行分の一部は現実世界の活動へ届けられます。ハードコードされたリワード分割がシステムを誠実に保ちます。ExtendOliveBranch はコミュニティが追加の非営利資金を向ける定期的な手段を提供します。TheOffering はステーカーに、供給をバーンするか非営利団体へより多くの価値を広げるかという毎年の選択を提供します。

OBN は搾取を中心に作られていません。整合を中心に作られています。

ユーザーは参加に対して報われます。非営利団体は継続的な支援を受けます。ガバナンスは年次のプロトコルの流れをどう処理するかを決定します。あらゆる行動が透明なオンチェーン記録を残します。

これは単なるステーキングプロトコルではありません。

貢献のエンジンです。

公益のレイヤーです。

暗号資産があまりにも長く避けてきた問いに答えようとする、真剣な試みです。

お金にほとんど何でもさせるようにコーディングできるのなら、なぜ善を行うようにコーディングしないのでしょうか?

すべてのステーキングが証明となります。

すべての受け取りが記録を生みます。

すべてのプールが一つの活動を表します。

そして毎年、コミュニティはオリーブの枝をどこまで差し伸べるかを決めます。

---

## 付録 B — デプロイ済みコントラクト(Base Mainnet)

この参考資料は、V9.3.1 のステーキングの動作と、2026年10月7日(Base ブロック 52283807)に有効化された AnnualGovernanceV2 のアップグレードについて説明します。ガバナンスの改訂はステーキングのバージョンを変更しません。デプロイトランザクション、プロキシの有効化、サービスの有効化は[運用リリース記録](../governance-operations/2026-09-24-staking-v931-autoclaim-record.json)で追跡されています。

入金、受け取り、出金、同意の変更にはステーキングプロキシを使用してください。`MonthlyAutoClaimUpgradeable` は V9.3.1 実装にコンパイルされており、別途デプロイされていません。

| コントラクト | 種類 | アドレス | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | バッチ式の投票用紙準備を備えた NFT 登録制の平方根投票。2026年10月7日にアップグレード。やり取りには上記のプロキシを使用してください。 | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**ネットワーク:** Base Mainnet (Chain ID: 8453)

**主な注意事項:**

- OBNToken と OBNStakingPools は、ガバナンス管理のアップグレードのために UUPS プロキシパターンを使用します
- TeamVesting と OBNTimeLock は設計上アップグレードできません
- TheOffering と ExtendOliveBranch は設計上アップグレードできません
- UUPS プロキシのすべての管理関数は、2-of-3 OPERATOR_SAFE を介して OBNTimeLock(24 時間の遅延)を経由します

---

**バージョン:** 9.3.1 Proof-of-Contribution / AnnualGovernanceV2 ガバナンス改訂版

**日付:** 2026年10月13日

**正式リポジトリ:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

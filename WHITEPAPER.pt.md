# Whitepaper da Olive Branch Network — Proof-of-Contribution

[English](WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · [한국어](WHITEPAPER.ko.md) · [日本語](WHITEPAPER.ja.md) · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · **Português** · [Español](WHITEPAPER.es.md) · [Bahasa Indonesia](WHITEPAPER.id.md)

> Esta tradução é fornecida apenas por conveniência. A versão em inglês ([WHITEPAPER.md](WHITEPAPER.md)) é a oficial; em caso de divergência, prevalece a versão em inglês. Esta tradução foi feita com auxílio de IA a partir da revisão `3c740d855` e ainda não foi revisada por um tradutor profissional. Nomes de contratos, nomes de funções e endereços permanecem em inglês.

## Propósito

A Olive Branch Network é um protocolo de staking de Proof-of-Contribution criado para transformar a participação on-chain comum em financiamento contínuo para organizações sem fins lucrativos, recompensando ao mesmo tempo os usuários por participarem. Os usuários fazem staking de OBN em pools específicos de cada organização, recebem emissões de staking e ajudam a direcionar uma parte definida dessas emissões para causas do mundo real.

O objetivo não é pedir que os usuários escolham entre ganhar e contribuir. O objetivo é fazer com que ambos aconteçam por meio da mesma ação no protocolo.

A OBN introduz uma camada de contribuição na qual a atividade de staking cria registros on-chain transparentes vinculados às causas que os usuários apoiam. Cada stake, resgate, distribuição a uma organização sem fins lucrativos, voto de governança, queima e alocação anual passa a fazer parte de um sistema público que pode ser acompanhado, verificado e ampliado.

Esta é a base da Proof-of-Contribution: um modelo no qual ativos digitais não são usados apenas para especulação, rendimento ou governança, mas também para contribuição mensurável.

Este documento define a arquitetura do protocolo, a economia do token, o modelo de pools sem fins lucrativos, a estrutura de governança, o caminho de atualização, as premissas de segurança e o processo completo de apoio a organizações sem fins lucrativos por meio da OBN.

---

## 1) Resumo executivo

**Missão:** Tornar a contribuição o caminho de menor resistência, direcionando uma parcela fixa das emissões de staking para carteiras de pools sem fins lucrativos aprovados — de forma automática, transparente e verificável on-chain.

**Ideia central:** A OBN é construída em torno da **Proof-of-Contribution**: um modelo no qual os usuários comprovam participação não apenas fazendo staking de capital, mas também ajudando continuamente a direcionar valor para causas sem fins lucrativos do mundo real. Cada stake, resgate e fluxo de recompensa sem fins lucrativos passa a fazer parte de uma camada de contribuição on-chain.

**Mecanismo:** Os usuários fazem staking de OBN em pools específicos de cada organização sem fins lucrativos. A divisão das emissões é fixada no código: 88% para stakers, 10% diretamente para a organização, 1% para ExtendOliveBranch (distribuição anual a organizações sem fins lucrativos), 1% para TheOffering (votação anual de queimar ou doar).

**Garantias de design:**

- Divisão fixa em quatro partes (88/10/1/1) no nível do contrato
- APR por token igual em todos os pools a qualquer momento (os APRs dos pools se igualam por design)
- Contabilidade de Proof-of-Contribution por meio de fluxos on-chain de financiamento e visualizações de contribuição dos usuários
- Uma charityWallet por pool; sem sinalizadores "retire/active" nos pools
- Bloqueios administrativos só podem aumentar e encolhem automaticamente se o saldo cair; destinados apenas ao bootstrap
- Minter único: após setMinterOnce, apenas o contrato de staking pode cunhar OBN
- Fases de emissão baseadas em timestamp com cronograma decrescente de 10 anos
- Proteção contra auto-staking de organizações sem fins lucrativos, gestão do ciclo de vida de pools, migração atômica de bootstrap, controles de saída forçada de emergência

**Governança e capacidade de atualização:** Proxies UUPS de propriedade do Timelock para Token, Staking, AnnualGovernance, Lens e OliveAssembly. O AnnualGovernanceV2 está ativo desde 7 de outubro de 2026: o registro de NFT e o stake no snapshot determinam o poder de voto por raiz quadrada para alocações anuais. Um controle mais amplo pela DAO continua sendo um passo futuro de governança.

---

## 2) Proof-of-Contribution

### 2.1 O que significa Proof-of-Contribution

A Proof-of-Contribution é a identidade central da OBN.

Nos sistemas tradicionais de staking, os usuários comprovam participação bloqueando capital e recebendo rendimento. A OBN mantém essa base de staking, mas acrescenta uma segunda camada: cada ação do usuário também ajuda a financiar um pool sem fins lucrativos. Isso significa que a participação não é medida apenas por especulação, propriedade ou extração de rendimento. Ela também é medida pela contribuição.

Quando um usuário faz staking de OBN em um pool sem fins lucrativos, ele não está apenas escolhendo onde ganhar recompensas. Está escolhendo qual causa sua participação ajuda a apoiar. Quando resgata recompensas, o protocolo cunha automaticamente a parcela da organização na charityWallet do pool selecionado. O resultado é um registro on-chain transparente de contribuição, gerado pela participação comum no protocolo.

Assim, a OBN transforma o staking em um mecanismo de contribuição.

### 2.2 Por que isso importa

A maioria dos protocolos cripto mede o sucesso por liquidez, volume, preço, usuários e TVL. A OBN mantém essas métricas, mas acrescenta outra medida importante: quanto valor a rede direciona para organizações de bem público.

Isso cria um tipo diferente de efeito de rede:

- Mais usuários criam mais atividade de staking
- Mais atividade de staking cria mais emissões
- Mais emissões criam mais financiamento sem fins lucrativos
- Mais financiamento sem fins lucrativos cria impacto mais visível
- Impacto mais visível fortalece a identidade e a credibilidade do protocolo

A Proof-of-Contribution alinha interesse próprio e bem público. Os usuários podem ganhar, as organizações sem fins lucrativos podem receber e o protocolo pode construir um histórico transparente de contribuição sem exigir que os usuários façam doações separadas.

### 2.3 Contribuição como camada de identidade on-chain

A OBN pode acompanhar a contribuição por meio de visualizações atuais e futuras do protocolo, incluindo:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- distribuições de caridade no nível do pool
- total de charity cunhado para cada carteira de organização sem fins lucrativos
- tempo em staking e histórico de participação

Essas métricas permitem que o protocolo construa futuros painéis de contribuição, perfis de impacto de usuários, páginas de relatórios de organizações e ferramentas de governança. Com o tempo, a Proof-of-Contribution pode se tornar uma camada de identidade que mostra como os usuários participaram da rede e quais causas ajudaram a apoiar.

Isso não exige que os usuários sacrifiquem rendimento. O protocolo foi projetado para que ganhar e contribuir ocorram na mesma ação.

---

## 3) Conjunto de contratos

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**Padrões:** ERC20, EIP-2612 Permit, ERC20Votes (poder de voto com checkpoints), Burnable.

**Recursos principais:**

- **ERC20Upgradeable:** Transferências, aprovações e saldos padrão do token
- **ERC20PermitUpgradeable:** permit() EIP-2612 para aprovações sem gas
- **ERC20VotesUpgradeable:** Poder de voto com checkpoints para governança (delegação de votos, consultas históricas)
- **ERC20BurnableUpgradeable:** Os usuários podem queimar tokens voluntariamente
- **UUPSUpgradeable:** Atualizável com autorização do proprietário
- **OwnableUpgradeable:** Proprietário único com capacidade de transferência

**Mint gênese histórico (uma única vez no initialize)** do fornecimento inicial de 1,000,000,000 OBN. Esses destinos originais do mint não representam alocações atuais de reserva não gasta:

- 40% Liquidez — para o bootstrap de pools em DEX
- 30% Airdrop — distribuição inicial à comunidade
- 10% alocação de caridade original
- 10% Tesouraria — para governança e operações do protocolo
- 10% Equipe — para o contrato TeamVesting, com cliff e cronograma de vesting

A distribuição total é fixada no código em `initialize()` e ocorre de forma atômica; não há mint adicional durante a gênese.

**Modelo de minter único (regra rígida):**

- `setMinterOnce(address minterAddr)` define exatamente um minter (o contrato de staking) e só pode ser chamada uma vez
- Depois de chamar `setMinterOnce`, o minter não pode ser alterado sem atualizar o contrato
- Apenas o minter pode chamar `mint(to, amount)` para distribuir recompensas de staking
- Essa restrição fixada no código elimina o risco de emissão arbitrária e garante um fornecimento previsível do token

**Controle de atualização:** UUPS com `_authorizeUpgrade` restrito ao proprietário (a ser controlado pela DAO após o bootstrap).

**Delegação de votos:** Os usuários podem usar `delegate(delegatee)` para direcionar seu poder de voto (padrão ERC20Votes).

**Por que esta estrutura?**
A distribuição única elimina a ambiguidade sobre o fornecimento inicial. Um único minter elimina o risco de emissão arbitrária. O ERC20Votes alinha o token ao controle da DAO e viabiliza a governança futura. A capacidade de queima oferece um dreno voluntário para integrações futuras. O suporte a Permit (EIP-2612) melhora a experiência ao eliminar transações de aprovação separadas.

### 3.2 OBNStakingPools (fases por timestamp, contabilidade por pool, UUPS)

**Divisão de recompensas fixada no código (BPS):**

- STAKER_BPS = 8_800 → 88% para usuários
- CHARITY_BPS = 1_000 → 10% para a carteira de caridade (direto, por ação)
- CHARITY_FUND_BPS = 100 → 1% para ExtendOliveBranch
- TREASURY_BPS = 100 → 1% para TheOffering

O endereço `charityFund` direciona para **ExtendOliveBranch** e o endereço `treasury` direciona para **TheOffering**. Ambos acumulam OBN ao longo de cada ciclo anual. O AnnualGovernance resolve os dois saldos por meio de votações da comunidade ao fim de cada ciclo. Consulte as Seções 3.4–3.6 para detalhes dos contratos.

**Fases de emissão (inicializadas na implantação):**

- Anos 0–2: 10.00% APY
- Anos 2–4: 7.50% APY
- Anos 4–6: 5.00% APY
- Anos 6–8: 2.50% APY
- Anos 8–10: 1.25% APY

A governança pode acrescentar fases futuras de forma contígua; as fases anteriores permanecem imutáveis.

**APR igual por pool:** Por construção, o APR por token depende apenas da fase ativa, não do pool escolhido.

**Contabilidade de Proof-of-Contribution:** O contrato de staking expõe visualizações de contribuição de usuários e pools que permitem ao protocolo calcular quanto financiamento sem fins lucrativos é atribuível à participação de cada usuário.

**Modelo de dados:** PoolInfo { address charityWallet; uint256 totalStaked; } (uma carteira por pool).

#### 3.2.1 Ações principais do usuário

**Endpoints limitados por pool:**

- `deposit(pid, amount)` — Fazer staking de OBN em um pool
- `depositFor(pid, amount, beneficiary)` — Fazer staking em nome de outro endereço
- `depositWithPermit(...)` — Fazer staking com ERC20 Permit (sem aprovação separada)
- `withdraw(pid, amount)` — Sacar saldo não bloqueado
- `claim(pid)` — Resgatar recompensas pendentes
- `claimFor(pid, user)` — Resgate em nome de outro endereço, apenas para o proprietário
- `claimMultiple(pids[])` — Resgatar recompensas pendentes de vários pools em uma transação
- `setAutoClaimEnabled(bool)` — Definir o consentimento da carteira chamadora para todos os seus pools
- `autoClaimFor(pids[], user, month, consentNonce)` — Executor dedicado envia um lote mensal autorizado

Os stakers podem optar on-chain pelo autoclaim mensal patrocinado para todos os pools atuais e futuros de sua carteira. A conta de automação agrupa pools com recompensas de usuário resgatáveis positivas, até 32 pools por transação, e paga o gas por meio do paymaster configurado. O contrato permite um autoclaim bem-sucedido por pool a cada mês-calendário UTC. As recompensas seguem a mesma divisão 88% / 10% / 1% / 1% e vão para os mesmos destinatários dos resgates manuais. Os usuários podem desativar o consentimento a qualquer momento; depósitos, saques e resgates manuais continuam disponíveis. O autoclaim não transfere principal, não capitaliza recompensas nem altera o poder de voto.

Alterações de consentimento invalidam solicitações previamente enfileiradas. Reativar não redefine os limites mensais. Um mês-calendário UTC não é um intervalo móvel de 30 dias; resgates manuais não consomem a franquia automática. Um pool é elegível quando a parcela do usuário após o arredondamento inteiro é positiva, sem limite mínimo de recompensa no nível do serviço. O patrocínio da transação de adesão ou saída depende do suporte da carteira. O `claimFor` exclusivo do proprietário permanece independente do consentimento de autoclaim. O status de implantação e ativação está registrado no Apêndice B.

As preferências de autoclaim são vinculadas aos endereços de staking e mantidas separadas de qualquer futuro sistema de identidade ou elegibilidade de voto. O executor não pode redirecionar recompensas, sacar o stake de um usuário nem alterar seu consentimento.

**Mecânica de caridade:**

- 10% das recompensas são cunhados por ação do usuário (resgate, depósito, saque) diretamente na charityWallet daquele pool
- 1% acumula continuamente em ExtendOliveBranch; a comunidade vota a cada ciclo qual organização aprovada recebe a alocação fixa do ciclo
- 1% acumula continuamente em TheOffering; a comunidade vota a cada ciclo para queimar a alocação fixada no início do ciclo ou doá-la a ExtendOliveBranch
- Sem buffer global de TVL; as divisões ocorrem por ação para execução atômica

#### 3.2.2 Gestão do ciclo de vida do pool

**Mecanismo de encerramento:**

- `shutdownPool(pid)` — Bloqueia NOVOS depósitos; resgates e saques continuam
- Permite que os usuários saiam de forma ordenada sem remover o pool
- Os dados do pool permanecem intactos para os stakers

**Remoção de pool:**

- `removePool(pid)` — Exclusão lógica depois que o pool estiver completamente vazio (totalStaked == 0)
- Sem reindexação de PID; compatível com versões anteriores
- **Segurança da tesouraria:** Se houver charity legado acumulado antes da remoção, ele é enviado à charityWallet do pool; se a carteira for zero, é redirecionado para treasury
- Evita perda de recompensas se os usuários resgatarem após a remoção

#### 3.2.3 Proteção contra auto-staking de organizações

**Política:** As organizações sem fins lucrativos podem receber exatamente UM depósito de bootstrap permanentemente bloqueado. Todo outro auto-staking é bloqueado.

**Aplicação:** A função `_enforceCharitySelfStakePolicy` verifica:

- O beneficiário é a carteira de caridade do pool?
- Se sim, isto vem de charityFund E está bloqueado E o saldo atual é zero?
- Se tudo for verdadeiro, permite (primeiro bootstrap). Caso contrário, rejeita.

**Justificativa:** Evita auto-stakes acidentais ou maliciosos de organizações que poderiam quebrar a dinâmica de recompensas do pool ou possibilitar ataques.

#### 3.2.4 Migração atômica de bootstrap

**Função:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**Garantias atômicas:**

- Preserva recompensas pendentes (verificado até a tolerância de 1 wei)
- Copia valores bloqueados com segurança, com prevenção de overflow
- Atualiza a carteira de caridade de forma atômica na mesma transação
- Desativa os contadores de pool do usuário antigo
- Ativa o novo usuário se for seu primeiro stake em um pool

**Pré-condições:**

- oldNonprofit É a carteira de caridade atual do pool
- oldNonprofit ≠ newNonprofit
- oldNonprofit tem stake diferente de zero
- newNonprofit ainda não tem stake neste pool

**Propósito:** Permite transferências contínuas de posições de organizações (por exemplo, comprometimento de endereço, rotação de carteira) sem perda ou retenção de recompensas.

#### 3.2.5 Saída forçada de emergência

**Função:** `forceExitUserToSelf(pid, user, claimRewards)` (apenas proprietário, nonReentrant)

**Comportamento:**

- Força a saída de um usuário de um pool, ignorando bloqueios
- Devolve o principal ao usuário imediatamente
- Opcionalmente cunha recompensas pendentes para o usuário
- Limpa bloqueio, dívida de recompensa e contadores de stakers ativos

**Caso de uso:** Controle de governança de emergência para remoção de pool quando os usuários precisam recuperar fundos; usado depois que um pool é encerrado.

#### 3.2.6 Atualizações da carteira de caridade

**Função:** `updateCharityWallet(pid, newWallet)` (apenas proprietário)

**Permite:** Atualizar o endereço de caridade de um pool (por exemplo, se comprometido ou em rotação para um novo endereço).

**Acompanhado por:** evento CharityWalletUpdated.

#### 3.2.7 Gestão de bloqueios

**Função:** `setLockedAmount(pid, user, amount)` (apenas charityFund)

**Regras:**

- Só pode AUMENTAR ou permanecer igual; nunca diminuir
- Não pode exceder o saldo do usuário
- Os bloqueios encolhem automaticamente se o saldo cair abaixo do valor bloqueado
- Destinados apenas a depósitos de bootstrap

**Observabilidade:**

As leituras analíticas são expostas por meio do **OBNStakingLens** (Seção 3.7) — a camada de leitura canônica para frontends e painéis. As leituras de bloqueio e saldo permanecem diretamente no contrato de staking:

- `pendingRewards(pid, user)` — Retorna o valor pendente BRUTO
- `pendingRewardsMultiple(pids[], user)` — Retorna valores pendentes de vários pools e o total
- `unlockedBalance(pid, user)` — Retorna o saldo menos o bloqueio
- `stakeElapsed(user)` — Total de segundos em staking (persiste após retiradas do staking)
- `charityContributedByUserInPool(pid, user)` — Total de charity cunhado atribuível ao usuário em um pool
- `totalCharityContributedByUser(user)` — Total de charity cunhado atribuível ao usuário em todos os pools

Consulte a Seção 3.7 para a superfície completa de visualizações do OBNStakingLens (getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor).

### 3.3 TeamVesting (linear, com cliff; não atualizável)

**Cliff:** ~4 meses; **Duração:** ~20 meses lineares depois disso.

**`release()`:** Transmite os tokens adquiridos para teamWallet.

**Auxiliares:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**Segurança:** Não é possível resgatar o token em vesting; apenas ERC20 recebidos por engano.

### 3.4 TheOffering (não atualizável)

TheOffering é o cofre anual de queimar ou doar do protocolo. O contrato de staking direciona a fatia de emissão de 1% de treasury para este endereço. O OBN acumula continuamente ao longo de cada ciclo anual.

Ao fim de cada ciclo, o AnnualGovernance executa o resultado da votação da Fase 1 da comunidade:

- **BURN:** A alocação registrada no início do ciclo é queimada permanentemente, reduzindo o fornecimento total de OBN.
- **GIVE:** A alocação registrada no início do ciclo é transferida para ExtendOliveBranch, aumentando a distribuição a organizações daquele ciclo.

**Controle de acesso:** `timelockOwner` (Timelock) controla funções administrativas, incluindo `emergencySweep`. `governance` (AnnualGovernance) é o único endereço autorizado a chamar `burn()` ou `sendToExtend()`. O endereço `governance` é inicializado como `address(0)` e conectado ao AnnualGovernance por `setGovernance()` por meio do Timelock.

**Não atualizável:** TheOffering é implantado como contrato padrão, sem proxy. Os argumentos do construtor (endereço do token `obn`, `timelockOwner`) são imutáveis. Se for necessária uma substituição, o Timelock deve implantar um novo contrato e chamar `setTreasury(newAddress)` no proxy de staking para redirecionar as emissões.

### 3.5 ExtendOliveBranch (não atualizável)

ExtendOliveBranch é o cofre de distribuição anual a organizações do protocolo. O contrato de staking direciona a fatia de emissão de 1% de charityFund para este endereço. O OBN acumula continuamente e também pode receber uma doação de TheOffering quando a comunidade vota GIVE na Fase 1.

Ao fim de cada ciclo, o AnnualGovernance executa a votação da Fase 2 da comunidade: a charityWallet do pool sem fins lucrativos vencedor recebe a alocação fixa do ciclo de ExtendOliveBranch em uma única transação.

**Registro de organizações aprovadas:** ExtendOliveBranch mantém uma lista de permissões de endereços destinatários aprovados. `setApprovedNonprofit(address, bool)` pode ser chamada pelo Timelock. Todas as carteiras de caridade dos pools são mantidas na lista de permissões; novos pools são aprovados de forma atômica junto com `addPool` por meio de `schedule_addPool.js`.

**Distribuição:** `distributeFromGovernance(to, amount)` só pode ser chamada pelo endereço `governance`. O cofre não repete a verificação da lista de permissões neste caminho: o AnnualGovernanceV2 valida cada destinatário quando seu lote de cédula é preparado e paga apenas ao membro da cédula selecionado.

**Não atualizável:** Mesma garantia de imutabilidade de TheOffering. Os argumentos do construtor (`obn`, `timelockOwner`) são imutáveis.

### 3.6 AnnualGovernanceV2 (implementação ativa; proxy UUPS existente)

O AnnualGovernance coordena os ciclos anuais de decisão tanto de TheOffering quanto de ExtendOliveBranch. Seu proxy UUPS existente, de propriedade do Timelock, foi atualizado para AnnualGovernanceV2 em **7 de outubro de 2026, no bloco 52283807 da Base**, conforme registrado na [documentação de implantação do repositório](README.md#annual-governance). O OliveAssembly fornece registro de NFT com checkpoints para as novas regras de votação. A implantação por si só não inicia um ciclo anual.

**Estrutura do ciclo:** Cada ciclo anual tem duas fases sequenciais:

1. **Fase 1 — Queimar ou doar:** Stakers registrados e elegíveis votam sobre a alocação de TheOffering registrada no início do ciclo. O resultado vencedor é executado de forma atômica: BURN chama `TheOffering.burn()`; GIVE chama `TheOffering.sendToExtend()`.

2. **Fase 2 — Seleção da organização:** Stakers registrados e elegíveis escolhem qual organização aprovada recebe a alocação de início de ciclo de ExtendOliveBranch mais a transferência GIVE daquele ciclo, se houver. Recebimentos posteriores permanecem para o próximo ciclo. Não há limite rígido de cédula: lotes sem permissão processam no máximo 100 IDs de pool por chamada em ordem crescente, excluindo pools totalmente removidos e eliminando duplicatas de carteiras de caridade. Pools encerrados permanecem elegíveis até serem totalmente removidos. A charityWallet vencedora recebe a alocação fixa por meio de `ExtendOliveBranch.distributeFromGovernance()`.

**Desempate:**

- Fase 1: GIVE só vence se seu total de votos exceder estritamente o de BURN. Um empate exato — ou participação zero — resulta em BURN.
- Fase 2: vence a organização com o maior total de votos; em caso de empate, vence a que aparece primeiro na cédula. Se nenhum voto for dado, o saldo é transferido para o próximo ciclo em vez de ser distribuído.

**Integridade da votação:**

- A elegibilidade exige um OliveNFT registrado no OliveAssembly e pelo menos 1 OBN em saldo agregado em staking em `block.number - 1` antes do início do ciclo. As duas fases compartilham esse snapshot; registro ou staking posteriores não podem adicionar poder ao ciclo, e saques posteriores não apagam seu direito.
- O poder de voto é a raiz quadrada do stake no snapshot: 100 OBN em staking dão 10 unidades de poder de voto. O contrato calcula `floor(sqrt(stakeInWei)) * 1e9`, expresso em unidades de 18 casas decimais. NFTs adicionais em uma carteira não acrescentam poder; os ciclos históricos anteriores à V2 mantêm sua ponderação linear original.
- O Safe voteAdmin inicia a Fase 1 diretamente, sem atraso do Timelock, e prepara o primeiro lote de cédula. Qualquer pessoa pode continuar a preparação e liquidar cada fase. A Fase 1 dura exatamente 30 dias e não pode ser liquidada até que a preparação da cédula esteja concluída; a Fase 2 recebe 30 dias completos a partir da liquidação real da Fase 1.

**Execução:** O AnnualGovernance chama TheOffering e ExtendOliveBranch diretamente. Nenhuma aprovação multisig adicional é necessária depois que uma votação termina — os resultados são impostos pelo contrato.

**Capacidade de atualização:** O AnnualGovernance é um proxy UUPS. Mecânicas de votação mais sofisticadas (delegação, requisitos de quórum, votação ponderada pelo tempo) podem ser adicionadas por atualizações governadas pelo Timelock à medida que a DAO amadurece.

**Momento da preparação:** A elegibilidade e o stake dos eleitores usam o snapshot do bloco anterior; os saldos dos fundos e o comprimento do histórico de pools são registrados na transação de início do Safe. O status de carteira/remoção de cada pool e a aprovação de cada novo destinatário são lidos quando seu lote é executado. IDs de pool posteriores são excluídos e os destinatários já admitidos permanecem fixos, mesmo que sua aprovação seja revogada depois. Um destinatário não aprovado reverte esse lote; o Timelock deve corrigir a configuração ou cancelar o ciclo antes da liquidação da Fase 1. Evite alterações na configuração de organizações durante a preparação.

**Parâmetros ativos e salvaguardas:** `owner` = Timelock; `voteAdmin` = OperatorSafe. O armazenamento legado `maxBallotSize` é mantido por compatibilidade, mas não restringe a participação. As atualizações de Governance e OliveAssembly ficam bloqueadas durante ciclos ativos, inclusive na preparação. O cancelamento só está disponível antes da execução da Fase 1. As alocações são reservas contábeis nos cofres existentes, não custódia segregada; um déficit deve ser reposto antes que a liquidação possa ter sucesso.

**Registro no OliveAssembly:** Aprove o proxy do Assembly para transferir um OliveNFT e depois chame `deposit(tokenId)` para registrá-lo. O Assembly mantém um NFT por carteira; o registro persiste entre ciclos até o saque. O depositante pode usar `withdraw()`, `withdrawTo(recipient)` ou `withdrawExpected(tokenId, recipient)` sem período de bloqueio. NFTs registrados não podem ser sacados por um administrador. O registro de NFT não estabelece identidade humana única.

### 3.7 OBNStakingLens (proxy UUPS)

O OBNStakingLens é um contrato analítico dedicado e somente leitura. É a camada de leitura canônica para frontends, painéis e ferramentas analíticas off-chain. Consolidar as leituras analíticas em um proxy atualizável separado mantém a superfície externa do contrato de staking mínima e estável, enquanto as capacidades analíticas podem evoluir de forma independente.

**Principais visualizações:**

- `getGlobalStats()` — Número de pools, TVL total, stakers únicos, recompensas atuais por segundo
- `getPoolStats(pid)` — Estatísticas por pool: carteira de caridade, valor em staking, número de stakers, estado do acumulador
- `getUserPoolView(pid, user)` — Dados de staking do usuário: saldo, bloqueio, recompensas pendentes, status ativo
- `getPoolAPR(pid)` — APR atual da parcela do staker em um pool
- `pendingCharityFor(pid, user)` — Estimativa da contribuição pendente atribuível a um usuário

**Controle de acesso:** `owner` (Timelock) controla as atualizações. O Lens lê do proxy de staking como chamador apenas de visualização e não mantém estado mutável próprio.

**Inicialização:** `initialize(stakingPools, timelock)` — define o endereço do proxy de staking e o proprietário Timelock.

---

## 4) Economia do token e sustentabilidade de longo prazo

### 4.1 Matemática de emissão (intuição)

Seja a base de APR da fase B (em BPS), o TVL global G e o TVL do pool P.

**Bruto anual para o pool:** YearlyPoolGross = P × (B / 10,000)

**Os stakers recebem 88% disso;** o restante vai para a charityWallet da organização (10%), ExtendOliveBranch (1%) e TheOffering (1%).

**O APR por token se simplifica para** 0.88 × (B / 10,000), **igual entre os pools** — independentemente do tamanho do fornecimento.

### 4.2 Emissões decrescentes sustentam a sustentabilidade

**Redução da pressão de venda:** Menor emissão ao longo do tempo reduz a pressão estrutural de venda.

**Demanda movida por causas:** O protocolo cria um alinhamento contínuo entre usuários, organizações sem fins lucrativos e credibilidade de longo prazo da rede.

**Credibilidade do TVL:** Os bloqueios de bootstrap criam TVL persistente, melhorando a confiança e a descoberta de preço.

**Previsibilidade:** Com divisões e fases on-chain, os participantes podem planejar a longo prazo.

**Histórico de contribuição:** A Proof-of-Contribution acrescenta outra forma de valor ao protocolo: evidência transparente de financiamento de bem público gerado pela participação dos usuários.

### 4.3 Minimalismo da divisão de emissões (1% + 1%)

Os usuários recebem 88%, o financiamento direto a organizações representa 10% e os 2% restantes acumulam em ExtendOliveBranch e TheOffering — cada um resolvido anualmente por votações de governança da comunidade.

Manter os fluxos acumulados pela governança em 1% cada garante que o protocolo permaneça enxuto e centrado no usuário e na caridade. Nenhum fluxo pode ser redirecionado silenciosamente; ambos são governados de forma transparente on-chain por meio do AnnualGovernance.

### 4.4 Fluxos anuais de governança (1% + 1%)

Os dois fluxos de emissão de 1% são governados pelo AnnualGovernance, cada um com um propósito claramente definido. A V2 registra os dois saldos no início do ciclo; a Fase 2 adiciona apenas a transferência GIVE daquele ciclo. Recebimentos posteriores permanecem para o próximo ciclo.

**ExtendOliveBranch (1% das emissões):** Acumula OBN continuamente ao longo de cada ciclo anual. Ao fim de cada ciclo, os stakers votam na Fase 2 do AnnualGovernance para selecionar qual pool sem fins lucrativos aprovado recebe a alocação fixa do ciclo. Isso dá à comunidade um mecanismo transparente e recorrente para direcionar recursos do protocolo a causas específicas.

**TheOffering (1% das emissões):** Acumula OBN continuamente. Ao fim de cada ciclo, os stakers votam na Fase 1 do AnnualGovernance para escolher entre dois resultados: BURN da alocação de início de ciclo (permanentemente deflacionário) ou GIVE para ExtendOliveBranch (adicional à distribuição daquele ciclo). Esta votação concede à comunidade controle contínuo sobre a política de fornecimento — uma decisão que se torna mais significativa à medida que o TVL do protocolo e o acúmulo anual crescem.

A estrutura completa de recompensas:

- A **alocação de 10% por ação** vai direta e atomicamente para a charityWallet do pool selecionado em cada resgate.
- O **fluxo de 1% de ExtendOliveBranch** acumula e é redistribuído anualmente a uma organização selecionada pela governança.
- O **fluxo de 1% de TheOffering** acumula e é queimado ou adicionado à distribuição a organizações daquele ano.

### 4.5 Capacidade de queima (dreno opcional)

O OBN é inflacionário por meio do staking, mas queimas voluntárias (por exemplo, futuras taxas de aplicativos) podem compensar a emissão — de forma descentralizada e guiada pelo mercado.

---

## 5) Mecânica do protocolo e justificativa

### 5.1 Distribuição a organizações

**Modelo por ação:** Em cada resgate/depósito/saque, 10% das recompensas pendentes do usuário são cunhados diretamente na charityWallet daquele pool.

**Execução atômica:** Sem chamadas externas ou buffers globais; todas as divisões acontecem dentro da transação do usuário.

**Sem disputa de alocação:** A caridade de cada pool é independente; não há função global de realocação.

**Proof-of-Contribution:** Como a distribuição de caridade está ligada às ações dos usuários e à seleção do pool, o protocolo pode atribuir a contribuição a usuários e pools sem fins lucrativos específicos.

### 5.2 Fluxos anuais de governança e Reserva de Sementes para Organizações

**Reserva de Sementes para Organizações:** Uma alocação de 300M OBN financia sementes permanentemente em staking de 1M OBN cada. Ela é separada das emissões contínuas de staking e das alocações anuais de governança. Consulte a Seção 11 para a contabilidade da reserva.

**ExtendOliveBranch (1% das emissões contínuas):** Acumula continuamente. As votações da Fase 2 do AnnualGovernance selecionam qual organização aprovada recebe a alocação fixa do ciclo. É o mecanismo anual de contribuição direcionada do protocolo.

**TheOffering (1% das emissões contínuas):** Acumula continuamente. As votações da Fase 1 do AnnualGovernance escolhem entre queimar a alocação de início de ciclo ou doá-la a ExtendOliveBranch. É o mecanismo anual de política de fornecimento do protocolo.

Esta distinção tripla é importante:

- A **parcela de recompensa de 10% para organizações** é automática, por ação e específica do pool.
- A **Reserva de Sementes para Organizações** financia stakes de bootstrap a partir de participações alocadas.
- Os **fluxos anuais de governança de 1% + 1%** são emissões contínuas resolvidas anualmente por votações da comunidade.

### 5.3 Bloqueios permanentes (apenas bootstrap; só aumentam)

**Política:** O administrador só pode aumentar lockedAmount e nunca diminuí-lo; os bloqueios encolhem automaticamente se o saldo do usuário cair abaixo do bloqueio armazenado.

**Propósito:** Puramente para o mecanismo de bootstrap. Os bloqueios garantem que o principal semeado não possa ser sacado, permitindo que o beneficiário ganhe rendimento desde o primeiro dia. Isso preserva a integridade do TVL e protege contra a venda imediata de tokens semeados.

**Os stakes dos usuários são desbloqueados por padrão;** os usuários sempre podem sacar seu saldo não bloqueado.

### 5.4 Sem controlador de emissões

As fases especificam totalmente a emissão; não há "botão de taxa" externo. A DAO pode acrescentar fases futuras de forma contígua com aviso prévio (timelock).

---

## 6) Organizações sem fins lucrativos: carteiras, integração e exibição

### 6.1 Uma carteira por pool

Cada pool corresponde a uma única charityWallet. Isso mantém o roteamento determinístico e os relatórios simples.

### 6.2 Listagem pelo endereço primeiro

Estamos indexando endereços Ethereum públicos que organizações respeitáveis já divulgam e integrando-os à nossa plataforma.

Além disso, estamos entrando em contato com organizações por e-mail e telefone para informá-las sobre nossa plataforma.

Cada página de caridade exibe por padrão um banner claro "Sem afiliação / Sem endosso", a menos que exista uma relação direta ou reconhecimento formal.


### 6.3 Programa de bootstrap

**Objetivo:** Garantir que cada organização recém-integrada ganhe desde o primeiro dia e que os pools comecem com TVL confiável.

**Origem dos fundos:** A Reserva de Sementes para Organizações de 300M OBN financia stakes de bootstrap de 1M OBN por organização. O financiamento de sementes pela comunidade apoia a integração contínua à medida que as reservas se esgotam; não há limite rígido de pools.

**Mecanismo:**

1. A governança ou o executor autorizado (o endereço `charityFund`, definido como ExtendOliveBranch) chama `charityFundBootstrap(pid, amount, beneficiary)` ou usa `depositForWithLock(pid, amount, beneficiary)` quando aplicável.
2. O OBN de bootstrap é colocado em staking e permanentemente bloqueado para o pool/beneficiário daquela organização.
3. O bloqueio impede o saque do principal semeado, eliminando o risco de venda imediata enquanto a posição gera rendimento continuamente.
4. A organização se beneficia tanto do rendimento da parcela de staker sobre sua posição de bootstrap bloqueada quanto da alocação de caridade de 10% do pool direcionada à charityWallet.

**Relatórios:** Cada bootstrap é transparente on-chain e incluído em divulgações públicas periódicas.

**Proteção:** `_enforceCharitySelfStakePolicy` garante que cada organização só possa receber uma posição de bootstrap bloqueada. Futuros stakes comuns devem vir de usuários externos, enquanto migrações de carteiras de organizações devem seguir o processo de migração controlado pela governança do protocolo.

### 6.4 Política de deslistagem

Se os padrões não forem atendidos, removemos a organização do nosso frontend e deixamos de promover aquele pool.

Os stakes e as recompensas pendentes dos usuários devem ser devolvidos a eles antes que o pool seja encerrado e removido do protocolo.

**Fechamento de um pool.** Quando uma organização sem fins lucrativos sai, seu pool é encerrado: novos stakes são bloqueados, enquanto os stakers existentes ainda podem retirar seu stake e resgatar, e os stakes que permanecem continuam rendendo na divisão habitual 88/10/1/1. Antes de o pool ser removido, é feita a saída forçada de cada staker restante: `forceExitUserToSelf` devolve cada stake, com as recompensas pendentes, para a carteira do próprio staker e não pode enviá-lo a nenhum outro lugar. O stake semente bloqueado da organização é devolvido à Reserva de Sementes para Organizações. Só então, sem mais nada em stake, o pool é removido.

A OBN é um protocolo de roteamento e staking, não uma organização sem fins lucrativos registrada nem uma certificadora. Os usuários devem verificar as organizações de forma independente e consultar profissionais tributários.

---

## 7) Governança e capacidade de atualização

### 7.1 Proxies UUPS e autoridade

As atualizações de Token, Staking, AnnualGovernance, Lens e OliveAssembly exigem autorização do proprietário Timelock. O OperatorSafe agenda alterações administrativas pelo Timelock de 24 horas. AnnualGovernance e OliveAssembly também rejeitam atualizações durante ciclos ativos.

As votações de alocação anual estão ativas sob o modelo de votação por raiz quadrada com registro de NFT. O Safe voteAdmin inicia os ciclos; chamadores sem permissão preparam cédulas e executam resultados. Isso não transfere a autoridade de atualização do protocolo aos eleitores anuais. Um controle mais amplo pela DAO continua sendo um passo futuro.

### 7.2 Fixado no código e governado

**Restrições fixadas no código ou no nível do contrato (exigem atualização para mudar, quando aplicável):**

- Divisão em quatro partes: 88% / 10% / 1% / 1%
- Cronograma de emissão de 10 anos (mudando a cada 2 anos): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Semântica de bloqueios administrativos (só aumentam, encolhimento automático)
- Minter único em OBNToken
- Política de auto-staking de organizações
- Garantias de atomicidade da migração de bootstrap
- Contabilidade de contribuição exposta pelas visualizações do contrato

**Governado (sem necessidade de atualização, salvo se uma implementação específica exigir):**

- Adicionar pools (`addPool(charityWallet)`)
- Executar stakes de bootstrap a partir da Reserva de Sementes para Organizações ou de uma fonte de financiamento comunitário autorizada
- Iniciar ciclos do AnnualGovernance pelo Safe voteAdmin; o AnnualGovernanceV2 deriva os membros da cédula por lotes sem permissão, não por curadoria discricionária
- Acrescentar fases futuras de forma contígua (`addPhase`)
- Encerrar ou remover pools
- Relatórios de gastos e uso de TheOffering e ExtendOliveBranch
- Padrões para integração, deslistagem, substituição e migração de organizações

### 7.3 Governança

A governança pode gerenciar quais organizações são incluídas, mas a premissa padrão deve ser que a OBN permaneça centrada em pools sem fins lucrativos.

### 7.4 AnnualGovernance

O AnnualGovernance é o mecanismo on-chain para as decisões recorrentes da comunidade OBN, oferecendo ciclos definidos e impostos por contrato para TheOffering e ExtendOliveBranch.

**Estrutura do ciclo:**

Cada ciclo começa quando o voteAdmin o abre. A Fase 1 e a Fase 2 ocorrem em sequência.

- **Fase 1 (Queimar ou doar):** Stakers registrados e elegíveis votam sobre a alocação de início de ciclo de TheOffering. BURN reduz permanentemente o fornecimento. GIVE transfere essa alocação para ExtendOliveBranch, aumentando a distribuição a organizações daquele ciclo.
- **Fase 2 (Seleção da organização):** Os stakers votam para selecionar qual pool sem fins lucrativos aprovado recebe a alocação fixa do ciclo de ExtendOliveBranch. Os lotes de cédula examinam IDs de pools elegíveis e validam suas carteiras de caridade contra a lista de permissões mantida em ExtendOliveBranch por meio de `setApprovedNonprofit`.

**Desempate:**

- Fase 1: BURN vence por padrão — GIVE precisa exceder estritamente o total de votos de BURN para vencer. Um empate (ou nenhum voto) resulta em BURN.
- Fase 2: vence a organização com mais votos; empates vão para a organização empatada com o menor índice de cédula. Se nenhum voto for dado, o saldo é transferido para o próximo ciclo em vez de ser distribuído.

**Integridade da votação:**

- São necessários um OliveNFT registrado e pelo menos 1 OBN de stake agregado no snapshot do bloco anterior. O poder de voto é a raiz quadrada do stake no snapshot, e as duas fases usam o mesmo direito (Seção 3.6).
- O AnnualGovernanceV2 não tem limite rígido de pools ou de cédula. Cada transação de preparação processa no máximo 100 IDs de pool; esse limite de trabalho não é um limite de participação. A Fase 2 aguarda a conclusão da preparação.
- O Safe inicia o ciclo uma vez; chamadas de keeper sem permissão preparam a cédula e executam as transições de fase. A Fase 2 recebe 30 dias completos a partir da liquidação real da Fase 1.

**Execução:**

O AnnualGovernance chama `TheOffering.burn()`, `TheOffering.sendToExtend()` ou `ExtendOliveBranch.distributeFromGovernance()` diretamente. Nenhuma aprovação multisig adicional é necessária depois que uma votação termina — o resultado é imposto pelo contrato.

**Capacidade de atualização:**

O AnnualGovernance é um proxy UUPS. O Timelock pode atualizá-lo para suportar mecânicas de votação mais sofisticadas (delegação, requisitos de quórum, poder ponderado pelo tempo) à medida que a DAO amadurece.

---

## 8) Modelo de segurança

### 8.1 Princípios fundamentais

- **Checks-Effects-Interactions:** Atualizações de estado antes de chamadas externas
- **Proteções contra reentrância:** nonReentrant em todos os caminhos de alteração
- **SafeERC20:** Usado em todas as transferências de token
- **Matemática de precisão:** Math.mulDiv para cálculos exatos
- **Sem laços ilimitados:** Endpoints por pool, atualizações limitadas

### 8.2 Reforço

**Operações atômicas:** Migração de bootstrap, remoção de pool e saída forçada são todas concluídas de forma atômica.

**Preservação de recompensas:** Validação explícita de que as recompensas pendentes são preservadas durante a migração (até a tolerância de 1 wei).

**Prevenção de overflow de bloqueio:** NewLock ≤ userBalance é imposto antes de definir valores bloqueados.

**Fallback da tesouraria:** Recompensas retidas são redirecionadas para treasury em vez de perdidas.

**Controles de emergência:** A saída forçada permite que a governança recupere usuários em emergências.

### 8.3 Compromissos de design

O APR igual mantém o foco no impacto, não em jogos de APR.

O mint de caridade por ação é atômico, mas exige mint em toda ação (compromisso de gas).

Acrescentar fases centraliza alguma discricionariedade; timelock + votação da DAO mitiga isso.

O AnnualGovernance resolve os saldos de TheOffering e ExtendOliveBranch por meio de votações comunitárias transparentes e responsáveis a cada ciclo.

---

## 9) Transparência e relatórios

### 9.1 Eventos

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 Visualizações

**OBNStakingLens (camada canônica de leitura analítica):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Relatórios de Proof-of-Contribution

Os relatórios de Proof-of-Contribution devem se tornar uma das camadas de transparência mais importantes da OBN.

Os painéis futuros podem mostrar:

- total de OBN contribuído para organizações
- total de OBN contribuído por pool
- contribuição total de OBN atribuível a cada usuário
- histórico vitalício de contribuição por carteira
- contribuição do usuário em vários pools sem fins lucrativos
- principais pools por contribuição
- stakers ativos por pool
- OBN atualmente em staking por pool
- emissões de caridade ao longo do tempo
- acúmulo, histórico de queima e histórico de doação de TheOffering por ciclo
- acúmulo e histórico de distribuição a organizações de ExtendOliveBranch por ciclo
- resultados de votação do AnnualGovernance por ciclo

Esses relatórios devem ajudar os usuários a entender não apenas o que ganharam, mas o que sua participação ajudou a gerar.

### 9.4 Divulgações

A OBN deve publicar relatórios públicos periódicos abrangendo:

- saldos da Reserva de Sementes para Organizações, implantações de sementes e a reserva separada do protocolo
- bootstraps executados
- status dos pools sem fins lucrativos
- adições, remoções ou migrações de pools
- distribuições diretas de caridade
- saldos, acúmulo e uso de TheOffering e ExtendOliveBranch por ciclo
- métricas de Proof-of-Contribution

---

## 10) Jornada do usuário

1. **Adquirir OBN** — Os usuários adquirem OBN por meio de fontes de liquidez disponíveis.
2. **Escolher um pool por causa** — O APR é igual entre os pools a qualquer momento, portanto os usuários escolhem com base na missão, não em diferenças de rendimento.
3. **Fazer staking** — Os usuários fazem staking com `deposit`, fazem staking para outro endereço com `depositFor` ou usam Permit quando há suporte.
4. **Ganhar recompensas** — Os usuários ganham a parcela das emissões destinada aos stakers.
5. **Gerar contribuição** — A organização selecionada recebe sua parcela definida pelo protocolo quando os usuários interagem com o pool.
6. **Construir Proof-of-Contribution** — A contribuição do usuário pode ser acompanhada entre pools e ao longo do tempo.
7. **Sacar o principal não bloqueado a qualquer momento** — Os bloqueios de bootstrap não se aplicam a stakes comuns de usuários.
8. **Votar em TheOffering** — Antes do início do ciclo, registre um OliveNFT no OliveAssembly e faça staking de pelo menos 1 OBN. As carteiras elegíveis votam na Fase 1 se a alocação fixa de TheOffering será queimada ou enviada para ExtendOliveBranch.
9. **Votar em ExtendOliveBranch** — As mesmas carteiras elegíveis votam então em qual organização aprovada recebe a alocação fixa do ciclo de ExtendOliveBranch.

A OBN foi projetada para que os usuários não precisem escolher entre ganhar e contribuir. Ambos acontecem por meio da mesma ação no protocolo.

---

## 11) Fornecimento e distribuição do token

**Fornecimento inicial:** 1,000,000,000 OBN.

**Distribuição gênese histórica (no initialize; não são saldos atuais de reserva):**

- 40% Liquidez
- 30% Airdrop
- 10% alocação de caridade original
- 10% Tesouraria
- 10% Equipe (para TeamVesting; cliff de ~4 meses, vesting linear de ~20 meses)

A Reserva de Sementes para Organizações tem alocação total de **300M OBN**, com **50M OBN** mantidos separadamente para necessidades do protocolo. As participações da tesouraria e do airdrop foram consolidadas na alocação de sementes. Naquele momento, 11M OBN já haviam financiado 11 sementes, restando 289M OBN para 289 sementes adicionais de 1M OBN cada.

**Emissão contínua:** Apenas por meio de emissões de staking; o contrato de staking é o único minter.

**Divisão de recompensas sobre as emissões:**

- 88% stakers
- 10% pool sem fins lucrativos selecionado
- 1% ExtendOliveBranch (distribuição anual a organizações)
- 1% TheOffering (votação anual de queimar ou doar)

**Queima voluntária:** Disponível por meio de burn para drenos futuros.

---

## 12) Roteiro (indicativo)

### 12.1 Germinação

- Formar o conceito base do protocolo
- Construir e testar os contratos inteligentes
- Implantar OBNToken e OBNStakingPools na Base
- Lançar o frontend inicial
- Prover liquidez inicial
- Realizar campanhas iniciais de airdrop
- Integrar Farcaster e fluxos de usuário nativos da Base
- Iniciar a indexação pública de carteiras de organizações
- Estabelecer a narrativa inicial de Proof-of-Contribution

### 12.2 Vegetação

- Implementar acompanhamento ampliado de contribuição no frontend
- Construir painéis de Proof-of-Contribution
- Melhorar as páginas de relatórios de organizações
- Operar ciclos anuais usando AnnualGovernanceV2 e OliveAssembly implantados, com registro e votação da comunidade e liquidação sem permissão
- Produzir mídia educacional
- Integrar organizações adicionais
- Explorar parcerias
- Contratar colaboradores essenciais quando possível
- Obter auditorias de segurança de terceiros
- Concluir o trabalho jurídico e de governança
- Construir e testar o backend/frontend da DAO

### 12.3 Florescimento

- Implantar a DAO e passar a governança à comunidade
- Transferir a autoridade de atualização por meio da governança timelock
- Transferir o voteAdmin do AnnualGovernance para um endereço controlado pela DAO à medida que a governança amadurece
- Manter a rede de organizações
- Atualizar o frontend com recursos da DAO
- Expandir as ferramentas de reputação de contribuição e de relatórios
- Manter e adaptar o protocolo à medida que as necessidades de bem público evoluem

---

## 13) Apêndice — Funções principais

### OBNStakingPools

**Alterações do usuário:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (apenas charityFund)
- `charityFundBootstrap(pid, amount, beneficiary)` (apenas charityFund)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — Apenas a carteira chamadora

**Execução delegada:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — Apenas executor; exige consentimento e mês atuais; 1–32 IDs de pool estritamente crescentes

**Alterações administrativas:**

- `claimFor(pid, user)` (apenas proprietário; independente do consentimento de autoclaim)
- `setAutoClaimExecutor(executor)` (apenas proprietário; zero pausa a automação)
- `initializeV931(executor)` (apenas proprietário, reinitializer único durante a atualização)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (apenas charityFund)
- `setVersion(newVersion)` (apenas proprietário)
- `upgradeTo(newImplementation, data)` (apenas proprietário, compatível com governança)

**Visualizações:**

- `pendingRewards(pid, user)` — Valor pendente BRUTO
- `pendingRewardsMultiple(pids[], user)` — Valores pendentes de vários pools e o total
- `autoClaimExecutor()` — Conta inteligente de automação autorizada
- `autoClaimPreference(user)` — Consentimento e nonce de consentimento
- `currentAutoClaimMonth()` — Ano UTC × 12 + mês (janeiro = 1)
- `lastAutoClaimMonth(pid, user)` — Último mês de autoclaim bem-sucedido
- `unlockedBalance(pid, user)` — Disponível para saque
- `stakeElapsed(user)` — Total de segundos em staking
- `poolLength()` — Número de pools
- `charityContributedByUserInPool(pid, user)` — Contribuições de caridade do usuário em um pool
- `totalCharityContributedByUser(user)` — Total de contribuições de caridade do usuário em todos os pools

Visualizações de exibição e analíticas como `getGlobalStats`, `getPoolStats`, `getUserPoolView`, `getUserStats` e `getPoolAPR` são expostas por meio do **OBNStakingLens** como camada canônica de leitura do frontend.

### OBNToken

**Alterações:**

- `setMinterOnce(minter)` (apenas proprietário, uma vez)
- `mint(to, amount)` (apenas minter)
- ERC20 padrão: `transfer`, `approve`, `transferFrom`
- Suporte a `permitAndCall` (EIP-2612)
- `burn(amount)` — Queima voluntária
- `delegate(delegatee)` — Delegação de votos (ERC20Votes)

**Visualizações:**

- ERC20 padrão: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**Alterações:**

- `release()` — Libera tokens adquiridos para teamWallet
- `updateTeamWallet(newWallet)` (apenas proprietário)
- `rescueERC20(token, amount)` (apenas proprietário, exceto o token em vesting)

**Visualizações:**

- `vestedAmount(timestamp)` — Total adquirido em um momento
- `claimableNow()` — Atualmente resgatável
- `timeUntilCliff()` — Contagem regressiva até o cliff
- `timeUntilNextRelease()` — Contagem regressiva até a próxima liberação
- `nextReleaseTimestamp()` — Horário da próxima liberação

### TheOffering

**Alterações de governança:**

- `burn(amount)` (apenas governance) — Queima a alocação fixa do ciclo após um voto BURN
- `sendToExtend(amount)` (apenas governance) — Envia a alocação fixa do ciclo para ExtendOliveBranch após um voto GIVE

**Alterações administrativas:**

- `setGovernance(newGovernance)` (apenas timelockOwner) — Conecta ou atualiza o endereço de governança; `address(0)` o pausa
- `emergencySweep(token, to)` (apenas timelockOwner)

### ExtendOliveBranch

**Alterações de distribuição:**

- `distribute(nonprofit, amount)` (timelockOwner ou governance) — Com aplicação da lista de permissões
- `distributeFromGovernance(nonprofit, amount)` (apenas governance) — Verificação da lista de permissões omitida intencionalmente; o destinatário já foi validado e congelado quando seu lote de cédula foi preparado

**Alterações administrativas:**

- `setApprovedNonprofit(nonprofit, approved)` (apenas timelockOwner) — Gerencia a lista de permissões de distribuição
- `setGovernance(newGovernance)` (apenas timelockOwner)
- `emergencySweep(token, to)` (apenas timelockOwner)

**Visualizações:**

- `approvedNonprofit(nonprofit)` — Status na lista de permissões

### AnnualGovernance

**Alterações do administrador de votação:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (apenas voteAdmin) — Exige que as duas durações sejam iguais a 2,592,000 segundos (30 dias); faz snapshot de elegibilidade, stake e alocações de fundos, congela o limite de contagem de pools e prepara o primeiro lote de cédula

**Alterações do usuário:**

- `castOfferingVote(cycleId, burn)` — Voto da Fase 1
- `castNonprofitVote(cycleId, nonprofit)` — Voto da Fase 2

**Execução sem permissão:**

- `prepareBallot(cycleId, maxPools)` processa de 1 a 100 IDs de pool por chamada durante a Fase 1
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — Avança a preparação incompleta da cédula ou liquida a fase pronta; qualquer pessoa pode chamá-la

**Administração do proprietário (Timelock):**

- `cancelCycle(cycleId)` — Apenas antes da execução da Fase 1
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)` (configuração legada de compatibilidade; não limita os membros da cédula V2)

**Visualizações:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` informa o progresso e a conclusão da preparação
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` informam alocações monetárias fixas
- `getCurrentVoterInfo(user)` informa a elegibilidade atual, distinta do snapshot de um ciclo existente
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` informam a participação e a liquidação confirmada
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — Elegibilidade por NFT específica do ciclo e poder de raiz quadrada; retorna o poder e o status de bootstrap de checkpoints

### OliveAssembly

- `deposit(tokenId)` registra um OliveNFT aprovado por carteira na custódia do Assembly
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` permitem saque controlado pelo depositante, sem período de bloqueio
- `registeredTokenId(user)` / `registeredCount()` informam os registros atuais; a contagem não implica elegibilidade de staking
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` informam snapshots históricos de registro

### OBNStakingLens

Camada analítica somente leitura; não mantém fundos. Recria visualizações de exibição/analíticas removidas de StakingPoolsV93 — todas as chamadas de escrita permanecem em OBNStakingPools.

**Visualizações:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — Poder de staking bruto com checkpoints, sem elegibilidade por NFT nem ponderação por raiz quadrada; use `getVotingPowerForCycle` do AnnualGovernanceV2 para a votação anual

**Administração:**

- `upgradeToAndCall(newImplementation, data)` (apenas proprietário)

---

## 14) Palavra final

Se estamos projetando os trilhos financeiros para as gerações futuras, devemos estar dispostos a fazer uma pergunta melhor:

Esses trilhos podem ajudar a criar um mundo melhor?

O cripto nos deu algo que não existia antes: a capacidade de programar comportamento no dinheiro. Um ativo digital não precisa mais ficar parado. Ele pode se mover por regra. Pode recompensar por regra. Pode direcionar valor por regra. Pode se tornar mais do que algo que as pessoas compram, vendem e especulam.

Isso deveria importar.

A Olive Branch Network nasceu da crença de que o dinheiro programável não deve ser indiferente. Se podemos projetar tokens para recompensar liquidez, proteger redes, financiar tesourarias e movimentar a governança, também podemos projetá-los para apoiar organizações que fazem o bem verificável no mundo.

A OBN é uma tentativa de provar que a contribuição pode ser incorporada diretamente ao próprio ativo.

Os usuários não precisam sacrificar seu principal para participar. Não precisam fazer uma doação separada. Não precisam escolher entre ganhar e ajudar. Quando os usuários fazem staking, ganham. Quando resgatam, as organizações recebem. Quando a rede cresce, a camada de contribuição cresce com ela.

Isso é Proof-of-Contribution.

O protocolo é intencionalmente simples em sua essência: os usuários fazem staking em pools sem fins lucrativos, as recompensas são divididas por contrato e uma parte das emissões é direcionada a causas do mundo real. A divisão de recompensas fixada no código mantém o sistema honesto. ExtendOliveBranch dá à comunidade uma forma recorrente de direcionar financiamento adicional. TheOffering oferece aos stakers uma escolha anual entre queimar fornecimento ou estender mais valor às organizações.

A OBN não é construída em torno da extração. É construída em torno do alinhamento.

Os usuários são recompensados por participar. As organizações recebem apoio contínuo. A governança decide como os fluxos anuais do protocolo são resolvidos. Cada ação deixa um registro on-chain transparente.

Este não é apenas um protocolo de staking.

É um motor de contribuição.

É uma camada de bem público.

É uma tentativa séria de responder a uma pergunta que o cripto evitou por tempo demais:

Se podemos programar o dinheiro para fazer quase qualquer coisa, por que não programá-lo para fazer o bem?

Cada stake se torna prova.

Cada resgate cria um registro.

Cada pool representa uma causa.

E a cada ano, a comunidade decide até onde estender o ramo de oliveira.

---

## Apêndice B — Contratos implantados (Base Mainnet)

Esta referência descreve o comportamento de staking da V9.3.1 e a atualização AnnualGovernanceV2 ativada em 7 de outubro de 2026 (bloco 52283807 da Base). A revisão de governança não altera a versão de staking. As transações de implantação, a ativação do proxy e a ativação do serviço são acompanhadas no [registro operacional de lançamento](governance-operations/2026-09-24-staking-v931-autoclaim-record.json).

Use o proxy de staking para depósitos, resgates, saques e alterações de consentimento. `MonthlyAutoClaimUpgradeable` está compilado na implementação V9.3.1 e não é implantado separadamente.

| Contrato | Tipo | Endereço | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | Votação por raiz quadrada com registro de NFT e preparação de cédula em lotes; atualizado em 7 de outubro de 2026. Use o proxy acima para interagir. | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Rede:** Base Mainnet (Chain ID: 8453)

**Notas principais:**

- OBNToken e OBNStakingPools usam o padrão de proxy UUPS para atualizações controladas pela governança
- TeamVesting e OBNTimeLock não são atualizáveis por design
- TheOffering e ExtendOliveBranch não são atualizáveis por design
- Todas as funções administrativas nos proxies UUPS passam pelo OBNTimeLock (atraso de 24 horas) por meio do OPERATOR_SAFE 2-of-3

---

**Versão:** 9.3.1 Proof-of-Contribution / revisão de governança AnnualGovernanceV2

**Data:** 13 de outubro de 2026

**Repositório canônico:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

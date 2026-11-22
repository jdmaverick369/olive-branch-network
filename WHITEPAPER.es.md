# Whitepaper de Olive Branch Network — Proof-of-Contribution

[English](WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · [한국어](WHITEPAPER.ko.md) · [日本語](WHITEPAPER.ja.md) · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · [Português](WHITEPAPER.pt.md) · **Español** · [Bahasa Indonesia](WHITEPAPER.id.md)

> Esta traducción se ofrece solo por comodidad. La versión en inglés ([WHITEPAPER.md](WHITEPAPER.md)) es la oficial; en caso de discrepancia, prevalece la versión en inglés. Esta traducción se realizó con ayuda de IA a partir de la revisión `3c740d855` y aún no ha sido revisada por un traductor profesional. Los nombres de contratos y funciones y las direcciones se mantienen en inglés.

## Propósito

Olive Branch Network es un protocolo de staking de Proof-of-Contribution diseñado para convertir la participación on-chain cotidiana en financiamiento continuo para organizaciones sin fines de lucro, a la vez que recompensa a los usuarios por participar. Los usuarios hacen staking de OBN en pools específicos de cada organización, obtienen emisiones de staking y ayudan a dirigir una parte definida de esas emisiones hacia causas del mundo real.

El objetivo no es pedir a los usuarios que elijan entre ganar y contribuir. El objetivo es que ambas cosas ocurran mediante la misma acción en el protocolo.

OBN introduce una capa de contribución en la que la actividad de staking crea registros on-chain transparentes vinculados a las causas que apoyan los usuarios. Cada stake, reclamo, distribución a una organización sin fines de lucro, voto de gobernanza, quema y asignación anual pasa a formar parte de un sistema público que se puede rastrear, verificar y ampliar.

Esta es la base de Proof-of-Contribution: un modelo en el que los activos digitales no solo se usan para especulación, rendimiento o gobernanza, sino también para una contribución medible.

Este documento define la arquitectura del protocolo, la economía del token, el modelo de pools sin fines de lucro, la estructura de gobernanza, la vía de actualización, los supuestos de seguridad y el proceso completo para apoyar a organizaciones sin fines de lucro mediante OBN.

---

## 1) Resumen ejecutivo

**Misión:** Hacer de la contribución el camino de menor resistencia, dirigiendo una porción fija de las emisiones de staking a billeteras de pools sin fines de lucro aprobados, de forma automática, transparente y verificable on-chain.

**Idea central:** OBN se construye en torno a **Proof-of-Contribution**: un modelo en el que los usuarios demuestran participación no solo haciendo staking de capital, sino ayudando continuamente a dirigir valor hacia causas sin fines de lucro del mundo real. Cada stake, reclamo y flujo de recompensas para organizaciones pasa a formar parte de una capa de contribución on-chain.

**Mecanismo:** Los usuarios hacen staking de OBN en pools específicos de cada organización. La división de emisiones está fijada en el código: 88% para stakers, 10% directo a la organización, 1% para ExtendOliveBranch (distribución anual a organizaciones), 1% para TheOffering (votación anual de quemar o dar).

**Garantías de diseño:**

- División fija en cuatro partes (88/10/1/1) a nivel de contrato
- APR por token igual en todos los pools en cualquier momento (los APR de los pools se normalizan por diseño)
- Contabilidad de Proof-of-Contribution mediante flujos de financiamiento on-chain y vistas de contribución de los usuarios
- Una charityWallet por pool; sin indicadores "retire/active" en los pools
- Los bloqueos del administrador solo pueden aumentar y se reducen automáticamente si baja el saldo; destinados únicamente al bootstrap
- Minter único: después de setMinterOnce, solo el contrato de staking puede acuñar OBN
- Fases de emisión basadas en marcas de tiempo con un calendario decreciente de 10 años
- Protección contra el autostaking de organizaciones, gestión del ciclo de vida de pools, migración atómica de bootstrap, controles de salida forzada de emergencia

**Gobernanza y capacidad de actualización:** Proxies UUPS propiedad de Timelock para Token, Staking, AnnualGovernance, Lens y OliveAssembly. AnnualGovernanceV2 está activo desde el 7 de octubre de 2026: el registro de NFT y el stake en la instantánea determinan el poder de voto por raíz cuadrada para las asignaciones anuales. Un control más amplio por parte de la DAO sigue siendo un paso futuro de gobernanza.

---

## 2) Proof-of-Contribution

### 2.1 Qué significa Proof-of-Contribution

Proof-of-Contribution es la identidad central de OBN.

En los sistemas de staking tradicionales, los usuarios demuestran participación bloqueando capital y obteniendo rendimiento. OBN conserva esa base de staking, pero añade una segunda capa: cada acción del usuario también ayuda a financiar un pool sin fines de lucro. Esto significa que la participación no se mide solo por especulación, propiedad o extracción de rendimiento. También se mide por la contribución.

Cuando un usuario hace staking de OBN en un pool sin fines de lucro, no solo elige dónde ganar recompensas. Elige qué causa apoya su participación. Cuando reclama recompensas, el protocolo acuña automáticamente la parte de la organización en la charityWallet del pool seleccionado. El resultado es un registro on-chain transparente de la contribución generada mediante la participación habitual en el protocolo.

Así, OBN convierte el staking en un mecanismo de contribución.

### 2.2 Por qué importa

La mayoría de los protocolos cripto miden el éxito por liquidez, volumen, precio, usuarios y TVL. OBN conserva estas métricas, pero añade otra medida importante: cuánto valor dirige la red hacia organizaciones de bien público.

Esto crea un tipo diferente de efecto de red:

- Más usuarios crean más actividad de staking
- Más actividad de staking crea más emisiones
- Más emisiones crean más financiamiento para organizaciones
- Más financiamiento para organizaciones crea un impacto más visible
- Un impacto más visible refuerza la identidad y la credibilidad del protocolo

Proof-of-Contribution alinea el interés propio con el bien público. Los usuarios pueden ganar, las organizaciones pueden recibir y el protocolo puede construir un historial transparente de contribución sin exigir a los usuarios donaciones separadas.

### 2.3 La contribución como capa de identidad on-chain

OBN puede rastrear la contribución mediante vistas actuales y futuras del protocolo, entre ellas:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- distribuciones benéficas a nivel de pool
- total de charity acuñado para cada billetera de organización
- tiempo en staking e historial de participación

Estas métricas permiten al protocolo construir futuros paneles de contribución, perfiles de impacto de usuarios, páginas de informes de organizaciones y herramientas de gobernanza. Con el tiempo, Proof-of-Contribution puede convertirse en una capa de identidad que muestre cómo participaron los usuarios en la red y qué causas ayudaron a apoyar.

Esto no exige a los usuarios sacrificar rendimiento. El protocolo está diseñado para que ganar y contribuir ocurran en la misma acción.

---

## 3) Conjunto de contratos

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**Estándares:** ERC20, EIP-2612 Permit, ERC20Votes (poder de voto con checkpoints), Burnable.

**Funciones principales:**

- **ERC20Upgradeable:** Transferencias, aprobaciones y saldos estándar del token
- **ERC20PermitUpgradeable:** permit() de EIP-2612 para aprobaciones sin gas
- **ERC20VotesUpgradeable:** Poder de voto con checkpoints para gobernanza (delegación de votos, consultas históricas)
- **ERC20BurnableUpgradeable:** Los usuarios pueden quemar tokens voluntariamente
- **UUPSUpgradeable:** Actualizable con autorización del propietario
- **OwnableUpgradeable:** Propietario único con capacidad de transferencia

**Acuñación génesis histórica (una sola vez en initialize)** del suministro inicial de 1,000,000,000 OBN. Estos destinos originales de acuñación no representan asignaciones actuales de reservas sin gastar:

- 40% Liquidez — para el bootstrap de pools en DEX
- 30% Airdrop — distribución temprana a la comunidad
- 10% asignación benéfica original
- 10% Tesorería — para la gobernanza y las operaciones del protocolo
- 10% Equipo — al contrato TeamVesting con cliff y calendario de vesting

La distribución total está fijada en el código en `initialize()` y ocurre de forma atómica; no hay acuñación adicional durante el génesis.

**Modelo de minter único (regla estricta):**

- `setMinterOnce(address minterAddr)` establece exactamente un minter (el contrato de staking) y solo puede llamarse una vez
- Después de llamar a `setMinterOnce`, el minter no puede cambiarse sin actualizar el contrato
- Solo el minter puede llamar a `mint(to, amount)` para distribuir recompensas de staking
- Esta restricción fijada en el código elimina el riesgo de emisión arbitraria y garantiza un suministro predecible del token

**Control de actualización:** UUPS con `_authorizeUpgrade` restringido al propietario (pasará a control de la DAO después del bootstrap).

**Delegación de votos:** Los usuarios pueden usar `delegate(delegatee)` para dirigir su poder de voto (patrón ERC20Votes).

**¿Por qué esta estructura?**
La distribución única elimina la ambigüedad sobre el suministro inicial. Un minter único elimina el riesgo de emisión arbitraria. ERC20Votes alinea el token con el control de la DAO y hace posible la gobernanza futura. La capacidad de quema ofrece un sumidero voluntario para futuras integraciones. La compatibilidad con Permit (EIP-2612) mejora la experiencia al eliminar transacciones de aprobación separadas.

### 3.2 OBNStakingPools (fases por marca de tiempo, contabilidad por pool, UUPS)

**División de recompensas fijada en el código (BPS):**

- STAKER_BPS = 8_800 → 88% para los usuarios
- CHARITY_BPS = 1_000 → 10% a la billetera benéfica (directo, por acción)
- CHARITY_FUND_BPS = 100 → 1% a ExtendOliveBranch
- TREASURY_BPS = 100 → 1% a TheOffering

La dirección `charityFund` dirige a **ExtendOliveBranch** y la dirección `treasury` dirige a **TheOffering**. Ambas acumulan OBN durante cada ciclo anual. AnnualGovernance resuelve ambos saldos mediante votaciones de la comunidad al final de cada ciclo. Consulta las Secciones 3.4–3.6 para ver detalles de los contratos.

**Fases de emisión (inicializadas en el despliegue):**

- Años 0–2: 10.00% APY
- Años 2–4: 7.50% APY
- Años 4–6: 5.00% APY
- Años 6–8: 2.50% APY
- Años 8–10: 1.25% APY

La gobernanza puede añadir fases futuras de forma contigua; las fases anteriores permanecen inmutables.

**APR igual por pool:** Por construcción, el APR por token depende solo de la fase activa, no del pool que elijas.

**Contabilidad de Proof-of-Contribution:** El contrato de staking expone vistas de contribución de usuarios y pools que permiten al protocolo calcular cuánto financiamiento para organizaciones es atribuible a la participación de cada usuario.

**Modelo de datos:** PoolInfo { address charityWallet; uint256 totalStaked; } (una billetera por pool).

#### 3.2.1 Acciones principales del usuario

**Endpoints acotados por pool:**

- `deposit(pid, amount)` — Hacer staking de OBN en un pool
- `depositFor(pid, amount, beneficiary)` — Hacer staking en nombre de otra dirección
- `depositWithPermit(...)` — Hacer staking con ERC20 Permit (sin aprobación separada)
- `withdraw(pid, amount)` — Retirar saldo desbloqueado
- `claim(pid)` — Reclamar recompensas pendientes
- `claimFor(pid, user)` — Reclamo en nombre de otra dirección, solo para el propietario
- `claimMultiple(pids[])` — Reclamar recompensas pendientes de varios pools en una transacción
- `setAutoClaimEnabled(bool)` — Establecer el consentimiento de la billetera que llama para todos sus pools
- `autoClaimFor(pids[], user, month, consentNonce)` — Un ejecutor dedicado envía un lote mensual autorizado

Los stakers pueden optar on-chain por el autoclaim mensual patrocinado para todos los pools actuales y futuros de su billetera. La cuenta de automatización agrupa pools con recompensas reclamables positivas del usuario, hasta 32 pools por transacción, y paga el gas mediante el paymaster configurado. El contrato permite un reclamo automático exitoso por pool cada mes calendario UTC. Las recompensas siguen la misma división 88% / 10% / 1% / 1% y van a los mismos destinatarios que los reclamos manuales. Los usuarios pueden desactivar el consentimiento en cualquier momento; los depósitos, retiros y reclamos manuales siguen disponibles. El autoclaim no transfiere capital, no reinvierte recompensas ni cambia el poder de voto.

Los cambios de consentimiento invalidan las solicitudes puestas en cola anteriormente. Volver a activarlo no restablece los límites mensuales. Un mes calendario UTC no es un intervalo móvil de 30 días; los reclamos manuales no consumen la asignación automática. Un pool es elegible cuando la parte del usuario tras el redondeo entero es positiva, sin un umbral mínimo de recompensa a nivel de servicio. El patrocinio de la transacción de alta o baja depende de la compatibilidad de la billetera. El `claimFor` exclusivo del propietario sigue siendo independiente del consentimiento de autoclaim. El estado de despliegue y activación se registra en el Apéndice B.

Las preferencias de autoclaim están vinculadas a direcciones de staking y se mantienen separadas de cualquier futuro sistema de identidad o elegibilidad de voto. El ejecutor no puede redirigir recompensas, retirar el stake de un usuario ni cambiar su consentimiento.

**Mecánica benéfica:**

- El 10% de las recompensas se acuña por cada acción del usuario (reclamo, depósito, retiro) directamente en la charityWallet de ese pool
- El 1% se acumula continuamente en ExtendOliveBranch; la comunidad vota en cada ciclo qué organización aprobada recibe la asignación fija del ciclo
- El 1% se acumula continuamente en TheOffering; la comunidad vota en cada ciclo si quema la asignación fijada al inicio del ciclo o la dona a ExtendOliveBranch
- Sin búfer global de TVL; las divisiones ocurren por acción para una ejecución atómica

#### 3.2.2 Gestión del ciclo de vida del pool

**Mecanismo de cierre:**

- `shutdownPool(pid)` — Bloquea NUEVOS depósitos; los reclamos y retiros continúan
- Permite a los usuarios salir ordenadamente sin eliminar el pool
- Los datos del pool permanecen intactos para los stakers

**Eliminación de pool:**

- `removePool(pid)` — Eliminación lógica una vez que el pool está completamente vacío (totalStaked == 0)
- Sin reindexación de PID; compatible con versiones anteriores
- **Seguridad de la tesorería:** Si se acumula charity heredado antes de la eliminación, se envía a la charityWallet del pool; si la billetera es cero, se redirige a treasury
- Evita la pérdida de recompensas si los usuarios reclaman después de la eliminación

#### 3.2.3 Protección contra el autostaking de organizaciones

**Política:** Las organizaciones pueden recibir exactamente UN depósito de bootstrap bloqueado permanentemente. Cualquier otro autostaking está bloqueado.

**Aplicación:** La función `_enforceCharitySelfStakePolicy` comprueba:

- ¿El beneficiario es la billetera benéfica del pool?
- Si es así, ¿proviene de charityFund Y está bloqueado Y su saldo actual es cero?
- Si todo es verdadero, se permite (primer bootstrap). En caso contrario, se rechaza.

**Justificación:** Evita autostakes accidentales o maliciosos de organizaciones que podrían romper la dinámica de recompensas del pool o permitir ataques.

#### 3.2.4 Migración atómica de bootstrap

**Función:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**Garantías atómicas:**

- Conserva las recompensas pendientes (verificado hasta una tolerancia de 1 wei)
- Copia los montos bloqueados de forma segura con prevención de desbordamiento
- Actualiza la billetera benéfica de forma atómica en la misma transacción
- Desactiva los contadores de pool del usuario anterior
- Activa al nuevo usuario si es su primer stake en un pool

**Condiciones previas:**

- oldNonprofit ES la billetera benéfica actual del pool
- oldNonprofit ≠ newNonprofit
- oldNonprofit tiene un stake distinto de cero
- newNonprofit aún no tiene stake en este pool

**Propósito:** Permite transferencias fluidas de posiciones de organizaciones (por ejemplo, compromiso de dirección, rotación de billetera) sin pérdida ni bloqueo de recompensas.

#### 3.2.5 Salida forzada de emergencia

**Función:** `forceExitUserToSelf(pid, user, claimRewards)` (solo propietario, nonReentrant)

**Comportamiento:**

- Fuerza la salida de un usuario de un pool, ignorando bloqueos
- Devuelve el capital al usuario de inmediato
- Opcionalmente acuña las recompensas pendientes para el usuario
- Borra el bloqueo, la deuda de recompensas y los contadores de stakers activos

**Caso de uso:** Control de gobernanza de emergencia para la eliminación de un pool cuando los usuarios necesitan recuperar fondos; se usa después de cerrar un pool.

#### 3.2.6 Actualizaciones de la billetera benéfica

**Función:** `updateCharityWallet(pid, newWallet)` (solo propietario)

**Permite:** Actualizar la dirección benéfica de un pool (por ejemplo, si está comprometida o se rota a una dirección nueva).

**Se rastrea mediante:** el evento CharityWalletUpdated.

#### 3.2.7 Gestión de bloqueos

**Función:** `setLockedAmount(pid, user, amount)` (solo charityFund)

**Reglas:**

- Solo puede AUMENTAR o mantenerse igual; nunca disminuir
- No puede superar el saldo del usuario
- Los bloqueos se reducen automáticamente si el saldo cae por debajo del monto bloqueado
- Destinados únicamente a depósitos de bootstrap

**Observabilidad:**

Las lecturas analíticas se ofrecen mediante **OBNStakingLens** (Sección 3.7), la capa de lectura canónica para frontends y paneles. Las lecturas de bloqueos y saldos permanecen directamente en el contrato de staking:

- `pendingRewards(pid, user)` — Devuelve el monto pendiente BRUTO
- `pendingRewardsMultiple(pids[], user)` — Devuelve los montos pendientes de varios pools y el total
- `unlockedBalance(pid, user)` — Devuelve el saldo menos el bloqueo
- `stakeElapsed(user)` — Total de segundos en staking (persiste tras retirar el staking)
- `charityContributedByUserInPool(pid, user)` — Total de charity acuñado atribuible al usuario en un pool
- `totalCharityContributedByUser(user)` — Total de charity acuñado atribuible al usuario en todos los pools

Consulta la Sección 3.7 para ver la superficie completa de vistas de OBNStakingLens (getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor).

### 3.3 TeamVesting (lineal, con cliff; no actualizable)

**Cliff:** ~4 meses; **Duración:** ~20 meses lineales después.

**`release()`:** Transmite los tokens adquiridos a teamWallet.

**Auxiliares:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**Seguridad:** No se puede rescatar el token en vesting; solo ERC20 recibidos por error.

### 3.4 TheOffering (no actualizable)

TheOffering es la bóveda anual de quemar o dar del protocolo. El contrato de staking dirige la franja de emisión de 1% de treasury a esta dirección. El OBN se acumula continuamente durante cada ciclo anual.

Al final de cada ciclo, AnnualGovernance ejecuta el resultado de la votación de la Fase 1 de la comunidad:

- **BURN:** La asignación registrada al inicio del ciclo se quema permanentemente, lo que reduce el suministro total de OBN.
- **GIVE:** La asignación registrada al inicio del ciclo se transfiere a ExtendOliveBranch, lo que aumenta la distribución a organizaciones de ese ciclo.

**Control de acceso:** `timelockOwner` (Timelock) controla las funciones administrativas, incluida `emergencySweep`. `governance` (AnnualGovernance) es la única dirección autorizada para llamar a `burn()` o `sendToExtend()`. La dirección `governance` se inicializa como `address(0)` y se conecta a AnnualGovernance mediante `setGovernance()` a través del Timelock.

**No actualizable:** TheOffering se despliega como contrato estándar sin proxy. Los argumentos del constructor (dirección del token `obn`, `timelockOwner`) son inmutables. Si se requiere un reemplazo, el Timelock debe desplegar un nuevo contrato y llamar a `setTreasury(newAddress)` en el proxy de staking para redirigir las emisiones.

### 3.5 ExtendOliveBranch (no actualizable)

ExtendOliveBranch es la bóveda de distribución anual a organizaciones del protocolo. El contrato de staking dirige la franja de emisión de 1% de charityFund a esta dirección. El OBN se acumula continuamente y también puede recibir una donación de TheOffering cuando la comunidad vota GIVE en la Fase 1.

Al final de cada ciclo, AnnualGovernance ejecuta la votación de la Fase 2 de la comunidad: la charityWallet del pool sin fines de lucro ganador recibe la asignación fija del ciclo de ExtendOliveBranch en una sola transacción.

**Registro de organizaciones aprobadas:** ExtendOliveBranch mantiene una lista blanca de direcciones receptoras aprobadas. `setApprovedNonprofit(address, bool)` puede ser llamada por el Timelock. Todas las billeteras benéficas de los pools se mantienen en la lista blanca; los nuevos pools se aprueban de forma atómica junto con `addPool` mediante `schedule_addPool.js`.

**Distribución:** `distributeFromGovernance(to, amount)` solo puede ser llamada por la dirección `governance`. La bóveda no repite la comprobación de la lista blanca en esta vía: AnnualGovernanceV2 valida a cada destinatario cuando se prepara su lote de boleta y solo paga al miembro de la boleta seleccionado.

**No actualizable:** La misma garantía de inmutabilidad que TheOffering. Los argumentos del constructor (`obn`, `timelockOwner`) son inmutables.

### 3.6 AnnualGovernanceV2 (implementación activa; proxy UUPS existente)

AnnualGovernance coordina los ciclos anuales de decisión tanto de TheOffering como de ExtendOliveBranch. Su proxy UUPS existente, propiedad de Timelock, se actualizó a AnnualGovernanceV2 el **7 de octubre de 2026, en el bloque 52283807 de Base**, como consta en la [documentación de despliegue del repositorio](README.md#annual-governance). OliveAssembly proporciona el registro de NFT con checkpoints para las nuevas reglas de votación. El despliegue por sí solo no inicia un ciclo anual.

**Estructura del ciclo:** Cada ciclo anual tiene dos fases secuenciales:

1. **Fase 1 — Quemar o dar:** Los stakers registrados y elegibles votan sobre la asignación de TheOffering registrada al inicio del ciclo. El resultado ganador se ejecuta de forma atómica: BURN llama a `TheOffering.burn()`; GIVE llama a `TheOffering.sendToExtend()`.

2. **Fase 2 — Selección de la organización:** Los stakers registrados y elegibles eligen qué organización aprobada recibe la asignación de inicio de ciclo de ExtendOliveBranch más la transferencia GIVE de ese ciclo, si la hay. Los ingresos posteriores quedan para el siguiente ciclo. No hay un límite estricto de boleta: los lotes sin permiso procesan como máximo 100 ID de pool por llamada en orden ascendente, excluyendo los pools totalmente eliminados y eliminando duplicados de billeteras benéficas. Los pools cerrados siguen siendo elegibles hasta que se eliminen por completo. La charityWallet ganadora recibe la asignación fija mediante `ExtendOliveBranch.distributeFromGovernance()`.

**Desempate:**

- Fase 1: GIVE solo gana si su total de votos supera estrictamente al de BURN. Un empate exacto — o participación cero — se resuelve como BURN.
- Fase 2: gana la organización con el mayor total de votos; en caso de empate, gana la que aparece primero en la boleta. Si no se emite ningún voto, el saldo pasa al siguiente ciclo en lugar de distribuirse.

**Integridad de la votación:**

- La elegibilidad requiere un OliveNFT registrado en OliveAssembly y al menos 1 OBN de saldo agregado en staking en `block.number - 1` antes del inicio del ciclo. Ambas fases comparten esa instantánea; un registro o staking posterior no puede añadir poder al ciclo, y los retiros posteriores no borran su derecho.
- El poder de voto es la raíz cuadrada del stake en la instantánea: 100 OBN en staking dan 10 unidades de poder de voto. El contrato calcula `floor(sqrt(stakeInWei)) * 1e9`, expresado en unidades de 18 decimales. Los NFT adicionales en una billetera no añaden poder; los ciclos históricos anteriores a V2 conservan su ponderación lineal original.
- La Safe voteAdmin inicia la Fase 1 directamente, sin retraso de Timelock, y prepara el primer lote de boleta. Cualquiera puede continuar la preparación y liquidar cada fase. La Fase 1 dura exactamente 30 días y no puede liquidarse hasta que se complete la preparación de la boleta; la Fase 2 recibe 30 días completos desde la liquidación real de la Fase 1.

**Ejecución:** AnnualGovernance llama directamente a TheOffering y ExtendOliveBranch. No se requiere aprobación multisig adicional una vez que concluye una votación: los resultados los impone el contrato.

**Capacidad de actualización:** AnnualGovernance es un proxy UUPS. Se pueden añadir mecánicas de votación más sofisticadas (delegación, requisitos de quórum, votación ponderada por tiempo) mediante actualizaciones gobernadas por Timelock a medida que madura la DAO.

**Momento de la preparación:** La elegibilidad y el stake de los votantes usan la instantánea del bloque anterior; los saldos de los fondos y la longitud del historial de pools se registran en la transacción de inicio de la Safe. El estado de billetera/eliminación de cada pool y la aprobación de cada nuevo destinatario se leen cuando se ejecuta su lote. Los ID de pool posteriores quedan excluidos y los destinatarios ya admitidos permanecen fijos, incluso si su aprobación se revoca después. Un destinatario no aprobado revierte ese lote; el Timelock debe corregir la configuración o cancelar el ciclo antes de la liquidación de la Fase 1. Evita cambios en la configuración de organizaciones durante la preparación.

**Parámetros activos y salvaguardas:** `owner` = Timelock; `voteAdmin` = OperatorSafe. El almacenamiento heredado `maxBallotSize` se conserva por compatibilidad, pero no restringe la membresía. Las actualizaciones de Governance y OliveAssembly están bloqueadas durante los ciclos activos, incluida la preparación. La cancelación solo está disponible antes de que se ejecute la Fase 1. Las asignaciones son reservas contables en las bóvedas existentes, no custodia segregada; un déficit debe reponerse antes de que la liquidación pueda tener éxito.

**Registro en OliveAssembly:** Aprueba al proxy de Assembly para transferir un OliveNFT y luego llama a `deposit(tokenId)` para registrarlo. Assembly mantiene un NFT por billetera; el registro persiste entre ciclos hasta el retiro. El depositante puede usar `withdraw()`, `withdrawTo(recipient)` o `withdrawExpected(tokenId, recipient)` sin período de bloqueo. Un administrador no puede retirar NFT registrados. El registro de NFT no establece una identidad humana única.

### 3.7 OBNStakingLens (proxy UUPS)

OBNStakingLens es un contrato analítico dedicado de solo lectura. Es la capa de lectura canónica para frontends, paneles y herramientas analíticas off-chain. Consolidar las lecturas analíticas en un proxy actualizable independiente mantiene mínima y estable la superficie externa del contrato de staking, mientras las capacidades analíticas pueden evolucionar de forma independiente.

**Vistas clave:**

- `getGlobalStats()` — Número de pools, TVL total, stakers únicos, recompensas actuales por segundo
- `getPoolStats(pid)` — Estadísticas por pool: billetera benéfica, monto en staking, número de stakers, estado del acumulador
- `getUserPoolView(pid, user)` — Datos de staking del usuario: saldo, bloqueo, recompensas pendientes, estado activo
- `getPoolAPR(pid)` — APR actual de la parte del staker en un pool
- `pendingCharityFor(pid, user)` — Estimación de la contribución pendiente atribuible a un usuario

**Control de acceso:** `owner` (Timelock) controla las actualizaciones. Lens lee del proxy de staking como llamador de solo vista y no tiene estado mutable propio.

**Inicialización:** `initialize(stakingPools, timelock)` — establece la dirección del proxy de staking y el propietario Timelock.

---

## 4) Economía del token y sostenibilidad a largo plazo

### 4.1 Matemática de emisión (intuición)

Sea B la base de APR de la fase (en BPS), G el TVL global y P el TVL del pool.

**Bruto anual para el pool:** YearlyPoolGross = P × (B / 10,000)

**Los stakers reciben el 88% de eso;** el resto va a la charityWallet de la organización (10%), ExtendOliveBranch (1%) y TheOffering (1%).

**El APR por token se simplifica a** 0.88 × (B / 10,000), **igual en todos los pools** — independientemente del tamaño del suministro.

### 4.2 Las emisiones decrecientes respaldan la sostenibilidad

**Reducción de la presión de venta:** Una menor emisión con el tiempo reduce la presión estructural de venta.

**Demanda impulsada por causas:** El protocolo crea una alineación continua entre usuarios, organizaciones y la credibilidad a largo plazo de la red.

**Credibilidad del TVL:** Los bloqueos de bootstrap crean TVL persistente, lo que mejora la confianza y el descubrimiento de precios.

**Previsibilidad:** Con las divisiones y las fases on-chain, los participantes pueden planificar a largo plazo.

**Historial de contribución:** Proof-of-Contribution añade otra forma de valor al protocolo: evidencia transparente de financiamiento de bien público generado por la participación de los usuarios.

### 4.3 Minimalismo de la división de emisiones (1% + 1%)

Los usuarios reciben el 88%, el financiamiento directo a organizaciones representa el 10% y el 2% restante se acumula en ExtendOliveBranch y TheOffering, cada uno resuelto anualmente mediante votaciones de gobernanza de la comunidad.

Mantener los flujos acumulados para gobernanza en 1% cada uno garantiza que el protocolo siga siendo ligero y centrado en los usuarios y la beneficencia. Ningún flujo puede redirigirse silenciosamente; ambos se gobiernan de forma transparente on-chain mediante AnnualGovernance.

### 4.4 Flujos anuales de gobernanza (1% + 1%)

Los dos flujos de emisión de 1% están gobernados por AnnualGovernance, cada uno con un propósito claramente definido. V2 registra ambos saldos al inicio del ciclo; la Fase 2 añade solo la transferencia GIVE de ese ciclo. Los ingresos posteriores quedan para el siguiente ciclo.

**ExtendOliveBranch (1% de las emisiones):** Acumula OBN continuamente durante cada ciclo anual. Al final de cada ciclo, los stakers votan en la Fase 2 de AnnualGovernance para seleccionar qué pool sin fines de lucro aprobado recibe la asignación fija del ciclo. Esto da a la comunidad un mecanismo transparente y recurrente para dirigir recursos del protocolo hacia causas específicas.

**TheOffering (1% de las emisiones):** Acumula OBN continuamente. Al final de cada ciclo, los stakers votan en la Fase 1 de AnnualGovernance para elegir entre dos resultados: BURN de la asignación de inicio de ciclo (permanentemente deflacionario) o GIVE a ExtendOliveBranch (adicional a la distribución de ese ciclo). Esta votación otorga a la comunidad control continuo sobre la política de suministro, una decisión que cobra más importancia a medida que crecen el TVL del protocolo y la acumulación anual.

La estructura completa de recompensas:

- La **asignación de 10% por acción** va directa y atómicamente a la charityWallet del pool seleccionado en cada reclamo.
- El **flujo de 1% de ExtendOliveBranch** se acumula y se redistribuye anualmente a una organización seleccionada por la gobernanza.
- El **flujo de 1% de TheOffering** se acumula y se quema o se añade a la distribución de ese año.

### 4.5 Capacidad de quema (sumidero opcional)

OBN es inflacionario mediante el staking, pero las quemas voluntarias (por ejemplo, futuras comisiones de aplicaciones) pueden compensar la emisión, de forma descentralizada e impulsada por el mercado.

---

## 5) Mecánica del protocolo y justificación

### 5.1 Distribución a organizaciones

**Modelo por acción:** En cada reclamo/depósito/retiro, el 10% de las recompensas pendientes del usuario se acuña directamente en la charityWallet de ese pool.

**Ejecución atómica:** Sin llamadas externas ni búferes globales; todas las divisiones ocurren dentro de la transacción del usuario.

**Sin disputa de asignación:** La beneficencia de cada pool es independiente; no hay función global de reasignación.

**Proof-of-Contribution:** Como la distribución benéfica está ligada a las acciones del usuario y a la selección del pool, el protocolo puede atribuir la contribución a usuarios y pools sin fines de lucro específicos.

### 5.2 Flujos anuales de gobernanza y Reserva de Semillas para Organizaciones

**Reserva de Semillas para Organizaciones:** Una asignación de 300M OBN financia semillas permanentemente en staking de 1M OBN cada una. Es independiente de las emisiones continuas de staking y de las asignaciones anuales de gobernanza. Consulta la Sección 11 para la contabilidad de la reserva.

**ExtendOliveBranch (1% de las emisiones continuas):** Se acumula continuamente. Las votaciones de la Fase 2 de AnnualGovernance seleccionan qué organización aprobada recibe la asignación fija del ciclo. Es el mecanismo anual de contribución dirigida del protocolo.

**TheOffering (1% de las emisiones continuas):** Se acumula continuamente. Las votaciones de la Fase 1 de AnnualGovernance eligen entre quemar la asignación de inicio de ciclo o donarla a ExtendOliveBranch. Es el mecanismo anual de política de suministro del protocolo.

Esta distinción triple es importante:

- La **parte de recompensa de 10% para organizaciones** es automática, por acción y específica del pool.
- La **Reserva de Semillas para Organizaciones** financia stakes de bootstrap a partir de tenencias asignadas.
- Los **flujos anuales de gobernanza de 1% + 1%** son emisiones continuas que se resuelven anualmente mediante votaciones de la comunidad.

### 5.3 Bloqueos permanentes (solo bootstrap; solo aumentan)

**Política:** El administrador solo puede aumentar lockedAmount y nunca disminuirlo; los bloqueos se reducen automáticamente si el saldo del usuario cae por debajo del bloqueo almacenado.

**Propósito:** Exclusivamente para el mecanismo de bootstrap. Los bloqueos garantizan que el capital sembrado no pueda retirarse y permiten que el beneficiario obtenga rendimiento desde el primer día. Esto preserva la integridad del TVL y protege contra la venta inmediata de tokens sembrados.

**Los stakes de los usuarios están desbloqueados por defecto;** los usuarios siempre pueden retirar su saldo desbloqueado.

### 5.4 Sin controlador de emisiones

Las fases especifican por completo la emisión; no existe una "perilla de tasa" externa. La DAO puede añadir fases futuras de forma contigua con aviso previo (timelock).

---

## 6) Organizaciones: billeteras, incorporación y presentación

### 6.1 Una billetera por pool

Cada pool corresponde a una sola charityWallet. Esto mantiene el enrutamiento determinista y los informes simples.

### 6.2 Listado con la dirección primero

Estamos indexando direcciones públicas de Ethereum que organizaciones de buena reputación ya publican e incorporándolas a nuestra plataforma.

Además, nos estamos comunicando con organizaciones por correo electrónico y teléfono para informarles sobre nuestra plataforma.

Cada página benéfica muestra por defecto un aviso claro "Sin afiliación / Sin respaldo", salvo que exista una relación directa o un reconocimiento formal.


### 6.3 Programa de bootstrap

**Objetivo:** Garantizar que cada organización recién incorporada gane desde el primer día y que los pools comiencen con un TVL creíble.

**Origen de los fondos:** La Reserva de Semillas para Organizaciones de 300M OBN financia stakes de bootstrap de 1M OBN por organización. La siembra financiada por la comunidad respalda la incorporación continua a medida que se agotan las reservas; no hay un límite estricto de pools.

**Mecanismo:**

1. La gobernanza o el ejecutor autorizado (la dirección `charityFund`, establecida en ExtendOliveBranch) llama a `charityFundBootstrap(pid, amount, beneficiary)` o usa `depositForWithLock(pid, amount, beneficiary)` cuando corresponda.
2. El OBN de bootstrap se coloca en staking y se bloquea permanentemente para el pool/beneficiario de esa organización.
3. El bloqueo impide el retiro del capital sembrado, lo que elimina el riesgo de venta inmediata mientras la posición gana rendimiento continuamente.
4. La organización se beneficia tanto del rendimiento de la parte de staker sobre su posición de bootstrap bloqueada como de la asignación benéfica de 10% del pool dirigida a la charityWallet.

**Informes:** Cada bootstrap es transparente on-chain y se incluye en divulgaciones públicas periódicas.

**Protección:** `_enforceCharitySelfStakePolicy` garantiza que cada organización solo pueda recibir una posición de bootstrap bloqueada. Los futuros stakes ordinarios deben provenir de usuarios externos, mientras que las migraciones de billeteras de organizaciones deben seguir el proceso de migración controlado por la gobernanza del protocolo.

### 6.4 Política de exclusión del listado

Si no se cumplen los estándares, retiramos a la organización de nuestro frontend y dejamos de promocionar ese pool.

Los stakes y las recompensas pendientes de los usuarios deben devolverse a ellos antes de que el pool se cierre y se elimine del protocolo.

**Cierre de un pool.** Cuando una organización sin fines de lucro se retira, su pool se cierra: se bloquean los nuevos stakes, mientras que los stakers existentes pueden seguir retirando su stake y reclamando, y los stakes que permanecen siguen ganando con el reparto habitual 88/10/1/1. Antes de eliminar el pool, se ejecuta la salida forzosa de cada staker restante: `forceExitUserToSelf` devuelve cada stake, con las recompensas pendientes, a la billetera del propio staker y no puede enviarlo a ningún otro lugar. El stake semilla bloqueado de la organización se devuelve a la Reserva de Semillas para Organizaciones. Solo entonces, cuando ya no queda nada en stake, se elimina el pool.

OBN es un protocolo de enrutamiento y staking, no una organización sin fines de lucro registrada ni un certificador. Los usuarios deben verificar las organizaciones de forma independiente y consultar a profesionales fiscales.

---

## 7) Gobernanza y capacidad de actualización

### 7.1 Proxies UUPS y autoridad

Las actualizaciones de Token, Staking, AnnualGovernance, Lens y OliveAssembly requieren la autorización del propietario Timelock. OperatorSafe programa cambios administrativos mediante el Timelock de 24 horas. AnnualGovernance y OliveAssembly además rechazan actualizaciones durante los ciclos activos.

Las votaciones de asignación anual están activas bajo el modelo de votación por raíz cuadrada con registro de NFT. La Safe voteAdmin inicia los ciclos; los llamadores sin permiso preparan las boletas y ejecutan los resultados. Esto no transfiere la autoridad de actualización del protocolo a los votantes anuales. Un control más amplio por parte de la DAO sigue siendo un paso futuro.

### 7.2 Fijado en el código y gobernado

**Restricciones fijadas en el código o a nivel de contrato (requieren actualización para cambiar cuando corresponda):**

- División en cuatro partes: 88% / 10% / 1% / 1%
- Calendario de emisión de 10 años (cambia cada 2 años): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Semántica de bloqueos del administrador (solo aumentan, reducción automática)
- Minter único en OBNToken
- Política de autostaking de organizaciones
- Garantías de atomicidad de la migración de bootstrap
- Contabilidad de contribución expuesta por las vistas del contrato

**Gobernado (no requiere actualización salvo que una implementación específica lo exija):**

- Añadir pools (`addPool(charityWallet)`)
- Ejecutar stakes de bootstrap desde la Reserva de Semillas para Organizaciones o una fuente de financiamiento comunitario autorizada
- Iniciar ciclos de AnnualGovernance mediante la Safe voteAdmin; AnnualGovernanceV2 deriva la membresía de la boleta mediante lotes sin permiso, no mediante curaduría discrecional
- Añadir fases futuras de forma contigua (`addPhase`)
- Cerrar o eliminar pools
- Informes de gasto y uso de TheOffering y ExtendOliveBranch
- Estándares para la incorporación, exclusión del listado, reemplazo y migración de organizaciones

### 7.3 Gobernanza

La gobernanza puede gestionar qué organizaciones se incluyen, pero el supuesto predeterminado debe ser que OBN siga centrado en pools sin fines de lucro.

### 7.4 AnnualGovernance

AnnualGovernance es el mecanismo on-chain para las decisiones recurrentes de la comunidad de OBN, que ofrece ciclos definidos e impuestos por contrato para TheOffering y ExtendOliveBranch.

**Estructura del ciclo:**

Cada ciclo comienza cuando voteAdmin lo abre. La Fase 1 y la Fase 2 se ejecutan de forma secuencial.

- **Fase 1 (Quemar o dar):** Los stakers registrados y elegibles votan sobre la asignación de inicio de ciclo de TheOffering. BURN reduce permanentemente el suministro. GIVE transfiere esa asignación a ExtendOliveBranch, lo que aumenta la distribución a organizaciones de ese ciclo.
- **Fase 2 (Selección de la organización):** Los stakers votan para seleccionar qué pool sin fines de lucro aprobado recibe la asignación fija del ciclo de ExtendOliveBranch. Los lotes de boleta examinan los ID de pool elegibles y validan sus billeteras benéficas contra la lista blanca mantenida en ExtendOliveBranch mediante `setApprovedNonprofit`.

**Desempate:**

- Fase 1: BURN gana por defecto: GIVE debe superar estrictamente el total de votos de BURN para ganar. Un empate (o la ausencia total de votos) se resuelve como BURN.
- Fase 2: gana la organización con más votos; los empates van a la organización empatada con el índice de boleta más bajo. Si no se emiten votos, el saldo pasa al siguiente ciclo en lugar de distribuirse.

**Integridad de la votación:**

- Se requieren un OliveNFT registrado y al menos 1 OBN de stake agregado en la instantánea del bloque anterior. El poder de voto es la raíz cuadrada del stake en la instantánea, y ambas fases usan el mismo derecho (Sección 3.6).
- AnnualGovernanceV2 no tiene un límite estricto de pools ni de boleta. Cada transacción de preparación procesa como máximo 100 ID de pool; este límite de trabajo no es un límite de membresía. La Fase 2 espera a que se complete la preparación.
- La Safe inicia el ciclo una vez; las llamadas de keeper sin permiso preparan la boleta y ejecutan las transiciones de fase. La Fase 2 recibe 30 días completos desde la liquidación real de la Fase 1.

**Ejecución:**

AnnualGovernance llama directamente a `TheOffering.burn()`, `TheOffering.sendToExtend()` o `ExtendOliveBranch.distributeFromGovernance()`. No se requiere aprobación multisig adicional una vez que concluye una votación: el resultado lo impone el contrato.

**Capacidad de actualización:**

AnnualGovernance es un proxy UUPS. El Timelock puede actualizarlo para admitir mecánicas de votación más sofisticadas (delegación, requisitos de quórum, poder ponderado por tiempo) a medida que madura la DAO.

---

## 8) Modelo de seguridad

### 8.1 Principios fundamentales

- **Checks-Effects-Interactions:** Actualizaciones de estado antes de las llamadas externas
- **Protecciones contra reentrada:** nonReentrant en todas las rutas de modificación
- **SafeERC20:** Usado en todas las transferencias de tokens
- **Matemática de precisión:** Math.mulDiv para cálculos exactos
- **Sin bucles ilimitados:** Endpoints por pool, actualizaciones acotadas

### 8.2 Refuerzo

**Operaciones atómicas:** La migración de bootstrap, la eliminación de pools y la salida forzada se completan de forma atómica.

**Conservación de recompensas:** Validación explícita de que las recompensas pendientes se conservan durante la migración (hasta una tolerancia de 1 wei).

**Prevención de desbordamiento de bloqueos:** NewLock ≤ userBalance se impone antes de establecer montos bloqueados.

**Respaldo de tesorería:** Las recompensas varadas se redirigen a treasury en lugar de perderse.

**Controles de emergencia:** La salida forzada permite a la gobernanza recuperar a los usuarios en emergencias.

### 8.3 Compensaciones de diseño

El APR igual mantiene el foco en el impacto, no en juegos de APR.

La acuñación benéfica por acción es atómica, pero requiere acuñar en cada acción (compensación de gas).

Añadir fases centraliza cierta discrecionalidad; timelock + votación de la DAO lo mitigan.

AnnualGovernance resuelve los saldos de TheOffering y ExtendOliveBranch mediante votaciones comunitarias transparentes y responsables en cada ciclo.

---

## 9) Transparencia e informes

### 9.1 Eventos

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 Vistas

**OBNStakingLens (capa canónica de lectura analítica):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Informes de Proof-of-Contribution

Los informes de Proof-of-Contribution deben convertirse en una de las capas de transparencia más importantes de OBN.

Los paneles futuros pueden mostrar:

- total de OBN aportado a organizaciones
- total de OBN aportado por pool
- contribución total de OBN atribuible a cada usuario
- historial de contribución de por vida por billetera
- contribución del usuario en varios pools sin fines de lucro
- principales pools por contribución
- stakers activos por pool
- OBN actualmente en staking por pool
- emisiones benéficas a lo largo del tiempo
- acumulación, historial de quema e historial de donación de TheOffering por ciclo
- acumulación e historial de distribución a organizaciones de ExtendOliveBranch por ciclo
- resultados de votación de AnnualGovernance por ciclo

Estos informes deben ayudar a los usuarios a entender no solo lo que ganaron, sino lo que su participación ayudó a generar.

### 9.4 Divulgaciones

OBN debe publicar informes públicos periódicos que abarquen:

- saldos de la Reserva de Semillas para Organizaciones, despliegues de semillas y la reserva separada del protocolo
- bootstraps ejecutados
- estado de los pools sin fines de lucro
- adiciones, eliminaciones o migraciones de pools
- distribuciones benéficas directas
- saldos, acumulación y uso de TheOffering y ExtendOliveBranch por ciclo
- métricas de Proof-of-Contribution

---

## 10) Recorrido del usuario

1. **Adquirir OBN** — Los usuarios adquieren OBN mediante las fuentes de liquidez disponibles.
2. **Elegir un pool por causa** — El APR es igual en todos los pools en cualquier momento, por lo que los usuarios eligen según la misión y no según diferencias de rendimiento.
3. **Hacer staking** — Los usuarios hacen staking con `deposit`, hacen staking para otra dirección con `depositFor` o usan Permit donde esté disponible.
4. **Ganar recompensas** — Los usuarios ganan la parte de las emisiones destinada a los stakers.
5. **Generar contribución** — La organización seleccionada recibe su parte definida por el protocolo cuando los usuarios interactúan con el pool.
6. **Construir Proof-of-Contribution** — La contribución del usuario se puede rastrear entre pools y a lo largo del tiempo.
7. **Retirar capital desbloqueado en cualquier momento** — Los bloqueos de bootstrap no se aplican a los stakes ordinarios de los usuarios.
8. **Votar sobre TheOffering** — Antes de que comience el ciclo, registra un OliveNFT en OliveAssembly y haz staking de al menos 1 OBN. Las billeteras elegibles votan durante la Fase 1 si la asignación fija de TheOffering se quema o se envía a ExtendOliveBranch.
9. **Votar sobre ExtendOliveBranch** — Luego, las mismas billeteras elegibles votan qué organización aprobada recibe la asignación fija del ciclo de ExtendOliveBranch.

OBN está diseñado para que los usuarios no tengan que elegir entre ganar y contribuir. Ambas cosas ocurren mediante la misma acción en el protocolo.

---

## 11) Suministro y distribución del token

**Suministro inicial:** 1,000,000,000 OBN.

**Distribución génesis histórica (en initialize; no son saldos actuales de reserva):**

- 40% Liquidez
- 30% Airdrop
- 10% asignación benéfica original
- 10% Tesorería
- 10% Equipo (a TeamVesting; cliff de ~4 meses, vesting lineal de ~20 meses)

La Reserva de Semillas para Organizaciones tiene una asignación total de **300M OBN**, con **50M OBN** mantenidos por separado para las necesidades del protocolo. Las tenencias de la tesorería y del airdrop se consolidaron en la asignación de semillas. En ese momento, 11M OBN ya habían financiado 11 semillas, lo que dejó 289M OBN para 289 semillas adicionales de 1M OBN cada una.

**Emisión continua:** Solo mediante emisiones de staking; el contrato de staking es el único minter.

**División de recompensas sobre las emisiones:**

- 88% stakers
- 10% pool sin fines de lucro seleccionado
- 1% ExtendOliveBranch (distribución anual a organizaciones)
- 1% TheOffering (votación anual de quemar o dar)

**Quema voluntaria:** Disponible mediante burn para sumideros futuros.

---

## 12) Hoja de ruta (indicativa)

### 12.1 Germinación

- Formar el concepto base del protocolo
- Construir y probar los contratos inteligentes
- Desplegar OBNToken y OBNStakingPools en Base
- Lanzar el frontend inicial
- Sembrar liquidez
- Realizar campañas tempranas de airdrop
- Integrar Farcaster y flujos de usuario nativos de Base
- Comenzar la indexación pública de billeteras de organizaciones
- Establecer la narrativa inicial de Proof-of-Contribution

### 12.2 Vegetación

- Implementar un seguimiento ampliado de contribuciones en el frontend
- Construir paneles de Proof-of-Contribution
- Mejorar las páginas de informes de organizaciones
- Operar ciclos anuales con AnnualGovernanceV2 y OliveAssembly desplegados, con registro y votación de la comunidad y liquidación sin permiso
- Producir medios educativos
- Incorporar organizaciones adicionales
- Explorar alianzas
- Contratar colaboradores esenciales cuando sea posible
- Obtener auditorías de seguridad de terceros
- Completar el trabajo legal y de gobernanza
- Construir y probar el backend/frontend de la DAO

### 12.3 Floración

- Desplegar la DAO y pasar la gobernanza a la comunidad
- Transferir la autoridad de actualización mediante gobernanza timelock
- Transferir voteAdmin de AnnualGovernance a una dirección controlada por la DAO a medida que madura la gobernanza
- Mantener la red de organizaciones
- Actualizar el frontend con funciones de la DAO
- Ampliar las herramientas de reputación de contribución e informes
- Mantener y adaptar el protocolo a medida que evolucionan las necesidades de bien público

---

## 13) Apéndice — Funciones clave

### OBNStakingPools

**Modificaciones del usuario:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (solo charityFund)
- `charityFundBootstrap(pid, amount, beneficiary)` (solo charityFund)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — Solo la billetera que llama

**Ejecución delegada:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — Solo ejecutor; requiere consentimiento y mes actuales; 1–32 ID de pool estrictamente ascendentes

**Modificaciones del administrador:**

- `claimFor(pid, user)` (solo propietario; independiente del consentimiento de autoclaim)
- `setAutoClaimExecutor(executor)` (solo propietario; cero pausa la automatización)
- `initializeV931(executor)` (solo propietario, reinitializer único durante la actualización)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (solo charityFund)
- `setVersion(newVersion)` (solo propietario)
- `upgradeTo(newImplementation, data)` (solo propietario, compatible con gobernanza)

**Vistas:**

- `pendingRewards(pid, user)` — Monto pendiente BRUTO
- `pendingRewardsMultiple(pids[], user)` — Montos pendientes de varios pools y el total
- `autoClaimExecutor()` — Cuenta inteligente de automatización autorizada
- `autoClaimPreference(user)` — Consentimiento y nonce de consentimiento
- `currentAutoClaimMonth()` — Año UTC × 12 + mes (enero = 1)
- `lastAutoClaimMonth(pid, user)` — Último mes de reclamo automático exitoso
- `unlockedBalance(pid, user)` — Disponible para retirar
- `stakeElapsed(user)` — Total de segundos en staking
- `poolLength()` — Número de pools
- `charityContributedByUserInPool(pid, user)` — Contribuciones benéficas del usuario en un pool
- `totalCharityContributedByUser(user)` — Contribuciones benéficas totales del usuario en todos los pools

Las vistas de presentación y analíticas como `getGlobalStats`, `getPoolStats`, `getUserPoolView`, `getUserStats` y `getPoolAPR` se ofrecen mediante **OBNStakingLens** como capa canónica de lectura del frontend.

### OBNToken

**Modificaciones:**

- `setMinterOnce(minter)` (solo propietario, una vez)
- `mint(to, amount)` (solo minter)
- ERC20 estándar: `transfer`, `approve`, `transferFrom`
- Compatibilidad con `permitAndCall` (EIP-2612)
- `burn(amount)` — Quema voluntaria
- `delegate(delegatee)` — Delegación de votos (ERC20Votes)

**Vistas:**

- ERC20 estándar: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**Modificaciones:**

- `release()` — Libera tokens adquiridos a teamWallet
- `updateTeamWallet(newWallet)` (solo propietario)
- `rescueERC20(token, amount)` (solo propietario, excluye el token en vesting)

**Vistas:**

- `vestedAmount(timestamp)` — Total adquirido en un momento
- `claimableNow()` — Reclamable actualmente
- `timeUntilCliff()` — Cuenta regresiva del cliff
- `timeUntilNextRelease()` — Cuenta regresiva de la próxima liberación
- `nextReleaseTimestamp()` — Hora de la próxima liberación

### TheOffering

**Modificaciones de gobernanza:**

- `burn(amount)` (solo governance) — Quema la asignación fija del ciclo tras un voto BURN
- `sendToExtend(amount)` (solo governance) — Envía la asignación fija del ciclo a ExtendOliveBranch tras un voto GIVE

**Modificaciones del administrador:**

- `setGovernance(newGovernance)` (solo timelockOwner) — Conecta o actualiza la dirección de gobernanza; `address(0)` la pausa
- `emergencySweep(token, to)` (solo timelockOwner)

### ExtendOliveBranch

**Modificaciones de distribución:**

- `distribute(nonprofit, amount)` (timelockOwner o governance) — Con aplicación de la lista blanca
- `distributeFromGovernance(nonprofit, amount)` (solo governance) — Comprobación de la lista blanca omitida intencionalmente; el destinatario ya fue validado y congelado cuando se preparó su lote de boleta

**Modificaciones del administrador:**

- `setApprovedNonprofit(nonprofit, approved)` (solo timelockOwner) — Gestiona la lista blanca de distribución
- `setGovernance(newGovernance)` (solo timelockOwner)
- `emergencySweep(token, to)` (solo timelockOwner)

**Vistas:**

- `approvedNonprofit(nonprofit)` — Estado en la lista blanca

### AnnualGovernance

**Modificaciones del administrador de votación:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (solo voteAdmin) — Requiere que ambas duraciones sean iguales a 2,592,000 segundos (30 días); toma una instantánea de elegibilidad, stake y asignaciones de fondos, congela el límite de número de pools y prepara el primer lote de boleta

**Modificaciones del usuario:**

- `castOfferingVote(cycleId, burn)` — Voto de la Fase 1
- `castNonprofitVote(cycleId, nonprofit)` — Voto de la Fase 2

**Ejecución sin permiso:**

- `prepareBallot(cycleId, maxPools)` procesa de 1 a 100 ID de pool por llamada durante la Fase 1
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — Avanza la preparación incompleta de la boleta o liquida la fase lista; cualquiera puede llamarla

**Administración del propietario (Timelock):**

- `cancelCycle(cycleId)` — Solo antes de que se ejecute la Fase 1
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)` (ajuste heredado de compatibilidad; no limita la membresía de la boleta V2)

**Vistas:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` informa el progreso y la finalización de la preparación
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` informan las asignaciones monetarias fijas
- `getCurrentVoterInfo(user)` informa la elegibilidad actual, distinta de la instantánea de un ciclo existente
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` informan la participación y la liquidación confirmada
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — Elegibilidad por NFT específica del ciclo y poder por raíz cuadrada; devuelve el poder y el estado de bootstrap de checkpoints

### OliveAssembly

- `deposit(tokenId)` registra un OliveNFT aprobado por billetera en custodia de Assembly
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` permiten el retiro controlado por el depositante, sin período de bloqueo
- `registeredTokenId(user)` / `registeredCount()` informan los registros actuales; el conteo no implica elegibilidad de staking
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` informan instantáneas históricas de registro

### OBNStakingLens

Capa analítica de solo lectura; no mantiene fondos. Recrea vistas de presentación/analíticas eliminadas de StakingPoolsV93; todas las llamadas de escritura permanecen en OBNStakingPools.

**Vistas:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — Poder de staking bruto con checkpoints, sin elegibilidad por NFT ni ponderación por raíz cuadrada; usa `getVotingPowerForCycle` de AnnualGovernanceV2 para la votación anual

**Administración:**

- `upgradeToAndCall(newImplementation, data)` (solo propietario)

---

## 14) Palabra final

Si estamos diseñando los rieles financieros para las generaciones futuras, debemos estar dispuestos a hacer una pregunta mejor:

¿Pueden esos rieles ayudar a crear un mundo mejor?

Cripto nos dio algo que antes no existía: la capacidad de programar comportamiento en el dinero. Un activo digital ya no tiene que quedarse quieto. Puede moverse por regla. Puede recompensar por regla. Puede dirigir valor por regla. Puede convertirse en algo más que aquello que la gente compra, vende y con lo que especula.

Eso debería importar.

Olive Branch Network nació de la convicción de que el dinero programable no debe ser indiferente. Si podemos diseñar tokens para recompensar la liquidez, proteger redes, financiar tesorerías e impulsar la gobernanza, también podemos diseñarlos para apoyar a organizaciones que hacen un bien verificable en el mundo.

OBN es un intento de demostrar que la contribución puede integrarse directamente en el propio activo.

Los usuarios no necesitan sacrificar su capital para participar. No necesitan hacer una donación separada. No necesitan elegir entre ganar y ayudar. Cuando los usuarios hacen staking, ganan. Cuando reclaman, las organizaciones reciben. Cuando la red crece, la capa de contribución crece con ella.

Eso es Proof-of-Contribution.

El protocolo es intencionalmente simple en su esencia: los usuarios hacen staking en pools sin fines de lucro, las recompensas se dividen por contrato y una parte de las emisiones se dirige a causas del mundo real. La división de recompensas fijada en el código mantiene honesto al sistema. ExtendOliveBranch da a la comunidad una forma recurrente de dirigir financiamiento adicional. TheOffering ofrece a los stakers una elección anual entre quemar suministro o extender más valor a las organizaciones.

OBN no se construye en torno a la extracción. Se construye en torno a la alineación.

Los usuarios son recompensados por participar. Las organizaciones reciben apoyo continuo. La gobernanza decide cómo se resuelven los flujos anuales del protocolo. Cada acción deja un registro on-chain transparente.

Este no es solo un protocolo de staking.

Es un motor de contribución.

Es una capa de bien público.

Es un intento serio de responder a una pregunta que cripto ha evitado durante demasiado tiempo:

Si podemos programar el dinero para hacer casi cualquier cosa, ¿por qué no programarlo para hacer el bien?

Cada stake se convierte en prueba.

Cada reclamo crea un registro.

Cada pool representa una causa.

Y cada año, la comunidad decide hasta dónde extender la rama de olivo.

---

## Apéndice B — Contratos desplegados (Base Mainnet)

Esta referencia describe el comportamiento de staking de V9.3.1 y la actualización AnnualGovernanceV2 activada el 7 de octubre de 2026 (bloque 52283807 de Base). La revisión de gobernanza no cambia la versión de staking. Las transacciones de despliegue, la activación del proxy y la activación del servicio se registran en el [registro operativo de lanzamiento](governance-operations/2026-09-24-staking-v931-autoclaim-record.json).

Usa el proxy de staking para depósitos, reclamos, retiros y cambios de consentimiento. `MonthlyAutoClaimUpgradeable` está compilado en la implementación V9.3.1 y no se despliega por separado.

| Contrato | Tipo | Dirección | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | Votación por raíz cuadrada con registro de NFT y preparación de boleta por lotes; actualizado el 7 de octubre de 2026. Usa el proxy anterior para interactuar. | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Red:** Base Mainnet (Chain ID: 8453)

**Notas clave:**

- OBNToken y OBNStakingPools usan el patrón de proxy UUPS para actualizaciones controladas por la gobernanza
- TeamVesting y OBNTimeLock no son actualizables por diseño
- TheOffering y ExtendOliveBranch no son actualizables por diseño
- Todas las funciones administrativas de los proxies UUPS pasan por OBNTimeLock (retraso de 24 horas) mediante el OPERATOR_SAFE 2-of-3

---

**Versión:** 9.3.1 Proof-of-Contribution / revisión de gobernanza AnnualGovernanceV2

**Fecha:** 13 de octubre de 2026

**Repositorio canónico:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

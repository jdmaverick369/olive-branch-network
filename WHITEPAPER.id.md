# Whitepaper Olive Branch Network — Proof-of-Contribution

[English](WHITEPAPER.md) · [Tiếng Việt](WHITEPAPER.vi.md) · [한국어](WHITEPAPER.ko.md) · [日本語](WHITEPAPER.ja.md) · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · [Português](WHITEPAPER.pt.md) · [Español](WHITEPAPER.es.md) · **Bahasa Indonesia**

> Terjemahan ini disediakan semata-mata untuk kemudahan. Versi bahasa Inggris ([WHITEPAPER.md](WHITEPAPER.md)) adalah versi resmi; jika terdapat perbedaan, versi bahasa Inggris yang berlaku. Terjemahan ini dibuat dengan bantuan AI dari revisi `3c740d855` dan belum ditinjau oleh penerjemah profesional. Nama kontrak, nama fungsi, dan alamat tetap dalam bahasa Inggris.

## Tujuan

Olive Branch Network adalah protokol staking Proof-of-Contribution yang dirancang untuk mengubah partisipasi on-chain sehari-hari menjadi pendanaan berkelanjutan bagi organisasi nirlaba, sekaligus tetap memberi imbalan kepada pengguna yang berpartisipasi. Pengguna melakukan staking OBN ke pool khusus setiap organisasi nirlaba, memperoleh emisi staking, dan membantu menyalurkan porsi tertentu dari emisi tersebut ke tujuan sosial di dunia nyata.

Tujuannya bukan meminta pengguna memilih antara menghasilkan dan berkontribusi. Tujuannya adalah membuat keduanya terjadi melalui tindakan protokol yang sama.

OBN memperkenalkan lapisan kontribusi tempat aktivitas staking menciptakan catatan on-chain yang transparan dan terkait dengan tujuan yang didukung pengguna. Setiap stake, klaim, distribusi ke organisasi nirlaba, suara tata kelola, pembakaran, dan alokasi tahunan menjadi bagian dari sistem publik yang dapat dilacak, diverifikasi, dan dikembangkan lebih lanjut.

Inilah fondasi Proof-of-Contribution: model tempat aset digital tidak hanya digunakan untuk spekulasi, imbal hasil, atau tata kelola, tetapi juga untuk kontribusi yang terukur.

Dokumen ini mendefinisikan arsitektur protokol, ekonomi token, model pool nirlaba, struktur tata kelola, jalur peningkatan, asumsi keamanan, dan proses menyeluruh untuk mendukung organisasi nirlaba melalui OBN.

---

## 1) Ringkasan Eksekutif

**Misi:** Menjadikan kontribusi sebagai jalan termudah dengan menyalurkan porsi tetap emisi staking ke wallet pool nirlaba yang disetujui — secara otomatis, transparan, dan dapat diverifikasi on-chain.

**Gagasan inti:** OBN dibangun di sekitar **Proof-of-Contribution**: model tempat pengguna membuktikan partisipasi bukan hanya dengan melakukan staking modal, tetapi juga dengan terus membantu menyalurkan nilai ke tujuan nirlaba di dunia nyata. Setiap stake, klaim, dan aliran imbalan nirlaba menjadi bagian dari lapisan kontribusi on-chain.

**Mekanisme:** Pengguna melakukan staking OBN ke pool khusus setiap organisasi nirlaba. Pembagian emisi ditetapkan dalam kode: 88% untuk staker, 10% langsung untuk organisasi nirlaba, 1% untuk ExtendOliveBranch (distribusi nirlaba tahunan), 1% untuk TheOffering (pemungutan suara tahunan bakar atau beri).

**Jaminan desain:**

- Pembagian empat arah yang tetap (88/10/1/1) di tingkat kontrak
- APR per token sama di semua pool pada waktu tertentu (APR pool menyamakan diri secara desain)
- Pembukuan Proof-of-Contribution melalui aliran pendanaan nirlaba on-chain dan tampilan kontribusi pengguna
- Satu charityWallet per pool; tidak ada penanda "retire/active" pada pool
- Kunci admin hanya dapat bertambah dan menyusut otomatis jika saldo turun; hanya ditujukan untuk bootstrap
- Minter tunggal: setelah setMinterOnce, hanya kontrak staking yang dapat mencetak OBN
- Fase emisi berbasis timestamp dengan jadwal menurun selama 10 tahun
- Perlindungan self-stake organisasi nirlaba, pengelolaan siklus hidup pool, migrasi bootstrap atomik, kontrol keluar paksa darurat

**Tata kelola dan kemampuan peningkatan:** Proxy UUPS milik Timelock untuk Token, Staking, AnnualGovernance, Lens, dan OliveAssembly. AnnualGovernanceV2 telah aktif sejak 7 Oktober 2026: pendaftaran NFT dan stake pada snapshot menentukan kekuatan suara akar kuadrat untuk alokasi tahunan. Kendali DAO yang lebih luas tetap menjadi langkah tata kelola di masa depan.

---

## 2) Proof-of-Contribution

### 2.1 Arti Proof-of-Contribution

Proof-of-Contribution adalah identitas inti OBN.

Dalam sistem staking tradisional, pengguna membuktikan partisipasi dengan mengunci modal dan memperoleh imbal hasil. OBN mempertahankan fondasi staking itu, tetapi menambahkan lapisan kedua: setiap tindakan pengguna juga membantu mendanai pool nirlaba. Artinya, partisipasi tidak hanya diukur dari spekulasi, kepemilikan, atau ekstraksi imbal hasil. Partisipasi juga diukur dari kontribusi.

Saat pengguna melakukan staking OBN ke pool nirlaba, mereka tidak sekadar memilih tempat memperoleh imbalan. Mereka memilih tujuan yang didukung oleh partisipasi mereka. Saat mereka mengklaim imbalan, protokol secara otomatis mencetak bagian nirlaba ke charityWallet pool yang dipilih. Hasilnya adalah catatan kontribusi on-chain yang transparan, yang dihasilkan melalui partisipasi protokol sehari-hari.

Dengan demikian, OBN mengubah staking menjadi mekanisme kontribusi.

### 2.2 Mengapa Ini Penting

Sebagian besar protokol kripto mengukur keberhasilan dari likuiditas, volume, harga, pengguna, dan TVL. OBN mempertahankan metrik ini, tetapi menambahkan ukuran penting lainnya: seberapa banyak nilai yang disalurkan jaringan ke organisasi kepentingan publik.

Ini menciptakan jenis efek jaringan yang berbeda:

- Lebih banyak pengguna menciptakan lebih banyak aktivitas staking
- Lebih banyak aktivitas staking menciptakan lebih banyak emisi
- Lebih banyak emisi menciptakan lebih banyak pendanaan nirlaba
- Lebih banyak pendanaan nirlaba menciptakan dampak yang lebih terlihat
- Dampak yang lebih terlihat memperkuat identitas dan kredibilitas protokol

Proof-of-Contribution menyelaraskan kepentingan pribadi dengan kepentingan publik. Pengguna dapat menghasilkan, organisasi nirlaba dapat menerima, dan protokol dapat membangun riwayat kontribusi yang transparan tanpa mengharuskan pengguna memberikan donasi terpisah.

### 2.3 Kontribusi sebagai Lapisan Identitas On-Chain

OBN dapat melacak kontribusi melalui tampilan protokol yang ada dan yang akan datang, termasuk:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- distribusi amal tingkat pool
- total charity yang dicetak ke setiap wallet organisasi nirlaba
- waktu staking dan riwayat partisipasi

Metrik ini memungkinkan protokol membangun dasbor kontribusi, profil dampak pengguna, halaman pelaporan organisasi nirlaba, dan alat tata kelola di masa depan. Seiring waktu, Proof-of-Contribution dapat menjadi lapisan identitas yang menunjukkan bagaimana pengguna berpartisipasi dalam jaringan dan tujuan apa yang mereka bantu dukung.

Ini tidak mengharuskan pengguna mengorbankan imbal hasil. Protokol dirancang agar menghasilkan dan berkontribusi terjadi dalam tindakan yang sama.

---

## 3) Rangkaian Kontrak

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**Standar:** ERC20, EIP-2612 Permit, ERC20Votes (kekuatan suara dengan checkpoint), Burnable.

**Fitur inti:**

- **ERC20Upgradeable:** Transfer, persetujuan, dan saldo token standar
- **ERC20PermitUpgradeable:** permit() EIP-2612 untuk persetujuan tanpa gas
- **ERC20VotesUpgradeable:** Kekuatan suara dengan checkpoint untuk tata kelola (delegasi suara, pencarian historis)
- **ERC20BurnableUpgradeable:** Pengguna dapat membakar token secara sukarela
- **UUPSUpgradeable:** Dapat ditingkatkan dengan otorisasi pemilik
- **OwnableUpgradeable:** Pemilik tunggal dengan kemampuan transfer

**Mint genesis historis (satu kali saat initialize)** dari pasokan awal 1,000,000,000 OBN. Tujuan mint awal ini tidak mewakili alokasi cadangan yang belum dibelanjakan saat ini:

- 40% Likuiditas — untuk bootstrap pool DEX
- 30% Airdrop — distribusi awal kepada komunitas
- 10% alokasi amal awal
- 10% Perbendaharaan — untuk tata kelola dan operasi protokol
- 10% Tim — ke kontrak TeamVesting dengan cliff dan jadwal vesting

Total distribusi ditetapkan dalam kode di `initialize()` dan terjadi secara atomik; tidak ada mint tambahan selama genesis.

**Model minter tunggal (aturan ketat):**

- `setMinterOnce(address minterAddr)` menetapkan tepat satu minter (kontrak staking) dan hanya dapat dipanggil sekali
- Setelah memanggil `setMinterOnce`, minter tidak dapat diubah kecuali kontrak ditingkatkan
- Hanya minter yang dapat memanggil `mint(to, amount)` untuk mendistribusikan imbalan staking
- Batasan dalam kode ini menghilangkan risiko penerbitan sewenang-wenang dan memastikan pasokan token yang dapat diprediksi

**Gerbang peningkatan:** UUPS dengan `_authorizeUpgrade` yang dibatasi untuk pemilik (akan dikendalikan DAO setelah bootstrap).

**Delegasi suara:** Pengguna dapat menggunakan `delegate(delegatee)` untuk mengarahkan kekuatan suara mereka (pola ERC20Votes).

**Mengapa struktur ini?**
Distribusi satu kali menghilangkan ambiguitas tentang pasokan awal. Satu minter menghilangkan risiko penerbitan sewenang-wenang. ERC20Votes menyelaraskan token dengan kendali DAO dan memungkinkan tata kelola di masa depan. Kemampuan bakar menyediakan penyerap sukarela untuk integrasi di masa depan. Dukungan Permit (EIP-2612) meningkatkan pengalaman pengguna dengan menghilangkan transaksi persetujuan terpisah.

### 3.2 OBNStakingPools (fase timestamp, pembukuan per pool, UUPS)

**Pembagian imbalan dalam kode (BPS):**

- STAKER_BPS = 8_800 → 88% untuk pengguna
- CHARITY_BPS = 1_000 → 10% ke wallet amal (langsung, per tindakan)
- CHARITY_FUND_BPS = 100 → 1% ke ExtendOliveBranch
- TREASURY_BPS = 100 → 1% ke TheOffering

Alamat `charityFund` mengarah ke **ExtendOliveBranch** dan alamat `treasury` mengarah ke **TheOffering**. Keduanya mengakumulasi OBN sepanjang setiap siklus tahunan. AnnualGovernance menyelesaikan kedua saldo melalui pemungutan suara komunitas pada akhir setiap siklus. Lihat Bagian 3.4–3.6 untuk detail kontrak.

**Fase emisi (diinisialisasi saat deployment):**

- Tahun 0–2: 10.00% APY
- Tahun 2–4: 7.50% APY
- Tahun 4–6: 5.00% APY
- Tahun 6–8: 2.50% APY
- Tahun 8–10: 1.25% APY

Tata kelola dapat menambahkan fase masa depan secara bersambung; fase sebelumnya tetap tidak dapat diubah.

**APR sama per pool:** Secara konstruksi, APR per token hanya bergantung pada fase aktif, bukan pada pool yang Anda pilih.

**Pembukuan Proof-of-Contribution:** Kontrak staking menyediakan tampilan kontribusi pengguna dan pool yang memungkinkan protokol menghitung berapa banyak pendanaan nirlaba yang dapat diatribusikan pada partisipasi setiap pengguna.

**Model data:** PoolInfo { address charityWallet; uint256 totalStaked; } (satu wallet per pool).

#### 3.2.1 Tindakan Inti Pengguna

**Endpoint terbatas per pool:**

- `deposit(pid, amount)` — Staking OBN di pool
- `depositFor(pid, amount, beneficiary)` — Staking atas nama alamat lain
- `depositWithPermit(...)` — Staking dengan ERC20 Permit (tanpa persetujuan terpisah)
- `withdraw(pid, amount)` — Menarik saldo yang tidak terkunci
- `claim(pid)` — Mengklaim imbalan tertunda
- `claimFor(pid, user)` — Klaim atas nama alamat lain, hanya untuk pemilik
- `claimMultiple(pids[])` — Mengklaim imbalan tertunda dari beberapa pool dalam satu transaksi
- `setAutoClaimEnabled(bool)` — Menetapkan persetujuan wallet pemanggil untuk semua pool-nya
- `autoClaimFor(pids[], user, month, consentNonce)` — Eksekutor khusus mengirim batch bulanan yang diotorisasi

Staker dapat memilih ikut on-chain dalam autoclaim bulanan bersponsor untuk semua pool saat ini dan masa depan yang dipegang wallet mereka. Akun otomatisasi mengelompokkan pool dengan imbalan pengguna yang dapat diklaim bernilai positif, hingga 32 pool per transaksi, dan membayar gas melalui paymaster yang dikonfigurasi. Kontrak mengizinkan satu klaim otomatis berhasil per pool per bulan kalender UTC. Imbalan mengikuti pembagian yang sama 88% / 10% / 1% / 1% dan masuk ke penerima yang sama dengan klaim manual. Pengguna dapat menonaktifkan persetujuan kapan saja; deposit, penarikan, dan klaim manual tetap tersedia. Autoclaim tidak mentransfer pokok, tidak menggabungkan imbalan, dan tidak mengubah kekuatan suara.

Perubahan persetujuan membatalkan permintaan yang sudah masuk antrean. Mengaktifkan kembali tidak mengatur ulang batas bulanan. Bulan kalender UTC bukan interval bergulir 30 hari; klaim manual tidak menghabiskan jatah otomatis. Sebuah pool memenuhi syarat ketika bagian pengguna setelah pembulatan bilangan bulat bernilai positif, tanpa ambang imbalan minimum di tingkat layanan. Sponsor transaksi ikut serta atau berhenti bergantung pada dukungan wallet. `claimFor` khusus pemilik tetap independen dari persetujuan autoclaim. Status deployment dan aktivasi dicatat dalam Lampiran B.

Preferensi autoclaim terkait dengan alamat staking dan dipisahkan dari sistem identitas atau kelayakan suara apa pun di masa depan. Eksekutor tidak dapat mengalihkan imbalan, menarik stake pengguna, atau mengubah persetujuan mereka.

**Mekanisme amal:**

- 10% imbalan dicetak per tindakan pengguna (klaim, deposit, penarikan) langsung ke charityWallet pool tersebut
- 1% terakumulasi terus-menerus ke ExtendOliveBranch; komunitas memilih setiap siklus organisasi nirlaba disetujui mana yang menerima alokasi tetap siklus itu
- 1% terakumulasi terus-menerus ke TheOffering; komunitas memilih setiap siklus untuk membakar alokasi yang ditetapkan pada awal siklus atau mendonasikannya ke ExtendOliveBranch
- Tidak ada buffer TVL global; pembagian terjadi per tindakan untuk eksekusi atomik

#### 3.2.2 Pengelolaan Siklus Hidup Pool

**Mekanisme penutupan:**

- `shutdownPool(pid)` — Memblokir deposit BARU; klaim dan penarikan tetap berjalan
- Memungkinkan pengguna keluar dengan tertib tanpa menghapus pool
- Data pool tetap utuh untuk staker

**Penghapusan pool:**

- `removePool(pid)` — Penghapusan lunak setelah pool benar-benar kosong (totalStaked == 0)
- Tidak ada pengindeksan ulang PID; kompatibel ke belakang
- **Keamanan perbendaharaan:** Jika charity lama terakumulasi sebelum penghapusan, charity itu dikirim ke charityWallet pool; jika wallet bernilai nol, charity itu dialihkan ke treasury
- Mencegah hilangnya imbalan jika pengguna mengklaim setelah penghapusan

#### 3.2.3 Perlindungan Self-Stake Organisasi Nirlaba

**Kebijakan:** Organisasi nirlaba dapat menerima tepat SATU deposit bootstrap yang terkunci permanen. Semua self-stake lainnya diblokir.

**Penegakan:** Fungsi `_enforceCharitySelfStakePolicy` memeriksa:

- Apakah penerima manfaat adalah wallet amal pool?
- Jika ya, apakah ini berasal dari charityFund DAN terkunci DAN saldo saat ini nol?
- Jika semuanya benar, izinkan (bootstrap pertama). Jika tidak, tolak.

**Alasan:** Mencegah self-stake yang tidak disengaja atau berbahaya oleh organisasi nirlaba, yang dapat merusak dinamika imbalan pool atau memungkinkan serangan.

#### 3.2.4 Migrasi Bootstrap Atomik

**Fungsi:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**Jaminan atomik:**

- Mempertahankan imbalan tertunda (diverifikasi hingga toleransi 1 wei)
- Menyalin jumlah terkunci dengan aman disertai pencegahan overflow
- Memperbarui wallet amal secara atomik dalam transaksi yang sama
- Menonaktifkan penghitung pool pengguna lama
- Mengaktifkan pengguna baru jika ini stake pool pertamanya

**Prasyarat:**

- oldNonprofit ADALAH wallet amal pool saat ini
- oldNonprofit ≠ newNonprofit
- oldNonprofit memiliki stake bukan nol
- newNonprofit belum memiliki stake di pool ini

**Tujuan:** Memungkinkan pemindahan posisi organisasi nirlaba dengan lancar (misalnya, alamat disusupi, rotasi wallet) tanpa kehilangan atau tersangkutnya imbalan.

#### 3.2.5 Keluar Paksa Darurat

**Fungsi:** `forceExitUserToSelf(pid, user, claimRewards)` (hanya pemilik, nonReentrant)

**Perilaku:**

- Memaksa pengguna keluar dari pool, mengabaikan kunci
- Mengembalikan pokok kepada pengguna segera
- Secara opsional mencetak imbalan tertunda untuk pengguna
- Menghapus kunci, utang imbalan, dan penghitung staker aktif

**Kasus penggunaan:** Kontrol tata kelola darurat untuk penghapusan pool saat pengguna perlu memulihkan dana; digunakan setelah pool ditutup.

#### 3.2.6 Pembaruan Wallet Amal

**Fungsi:** `updateCharityWallet(pid, newWallet)` (hanya pemilik)

**Memungkinkan:** Memperbarui alamat amal pool (misalnya, jika disusupi atau dirotasi ke alamat baru).

**Dilacak melalui:** peristiwa CharityWalletUpdated.

#### 3.2.7 Pengelolaan Kunci

**Fungsi:** `setLockedAmount(pid, user, amount)` (hanya charityFund)

**Aturan:**

- Hanya dapat DITAMBAH atau tetap; tidak pernah dikurangi
- Tidak dapat melebihi saldo pengguna
- Kunci menyusut otomatis jika saldo turun di bawah jumlah kunci
- Hanya ditujukan untuk deposit bootstrap

**Keteramatan:**

Pembacaan analitik disediakan melalui **OBNStakingLens** (Bagian 3.7) — lapisan baca kanonis untuk frontend dan dasbor. Pembacaan kunci dan saldo tetap langsung pada kontrak staking:

- `pendingRewards(pid, user)` — Mengembalikan jumlah tertunda BRUTO
- `pendingRewardsMultiple(pids[], user)` — Mengembalikan jumlah tertunda untuk beberapa pool beserta total
- `unlockedBalance(pid, user)` — Mengembalikan saldo dikurangi kunci
- `stakeElapsed(user)` — Total detik staking (bertahan setelah unstake)
- `charityContributedByUserInPool(pid, user)` — Total charity tercetak yang dapat diatribusikan pada pengguna di suatu pool
- `totalCharityContributedByUser(user)` — Total charity tercetak yang dapat diatribusikan pada pengguna di semua pool

Lihat Bagian 3.7 untuk seluruh tampilan OBNStakingLens (getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor).

### 3.3 TeamVesting (linear, dengan cliff; tidak dapat ditingkatkan)

**Cliff:** ~4 bulan; **Durasi:** ~20 bulan linear setelahnya.

**`release()`:** Mengalirkan token yang telah vesting ke teamWallet.

**Pembantu:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**Keamanan:** Token vesting tidak dapat diselamatkan; hanya ERC20 yang salah kirim.

### 3.4 TheOffering (tidak dapat ditingkatkan)

TheOffering adalah brankas bakar-atau-beri tahunan protokol. Kontrak staking mengarahkan slot emisi treasury 1% ke alamat ini. OBN terakumulasi terus-menerus sepanjang setiap siklus tahunan.

Pada akhir setiap siklus, AnnualGovernance mengeksekusi hasil pemungutan suara Fase 1 komunitas:

- **BURN:** Alokasi yang dicatat pada awal siklus dibakar secara permanen, mengurangi total pasokan OBN.
- **GIVE:** Alokasi yang dicatat pada awal siklus ditransfer ke ExtendOliveBranch, menambah distribusi nirlaba siklus itu.

**Kontrol akses:** `timelockOwner` (Timelock) mengendalikan fungsi admin termasuk `emergencySweep`. `governance` (AnnualGovernance) adalah satu-satunya alamat yang berwenang memanggil `burn()` atau `sendToExtend()`. Alamat `governance` diinisialisasi ke `address(0)` dan dihubungkan ke AnnualGovernance melalui `setGovernance()` lewat Timelock.

**Tidak dapat ditingkatkan:** TheOffering di-deploy sebagai kontrak standar tanpa proxy. Argumen konstruktor (alamat token `obn`, `timelockOwner`) tidak dapat diubah. Jika diperlukan penggantian, Timelock harus men-deploy kontrak baru dan memanggil `setTreasury(newAddress)` pada proxy staking untuk mengarahkan ulang emisi.

### 3.5 ExtendOliveBranch (tidak dapat ditingkatkan)

ExtendOliveBranch adalah brankas distribusi nirlaba tahunan protokol. Kontrak staking mengarahkan slot emisi charityFund 1% ke alamat ini. OBN terakumulasi terus-menerus dan juga dapat menerima donasi dari TheOffering ketika komunitas memilih GIVE pada Fase 1.

Pada akhir setiap siklus, AnnualGovernance mengeksekusi pemungutan suara Fase 2 komunitas: charityWallet pool nirlaba pemenang menerima alokasi siklus tetap ExtendOliveBranch dalam satu transaksi.

**Registri organisasi nirlaba yang disetujui:** ExtendOliveBranch memelihara daftar putih alamat penerima yang disetujui. `setApprovedNonprofit(address, bool)` dapat dipanggil oleh Timelock. Semua wallet amal pool disimpan dalam daftar putih; pool baru disetujui secara atomik bersama `addPool` melalui `schedule_addPool.js`.

**Distribusi:** `distributeFromGovernance(to, amount)` hanya dapat dipanggil oleh alamat `governance`. Brankas tidak mengulangi pemeriksaan daftar putih pada jalur ini: AnnualGovernanceV2 memvalidasi setiap penerima ketika batch surat suaranya disiapkan dan hanya membayar anggota surat suara yang terpilih.

**Tidak dapat ditingkatkan:** Jaminan kekekalan yang sama seperti TheOffering. Argumen konstruktor (`obn`, `timelockOwner`) tidak dapat diubah.

### 3.6 AnnualGovernanceV2 (implementasi aktif; proxy UUPS yang ada)

AnnualGovernance mengoordinasikan siklus keputusan tahunan untuk TheOffering dan ExtendOliveBranch. Proxy UUPS miliknya yang ada dan dimiliki Timelock ditingkatkan ke AnnualGovernanceV2 pada **7 Oktober 2026, pada blok Base 52283807**, sebagaimana dicatat dalam [dokumentasi deployment repositori](README.md#annual-governance). OliveAssembly menyediakan pendaftaran NFT dengan checkpoint untuk aturan pemungutan suara baru. Deployment itu sendiri tidak memulai siklus tahunan.

**Struktur siklus:** Setiap siklus tahunan menjalankan dua fase berurutan:

1. **Fase 1 — Bakar atau Beri:** Staker terdaftar yang memenuhi syarat memberikan suara atas alokasi TheOffering yang dicatat saat siklus dimulai. Hasil pemenang dieksekusi secara atomik: BURN memanggil `TheOffering.burn()`; GIVE memanggil `TheOffering.sendToExtend()`.

2. **Fase 2 — Pemilihan Organisasi Nirlaba:** Staker terdaftar yang memenuhi syarat memilih organisasi nirlaba disetujui mana yang menerima alokasi awal siklus ExtendOliveBranch ditambah transfer GIVE siklus itu, jika ada. Penerimaan berikutnya disimpan untuk siklus berikutnya. Tidak ada batas keras surat suara: batch tanpa izin memproses paling banyak 100 ID pool per panggilan dalam urutan menaik, mengecualikan pool yang sepenuhnya dihapus dan menghilangkan duplikat wallet amal. Pool yang ditutup tetap memenuhi syarat hingga sepenuhnya dihapus. charityWallet pemenang menerima alokasi tetap melalui `ExtendOliveBranch.distributeFromGovernance()`.

**Penyelesaian seri:**

- Fase 1: GIVE hanya menang jika total suaranya benar-benar melebihi BURN. Seri persis — atau tanpa partisipasi — diselesaikan menjadi BURN.
- Fase 2: organisasi nirlaba dengan total suara tertinggi menang; jika seri, yang paling awal muncul pada surat suara menang. Jika tidak ada suara sama sekali, saldo dipindahkan ke siklus berikutnya alih-alih didistribusikan.

**Integritas suara:**

- Kelayakan memerlukan satu OliveNFT yang terdaftar di OliveAssembly dan setidaknya 1 OBN saldo agregat yang di-stake pada `block.number - 1` sebelum siklus dimulai. Kedua fase berbagi snapshot itu; pendaftaran atau staking kemudian tidak dapat menambah kekuatan pada siklus, dan penarikan kemudian tidak menghapus haknya.
- Kekuatan suara adalah akar kuadrat dari stake snapshot: 100 OBN yang di-stake memberi 10 unit kekuatan suara. Kontrak menghitung `floor(sqrt(stakeInWei)) * 1e9`, dinyatakan dalam unit 18 desimal. NFT tambahan dalam wallet tidak menambah kekuatan; siklus historis sebelum V2 mempertahankan bobot linear aslinya.
- Safe voteAdmin memulai Fase 1 secara langsung, tanpa penundaan Timelock, dan menyiapkan batch surat suara pertama. Siapa pun dapat melanjutkan persiapan dan menyelesaikan setiap fase. Fase 1 berlangsung tepat 30 hari dan tidak dapat diselesaikan sampai persiapan surat suara rampung; Fase 2 mendapat 30 hari penuh sejak penyelesaian aktual Fase 1.

**Eksekusi:** AnnualGovernance memanggil TheOffering dan ExtendOliveBranch secara langsung. Tidak diperlukan persetujuan multisig tambahan setelah pemungutan suara selesai — hasilnya ditegakkan oleh kontrak.

**Kemampuan peningkatan:** AnnualGovernance adalah proxy UUPS. Mekanisme pemungutan suara yang lebih canggih (delegasi, persyaratan kuorum, pemungutan suara berbobot waktu) dapat ditambahkan melalui peningkatan yang diatur Timelock seiring matangnya DAO.

**Waktu persiapan:** Kelayakan dan stake pemilih menggunakan snapshot blok sebelumnya; saldo dana dan panjang riwayat pool dicatat dalam transaksi awal Safe. Status wallet/penghapusan setiap pool dan persetujuan setiap penerima baru dibaca saat batch-nya dieksekusi. ID pool kemudian dikecualikan dan penerima yang sudah diterima tetap, meskipun persetujuannya kemudian dicabut. Penerima yang tidak disetujui membatalkan batch itu; Timelock harus memperbaiki konfigurasi atau membatalkan siklus sebelum penyelesaian Fase 1. Hindari perubahan konfigurasi organisasi nirlaba selama persiapan.

**Parameter aktif dan pengaman:** `owner` = Timelock; `voteAdmin` = OperatorSafe. Penyimpanan lama `maxBallotSize` dipertahankan untuk kompatibilitas tetapi tidak membatasi keanggotaan. Peningkatan Governance dan OliveAssembly diblokir sepanjang siklus aktif, termasuk persiapan. Pembatalan hanya tersedia sebelum Fase 1 dieksekusi. Alokasi adalah cadangan akuntansi di brankas yang ada, bukan kustodi terpisah; kekurangan harus diisi ulang sebelum penyelesaian dapat berhasil.

**Pendaftaran OliveAssembly:** Setujui proxy Assembly untuk mentransfer OliveNFT, lalu panggil `deposit(tokenId)` untuk mendaftarkannya. Assembly menyimpan satu NFT per wallet; pendaftaran bertahan lintas siklus hingga penarikan. Penyetor dapat menggunakan `withdraw()`, `withdrawTo(recipient)`, atau `withdrawExpected(tokenId, recipient)` tanpa periode kunci. NFT terdaftar tidak dapat ditarik oleh administrator. Pendaftaran NFT tidak menetapkan identitas manusia yang unik.

### 3.7 OBNStakingLens (proxy UUPS)

OBNStakingLens adalah kontrak analitik khusus yang hanya-baca. Ini adalah lapisan baca kanonis untuk frontend, dasbor, dan alat analitik off-chain. Menggabungkan pembacaan analitik ke proxy terpisah yang dapat ditingkatkan menjaga permukaan eksternal kontrak staking tetap minimal dan stabil, sementara kemampuan analitik dapat berkembang secara independen.

**Tampilan utama:**

- `getGlobalStats()` — Jumlah pool, total TVL, staker unik, imbalan per detik saat ini
- `getPoolStats(pid)` — Statistik per pool: wallet amal, jumlah yang di-stake, jumlah staker, status akumulator
- `getUserPoolView(pid, user)` — Data staking khusus pengguna: saldo, kunci, imbalan tertunda, status aktif
- `getPoolAPR(pid)` — APR saat ini untuk bagian staker di pool
- `pendingCharityFor(pid, user)` — Perkiraan kontribusi nirlaba tertunda yang dapat diatribusikan pada pengguna

**Kontrol akses:** `owner` (Timelock) mengendalikan peningkatan. Lens membaca dari proxy staking sebagai pemanggil hanya-tampilan dan tidak memiliki status yang dapat berubah sendiri.

**Inisialisasi:** `initialize(stakingPools, timelock)` — menetapkan alamat proxy staking dan pemilik Timelock.

---

## 4) Ekonomi Token dan Keberlanjutan Jangka Panjang

### 4.1 Matematika emisi (intuisi)

Misalkan basis APR fase adalah B (dalam BPS), TVL global G, dan TVL pool P.

**Bruto tahunan untuk pool:** YearlyPoolGross = P × (B / 10,000)

**Staker menerima 88% darinya;** sisanya mengalir ke charityWallet organisasi nirlaba (10%), ExtendOliveBranch (1%), TheOffering (1%).

**APR per token disederhanakan menjadi** 0.88 × (B / 10,000), **sama di semua pool** — tidak bergantung pada ukuran pasokan.

### 4.2 Emisi yang menurun mendukung keberlanjutan

**Penurunan tekanan jual:** Penerbitan yang lebih rendah seiring waktu mengurangi tekanan jual struktural.

**Permintaan yang didorong tujuan:** Protokol menciptakan keselarasan berkelanjutan antara pengguna, organisasi nirlaba, dan kredibilitas jangka panjang jaringan.

**Kredibilitas TVL:** Kunci bootstrap menciptakan TVL yang bertahan, meningkatkan kepercayaan dan penemuan harga.

**Keterprediksian:** Dengan pembagian dan fase on-chain, peserta dapat merencanakan jangka panjang.

**Riwayat kontribusi:** Proof-of-Contribution menambahkan bentuk nilai protokol lain: bukti transparan pendanaan kepentingan publik yang dihasilkan melalui partisipasi pengguna.

### 4.3 Minimalisme pembagian emisi (1% + 1%)

Pengguna mendapat 88%, pendanaan nirlaba langsung sebesar 10%, dan 2% sisanya terakumulasi di ExtendOliveBranch dan TheOffering — masing-masing diselesaikan setiap tahun melalui pemungutan suara tata kelola komunitas.

Menjaga aliran yang diakumulasikan tata kelola masing-masing di 1% memastikan protokol tetap ramping dan berpusat pada pengguna dan amal. Tidak ada aliran yang dapat dialihkan diam-diam; keduanya diatur secara transparan on-chain melalui AnnualGovernance.

### 4.4 Aliran tata kelola tahunan (1% + 1%)

Kedua aliran emisi 1% diatur oleh AnnualGovernance, masing-masing dengan tujuan yang jelas. V2 mencatat kedua saldo pada awal siklus; Fase 2 hanya menambahkan transfer GIVE siklus itu. Penerimaan berikutnya disimpan untuk siklus berikutnya.

**ExtendOliveBranch (1% emisi):** Mengakumulasi OBN terus-menerus sepanjang setiap siklus tahunan. Pada akhir setiap siklus, staker memilih pada Fase 2 AnnualGovernance untuk menentukan pool nirlaba disetujui mana yang menerima alokasi siklus tetap. Ini memberi komunitas mekanisme transparan dan berulang untuk mengarahkan sumber daya tingkat protokol ke tujuan tertentu.

**TheOffering (1% emisi):** Mengakumulasi OBN terus-menerus. Pada akhir setiap siklus, staker memilih pada Fase 1 AnnualGovernance antara dua hasil: BURN alokasi awal siklus (deflasi permanen) atau GIVE ke ExtendOliveBranch (menambah distribusi nirlaba siklus itu). Pemungutan suara ini memberi komunitas kendali berkelanjutan atas kebijakan pasokan — keputusan yang makin penting seiring tumbuhnya TVL protokol dan akumulasi tahunan.

Struktur imbalan lengkap:

- **Alokasi 10% per tindakan** mengalir langsung dan atomik ke charityWallet pool yang dipilih pada setiap klaim.
- **Aliran 1% ExtendOliveBranch** terakumulasi dan didistribusikan kembali setiap tahun kepada organisasi nirlaba pilihan tata kelola.
- **Aliran 1% TheOffering** terakumulasi dan dibakar atau ditambahkan ke distribusi nirlaba tahun itu.

### 4.5 Kemampuan bakar (penyerap opsional)

OBN bersifat inflasioner melalui staking, tetapi pembakaran sukarela (misalnya, biaya aplikasi di masa depan) dapat mengimbangi penerbitan — terdesentralisasi dan digerakkan pasar.

---

## 5) Mekanisme Protokol dan Alasannya

### 5.1 Distribusi nirlaba

**Model per tindakan:** Pada setiap klaim/deposit/penarikan, 10% imbalan tertunda pengguna dicetak langsung ke charityWallet pool tersebut.

**Eksekusi atomik:** Tidak ada panggilan eksternal atau buffer global; semua pembagian terjadi di dalam transaksi pengguna.

**Tidak ada perebutan alokasi:** Amal setiap pool bersifat independen; tidak ada fungsi realokasi global.

**Proof-of-Contribution:** Karena distribusi amal terkait dengan tindakan pengguna dan pemilihan pool, protokol dapat mengatribusikan kontribusi pada pengguna dan pool nirlaba tertentu.

### 5.2 Aliran tata kelola tahunan vs. Cadangan Benih Nirlaba

**Cadangan Benih Nirlaba:** Alokasi 300M OBN mendanai benih nirlaba yang di-stake permanen sebesar masing-masing 1M OBN. Alokasi ini terpisah dari emisi staking berjalan dan alokasi tata kelola tahunan. Lihat Bagian 11 untuk pembukuan cadangan.

**ExtendOliveBranch (1% emisi berjalan):** Terakumulasi terus-menerus. Pemungutan suara Fase 2 AnnualGovernance memilih organisasi nirlaba disetujui mana yang menerima alokasi siklus tetap. Ini adalah mekanisme kontribusi terarah tahunan protokol.

**TheOffering (1% emisi berjalan):** Terakumulasi terus-menerus. Pemungutan suara Fase 1 AnnualGovernance memilih antara membakar alokasi awal siklus atau mendonasikannya ke ExtendOliveBranch. Ini adalah mekanisme kebijakan pasokan tahunan protokol.

Pembedaan tiga arah ini penting:

- **Bagian imbalan nirlaba 10%** bersifat otomatis, per tindakan, dan khusus pool.
- **Cadangan Benih Nirlaba** mendanai stake bootstrap dari kepemilikan yang dialokasikan.
- **Aliran tata kelola tahunan 1% + 1%** adalah emisi berjalan yang diselesaikan setiap tahun melalui pemungutan suara komunitas.

### 5.3 Kunci permanen (hanya bootstrap; hanya bertambah)

**Kebijakan:** Admin hanya dapat menambah lockedAmount dan tidak pernah menguranginya; kunci menyusut otomatis jika saldo pengguna turun di bawah kunci tersimpan.

**Tujuan:** Murni untuk mekanisme bootstrap. Kunci memastikan pokok benih tidak dapat ditarik sambil membiarkan penerima manfaat memperoleh imbal hasil sejak hari pertama. Ini menjaga integritas TVL dan melindungi dari penjualan langsung token benih.

**Stake pengguna tidak terkunci secara default;** pengguna selalu dapat menarik saldo yang tidak terkunci.

### 5.4 Tidak ada pengendali emisi

Fase sepenuhnya menentukan penerbitan; tidak ada "kenop laju" eksternal. DAO dapat menambahkan fase masa depan secara bersambung dengan pemberitahuan (timelock).

---

## 6) Organisasi Nirlaba: Wallet, Orientasi, dan Tampilan

### 6.1 Satu wallet per pool

Setiap pool dipetakan ke satu charityWallet. Ini menjaga perutean tetap deterministik dan pelaporan sederhana.

### 6.2 Pencantuman berdasarkan alamat

Kami mengindeks alamat Ethereum publik yang sudah diterbitkan organisasi tepercaya dan memasukkannya ke platform kami.

Selain itu, kami menghubungi organisasi melalui email dan telepon untuk memberi tahu mereka tentang platform kami.

Setiap halaman amal secara default menampilkan spanduk jelas "Tanpa Afiliasi / Tidak Didukung" kecuali ada hubungan langsung atau pengakuan resmi.


### 6.3 Program Bootstrap

**Sasaran:** Memastikan setiap organisasi amal yang baru bergabung memperoleh hasil sejak hari pertama dan pool dimulai dengan TVL yang kredibel.

**Sumber dana:** Cadangan Benih Nirlaba 300M OBN mendanai stake bootstrap 1M OBN per organisasi nirlaba. Penyemaian yang didanai komunitas mendukung orientasi lanjutan seiring habisnya cadangan; tidak ada batas keras jumlah pool.

**Mekanisme:**

1. Tata kelola atau eksekutor berwenang (alamat `charityFund`, ditetapkan ke ExtendOliveBranch) memanggil `charityFundBootstrap(pid, amount, beneficiary)` atau menggunakan `depositForWithLock(pid, amount, beneficiary)` jika berlaku.
2. OBN bootstrap di-stake dan dikunci secara permanen untuk pool/penerima manfaat organisasi nirlaba tersebut.
3. Kunci mencegah penarikan pokok benih, menghilangkan risiko penjualan langsung sementara posisi terus memperoleh imbal hasil.
4. Organisasi nirlaba memperoleh manfaat dari imbal hasil bagian staker pada posisi bootstrap terkuncinya dan dari alokasi amal 10% pool yang disalurkan ke charityWallet.

**Pelaporan:** Setiap bootstrap transparan on-chain dan disertakan dalam pengungkapan publik berkala.

**Perlindungan:** `_enforceCharitySelfStakePolicy` memastikan setiap organisasi nirlaba hanya dapat menerima satu posisi bootstrap terkunci. Stake biasa di masa depan harus berasal dari pengguna eksternal, sementara migrasi wallet organisasi nirlaba harus mengikuti proses migrasi protokol yang dikendalikan tata kelola.

### 6.4 Kebijakan penghapusan daftar

Jika standar tidak terpenuhi, kami menghapus organisasi nirlaba dari frontend kami dan berhenti mempromosikan pool tersebut.

Stake dan imbalan tertunda pengguna harus dikembalikan kepada pengguna sebelum pool ditutup dan dihapus dari protokol.

OBN adalah protokol perutean dan staking, bukan organisasi nirlaba terdaftar atau lembaga sertifikasi. Pengguna harus memverifikasi organisasi secara independen dan berkonsultasi dengan profesional pajak.

---

## 7) Tata Kelola dan Kemampuan Peningkatan

### 7.1 Proxy UUPS dan kewenangan

Peningkatan Token, Staking, AnnualGovernance, Lens, dan OliveAssembly memerlukan otorisasi pemilik Timelock. OperatorSafe menjadwalkan perubahan administratif melalui Timelock 24 jam. AnnualGovernance dan OliveAssembly juga menolak peningkatan selama siklus aktif.

Pemungutan suara alokasi tahunan aktif di bawah model pemungutan suara akar kuadrat dengan pendaftaran NFT. Safe voteAdmin memulai siklus; pemanggil tanpa izin menyiapkan surat suara dan mengeksekusi hasil. Ini tidak mengalihkan kewenangan peningkatan protokol kepada pemilih tahunan. Kendali DAO yang lebih luas tetap menjadi langkah masa depan.

### 7.2 Ditetapkan dalam kode vs. diatur

**Batasan dalam kode atau tingkat kontrak (memerlukan peningkatan untuk mengubah jika berlaku):**

- Pembagian empat arah: 88% / 10% / 1% / 1%
- Jadwal emisi 10 tahun (berubah setiap 2 tahun): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Semantik kunci admin (hanya bertambah, menyusut otomatis)
- Minter tunggal di OBNToken
- Kebijakan self-stake organisasi nirlaba
- Jaminan atomisitas migrasi bootstrap
- Pembukuan kontribusi yang disediakan oleh tampilan kontrak

**Diatur (tidak perlu peningkatan kecuali implementasi tertentu memerlukannya):**

- Menambah pool (`addPool(charityWallet)`)
- Mengeksekusi stake bootstrap dari Cadangan Benih Nirlaba atau sumber pendanaan komunitas yang berwenang
- Memulai siklus AnnualGovernance melalui Safe voteAdmin; AnnualGovernanceV2 menurunkan keanggotaan surat suara melalui batch tanpa izin, bukan kurasi diskresioner
- Menambahkan fase masa depan secara bersambung (`addPhase`)
- Menutup atau menghapus pool
- Pelaporan pengeluaran dan penggunaan TheOffering dan ExtendOliveBranch
- Standar untuk orientasi, penghapusan daftar, penggantian, dan migrasi organisasi nirlaba

### 7.3 Tata kelola

Tata kelola dapat mengelola organisasi nirlaba mana yang disertakan, tetapi asumsi dasarnya adalah OBN tetap berpusat pada pool nirlaba.

### 7.4 AnnualGovernance

AnnualGovernance adalah mekanisme on-chain untuk keputusan komunitas berulang OBN, yang menyediakan siklus terdefinisi dan ditegakkan kontrak untuk TheOffering dan ExtendOliveBranch.

**Struktur siklus:**

Setiap siklus dimulai ketika voteAdmin membukanya. Fase 1 dan Fase 2 berjalan berurutan.

- **Fase 1 (Bakar atau Beri):** Staker terdaftar yang memenuhi syarat memberikan suara atas alokasi awal siklus TheOffering. BURN mengurangi pasokan secara permanen. GIVE mentransfer alokasi itu ke ExtendOliveBranch, menambah distribusi nirlaba siklus itu.
- **Fase 2 (Pemilihan organisasi nirlaba):** Staker memilih pool nirlaba disetujui mana yang menerima alokasi siklus tetap ExtendOliveBranch. Batch surat suara memindai ID pool yang memenuhi syarat dan memvalidasi wallet amalnya terhadap daftar putih yang dipelihara di ExtendOliveBranch melalui `setApprovedNonprofit`.

**Penyelesaian seri:**

- Fase 1: BURN menang secara default — GIVE harus benar-benar melebihi total suara BURN untuk menang. Seri (atau tanpa suara sama sekali) diselesaikan menjadi BURN.
- Fase 2: organisasi nirlaba dengan suara terbanyak menang; jika seri, yang memiliki indeks surat suara terendah menang. Jika tidak ada suara, saldo dipindahkan ke siklus berikutnya alih-alih didistribusikan.

**Integritas suara:**

- Diperlukan satu OliveNFT terdaftar dan setidaknya 1 OBN stake agregat pada snapshot blok sebelumnya. Kekuatan suara adalah akar kuadrat dari stake snapshot, dan kedua fase menggunakan hak yang sama (Bagian 3.6).
- AnnualGovernanceV2 tidak memiliki batas keras pool atau surat suara. Setiap transaksi persiapan memproses paling banyak 100 ID pool; batas kerja ini bukan batas keanggotaan. Fase 2 menunggu persiapan selesai.
- Safe memulai siklus sekali; panggilan keeper tanpa izin menyiapkan surat suara dan mengeksekusi transisi fase. Fase 2 mendapat 30 hari penuh sejak penyelesaian aktual Fase 1.

**Eksekusi:**

AnnualGovernance memanggil `TheOffering.burn()`, `TheOffering.sendToExtend()`, atau `ExtendOliveBranch.distributeFromGovernance()` secara langsung. Tidak diperlukan persetujuan multisig tambahan setelah pemungutan suara selesai — hasilnya ditegakkan oleh kontrak.

**Kemampuan peningkatan:**

AnnualGovernance adalah proxy UUPS. Timelock dapat meningkatkannya untuk mendukung mekanisme pemungutan suara yang lebih canggih (delegasi, persyaratan kuorum, kekuatan berbobot waktu) seiring matangnya DAO.

---

## 8) Model Keamanan

### 8.1 Prinsip inti

- **Checks-Effects-Interactions:** Pembaruan status sebelum panggilan eksternal
- **Pengaman reentrancy:** nonReentrant pada semua jalur yang mengubah status
- **SafeERC20:** Digunakan untuk semua transfer token
- **Matematika presisi:** Math.mulDiv untuk perhitungan akurat
- **Tanpa loop tak terbatas:** Endpoint per pool, pembaruan terbatas

### 8.2 Penguatan

**Operasi atomik:** Migrasi bootstrap, penghapusan pool, dan keluar paksa semuanya selesai secara atomik.

**Pelestarian imbalan:** Validasi eksplisit bahwa imbalan tertunda dipertahankan selama migrasi (hingga toleransi 1 wei).

**Pencegahan overflow kunci:** NewLock ≤ userBalance ditegakkan sebelum menetapkan jumlah terkunci.

**Cadangan perbendaharaan:** Imbalan yang tersangkut dialihkan ke treasury alih-alih hilang.

**Kontrol darurat:** Keluar paksa memungkinkan tata kelola memulihkan pengguna dalam keadaan darurat.

### 8.3 Pertukaran desain

APR yang sama menjaga fokus pada dampak, bukan permainan APR.

Pencetakan amal per tindakan bersifat atomik tetapi mengharuskan setiap tindakan mencetak (pertukaran gas).

Menambahkan fase memusatkan sebagian diskresi; timelock + pemungutan suara DAO memitigasinya.

AnnualGovernance menyelesaikan saldo TheOffering dan ExtendOliveBranch melalui pemungutan suara komunitas yang transparan dan akuntabel setiap siklus.

---

## 9) Transparansi dan Pelaporan

### 9.1 Peristiwa

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 Tampilan

**OBNStakingLens (lapisan baca analitik kanonis):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Pelaporan Proof-of-Contribution

Pelaporan Proof-of-Contribution harus menjadi salah satu lapisan transparansi terpenting OBN.

Dasbor masa depan dapat menampilkan:

- total OBN yang dikontribusikan kepada organisasi nirlaba
- total OBN yang dikontribusikan per pool
- total kontribusi OBN yang dapat diatribusikan pada setiap pengguna
- riwayat kontribusi seumur hidup per wallet
- kontribusi pengguna di beberapa pool nirlaba
- pool teratas berdasarkan kontribusi
- staker aktif per pool
- OBN yang saat ini di-stake per pool
- emisi amal dari waktu ke waktu
- akumulasi, riwayat pembakaran, dan riwayat pemberian TheOffering per siklus
- akumulasi dan riwayat distribusi nirlaba ExtendOliveBranch per siklus
- hasil pemungutan suara AnnualGovernance per siklus

Laporan ini harus membantu pengguna memahami bukan hanya apa yang mereka peroleh, tetapi juga apa yang dibantu oleh partisipasi mereka untuk dihasilkan.

### 9.4 Pengungkapan

OBN harus menerbitkan laporan publik berkala yang mencakup:

- saldo Cadangan Benih Nirlaba, penempatan benih, dan cadangan protokol terpisah
- bootstrap yang dieksekusi
- status pool nirlaba
- penambahan, penghapusan, atau migrasi pool
- distribusi amal langsung
- saldo, akumulasi, dan penggunaan TheOffering dan ExtendOliveBranch per siklus
- metrik Proof-of-Contribution

---

## 10) Perjalanan Pengguna

1. **Memperoleh OBN** — Pengguna memperoleh OBN melalui sumber likuiditas yang tersedia.
2. **Memilih pool nirlaba berdasarkan tujuan** — APR sama di semua pool pada waktu tertentu, sehingga pengguna memilih berdasarkan misi, bukan perbedaan imbal hasil.
3. **Staking** — Pengguna melakukan staking dengan `deposit`, staking untuk alamat lain dengan `depositFor`, atau menggunakan Permit jika didukung.
4. **Memperoleh imbalan** — Pengguna memperoleh bagian staker dari emisi.
5. **Menghasilkan kontribusi** — Organisasi nirlaba yang dipilih menerima bagian yang ditentukan protokol ketika pengguna berinteraksi dengan pool.
6. **Membangun Proof-of-Contribution** — Kontribusi pengguna dapat dilacak di seluruh pool dan dari waktu ke waktu.
7. **Menarik pokok yang tidak terkunci kapan saja** — Kunci bootstrap tidak berlaku untuk stake pengguna biasa.
8. **Memilih soal TheOffering** — Sebelum siklus dimulai, daftarkan satu OliveNFT di OliveAssembly dan stake setidaknya 1 OBN. Wallet yang memenuhi syarat memilih pada Fase 1 apakah alokasi tetap TheOffering dibakar atau dikirim ke ExtendOliveBranch.
9. **Memilih soal ExtendOliveBranch** — Wallet yang sama kemudian memilih organisasi nirlaba disetujui mana yang menerima alokasi siklus tetap ExtendOliveBranch.

OBN dirancang agar pengguna tidak perlu memilih antara menghasilkan dan berkontribusi. Keduanya terjadi melalui tindakan protokol yang sama.

---

## 11) Pasokan dan Distribusi Token

**Pasokan awal:** 1,000,000,000 OBN.

**Distribusi genesis historis (saat initialize; bukan saldo cadangan saat ini):**

- 40% Likuiditas
- 30% Airdrop
- 10% alokasi amal awal
- 10% Perbendaharaan
- 10% Tim (ke TeamVesting; cliff ~4 bulan, vesting linear ~20 bulan)

Cadangan Benih Nirlaba memiliki total alokasi **300M OBN**, dengan **50M OBN** disimpan terpisah untuk kebutuhan protokol. Kepemilikan perbendaharaan dan airdrop digabungkan ke dalam alokasi benih. Pada saat itu, 11M OBN telah mendanai 11 benih nirlaba, menyisakan 289M OBN untuk 289 benih tambahan masing-masing 1M OBN.

**Penerbitan berjalan:** Hanya melalui emisi staking; kontrak staking adalah satu-satunya minter.

**Pembagian imbalan atas emisi:**

- 88% staker
- 10% pool nirlaba yang dipilih
- 1% ExtendOliveBranch (distribusi nirlaba tahunan)
- 1% TheOffering (pemungutan suara tahunan bakar atau beri)

**Pembakaran sukarela:** Tersedia melalui burn untuk penyerap di masa depan.

---

## 12) Peta Jalan (Indikatif)

### 12.1 Perkecambahan

- Membentuk konsep dasar protokol
- Membangun dan menguji kontrak pintar
- Men-deploy OBNToken dan OBNStakingPools ke Base
- Meluncurkan frontend awal
- Menyediakan likuiditas awal
- Menjalankan kampanye airdrop awal
- Mengintegrasikan Farcaster dan alur pengguna asli Base
- Memulai pengindeksan publik wallet organisasi nirlaba
- Menetapkan narasi awal Proof-of-Contribution

### 12.2 Pertumbuhan

- Menerapkan pelacakan kontribusi yang diperluas di frontend
- Membangun dasbor Proof-of-Contribution
- Meningkatkan halaman pelaporan organisasi nirlaba
- Menjalankan siklus tahunan menggunakan AnnualGovernanceV2 dan OliveAssembly yang telah di-deploy, dengan pendaftaran, pemungutan suara komunitas, dan penyelesaian tanpa izin
- Memproduksi media edukasi
- Mengikutsertakan organisasi nirlaba tambahan
- Menjajaki kemitraan
- Merekrut kontributor penting jika memungkinkan
- Memperoleh audit keamanan pihak ketiga
- Menyelesaikan pekerjaan hukum dan tata kelola
- Membangun dan menguji backend/frontend DAO

### 12.3 Mekar

- Men-deploy DAO dan menyerahkan tata kelola kepada komunitas
- Mengalihkan kewenangan peningkatan melalui tata kelola timelock
- Mengalihkan voteAdmin AnnualGovernance ke alamat yang dikendalikan DAO seiring matangnya tata kelola
- Memelihara jaringan nirlaba
- Memperbarui frontend dengan fitur DAO
- Memperluas alat reputasi kontribusi dan pelaporan
- Memelihara dan menyesuaikan protokol seiring berkembangnya kebutuhan kepentingan publik

---

## 13) Lampiran — Fungsi Utama

### OBNStakingPools

**Mutasi pengguna:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (hanya charityFund)
- `charityFundBootstrap(pid, amount, beneficiary)` (hanya charityFund)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — Hanya wallet pemanggil

**Eksekusi yang didelegasikan:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — Hanya eksekutor; memerlukan persetujuan dan bulan saat ini; 1–32 ID pool yang benar-benar menaik

**Mutasi admin:**

- `claimFor(pid, user)` (hanya pemilik; independen dari persetujuan autoclaim)
- `setAutoClaimExecutor(executor)` (hanya pemilik; nol menjeda otomatisasi)
- `initializeV931(executor)` (hanya pemilik, reinitializer satu kali selama peningkatan)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (hanya charityFund)
- `setVersion(newVersion)` (hanya pemilik)
- `upgradeTo(newImplementation, data)` (hanya pemilik, kompatibel dengan tata kelola)

**Tampilan:**

- `pendingRewards(pid, user)` — Jumlah tertunda BRUTO
- `pendingRewardsMultiple(pids[], user)` — Jumlah tertunda untuk beberapa pool beserta total
- `autoClaimExecutor()` — Akun pintar otomatisasi yang berwenang
- `autoClaimPreference(user)` — Persetujuan dan nonce persetujuan
- `currentAutoClaimMonth()` — Tahun UTC × 12 + bulan (Januari = 1)
- `lastAutoClaimMonth(pid, user)` — Bulan klaim otomatis terakhir yang berhasil
- `unlockedBalance(pid, user)` — Tersedia untuk ditarik
- `stakeElapsed(user)` — Total detik staking
- `poolLength()` — Jumlah pool
- `charityContributedByUserInPool(pid, user)` — Kontribusi amal pengguna di suatu pool
- `totalCharityContributedByUser(user)` — Total kontribusi amal pengguna di semua pool

Tampilan penyajian dan analitik seperti `getGlobalStats`, `getPoolStats`, `getUserPoolView`, `getUserStats`, dan `getPoolAPR` disediakan melalui **OBNStakingLens** sebagai lapisan baca frontend kanonis.

### OBNToken

**Mutasi:**

- `setMinterOnce(minter)` (hanya pemilik, sekali)
- `mint(to, amount)` (hanya minter)
- ERC20 standar: `transfer`, `approve`, `transferFrom`
- Dukungan `permitAndCall` (EIP-2612)
- `burn(amount)` — Pembakaran sukarela
- `delegate(delegatee)` — Delegasi suara (ERC20Votes)

**Tampilan:**

- ERC20 standar: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**Mutasi:**

- `release()` — Melepaskan token yang telah vesting ke teamWallet
- `updateTeamWallet(newWallet)` (hanya pemilik)
- `rescueERC20(token, amount)` (hanya pemilik, tidak termasuk token vesting)

**Tampilan:**

- `vestedAmount(timestamp)` — Total vesting pada suatu waktu
- `claimableNow()` — Saat ini dapat diklaim
- `timeUntilCliff()` — Hitung mundur cliff
- `timeUntilNextRelease()` — Hitung mundur pelepasan berikutnya
- `nextReleaseTimestamp()` — Waktu pelepasan berikutnya

### TheOffering

**Mutasi tata kelola:**

- `burn(amount)` (hanya governance) — Membakar alokasi siklus tetap setelah suara BURN
- `sendToExtend(amount)` (hanya governance) — Mengirim alokasi siklus tetap ke ExtendOliveBranch setelah suara GIVE

**Mutasi admin:**

- `setGovernance(newGovernance)` (hanya timelockOwner) — Menghubungkan atau memperbarui alamat tata kelola; `address(0)` menjedanya
- `emergencySweep(token, to)` (hanya timelockOwner)

### ExtendOliveBranch

**Mutasi distribusi:**

- `distribute(nonprofit, amount)` (timelockOwner atau governance) — Menegakkan daftar putih
- `distributeFromGovernance(nonprofit, amount)` (hanya governance) — Pemeriksaan daftar putih sengaja dihilangkan; penerima telah divalidasi dan dibekukan saat batch surat suaranya disiapkan

**Mutasi admin:**

- `setApprovedNonprofit(nonprofit, approved)` (hanya timelockOwner) — Mengelola daftar putih distribusi
- `setGovernance(newGovernance)` (hanya timelockOwner)
- `emergencySweep(token, to)` (hanya timelockOwner)

**Tampilan:**

- `approvedNonprofit(nonprofit)` — Status daftar putih

### AnnualGovernance

**Mutasi admin suara:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (hanya voteAdmin) — Mengharuskan kedua durasi sama dengan 2,592,000 detik (30 hari); membuat snapshot kelayakan, stake, dan alokasi dana, membekukan batas jumlah pool, dan menyiapkan batch surat suara pertama

**Mutasi pengguna:**

- `castOfferingVote(cycleId, burn)` — Suara Fase 1
- `castNonprofitVote(cycleId, nonprofit)` — Suara Fase 2

**Eksekusi tanpa izin:**

- `prepareBallot(cycleId, maxPools)` memproses 1 hingga 100 ID pool per panggilan selama Fase 1
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — Melanjutkan persiapan surat suara yang belum selesai atau menyelesaikan fase yang siap; siapa pun dapat memanggilnya

**Admin pemilik (Timelock):**

- `cancelCycle(cycleId)` — Hanya sebelum Fase 1 dieksekusi
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)` (pengaturan kompatibilitas lama; tidak membatasi keanggotaan surat suara V2)

**Tampilan:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` melaporkan kemajuan dan penyelesaian persiapan
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` melaporkan alokasi moneter tetap
- `getCurrentVoterInfo(user)` melaporkan kelayakan terkini, berbeda dari snapshot siklus yang ada
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` melaporkan partisipasi dan penyelesaian yang dikonfirmasi
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — Kelayakan NFT khusus siklus dan kekuatan akar kuadrat; mengembalikan kekuatan dan status bootstrap checkpoint

### OliveAssembly

- `deposit(tokenId)` mendaftarkan satu OliveNFT yang disetujui per wallet dalam kustodi Assembly
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` memungkinkan penarikan yang dikendalikan penyetor, tanpa periode kunci
- `registeredTokenId(user)` / `registeredCount()` melaporkan pendaftaran saat ini; jumlahnya tidak menyiratkan kelayakan staking
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` melaporkan snapshot pendaftaran historis

### OBNStakingLens

Lapisan analitik hanya-baca; tidak menyimpan dana. Membuat ulang tampilan penyajian/analitik yang dihapus dari StakingPoolsV93 — semua panggilan tulis tetap pada OBNStakingPools.

**Tampilan:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — Kekuatan staking mentah dengan checkpoint, tanpa kelayakan NFT atau bobot akar kuadrat; gunakan `getVotingPowerForCycle` milik AnnualGovernanceV2 untuk pemungutan suara tahunan

**Admin:**

- `upgradeToAndCall(newImplementation, data)` (hanya pemilik)

---

## 14) Kata Akhir

Jika kita merancang rel keuangan untuk generasi mendatang, kita harus bersedia mengajukan pertanyaan yang lebih baik:

Dapatkah rel itu membantu menciptakan dunia yang lebih baik?

Kripto memberi kita sesuatu yang belum pernah ada: kemampuan untuk memprogram perilaku ke dalam uang. Aset digital tidak lagi harus diam. Ia dapat bergerak menurut aturan. Ia dapat memberi imbalan menurut aturan. Ia dapat menyalurkan nilai menurut aturan. Ia dapat menjadi lebih dari sekadar sesuatu yang dibeli, dijual, dan dispekulasikan orang.

Itu seharusnya berarti.

Olive Branch Network dibangun dari keyakinan bahwa uang yang dapat diprogram tidak boleh acuh. Jika kita dapat merancang token untuk memberi imbalan pada likuiditas, mengamankan jaringan, mendanai perbendaharaan, dan menggerakkan tata kelola, kita juga dapat merancangnya untuk mendukung organisasi yang melakukan kebaikan yang dapat diverifikasi di dunia.

OBN adalah upaya untuk membuktikan bahwa kontribusi dapat dibangun langsung ke dalam aset itu sendiri.

Pengguna tidak perlu mengorbankan pokok mereka untuk berpartisipasi. Mereka tidak perlu memberikan donasi terpisah. Mereka tidak perlu memilih antara menghasilkan dan membantu. Saat pengguna melakukan staking, mereka menghasilkan. Saat mereka mengklaim, organisasi nirlaba menerima. Saat jaringan tumbuh, lapisan kontribusi tumbuh bersamanya.

Itulah Proof-of-Contribution.

Pada intinya, protokol ini sengaja dibuat sederhana: pengguna melakukan staking ke pool nirlaba, imbalan dibagi oleh kontrak, dan sebagian emisi disalurkan ke tujuan di dunia nyata. Pembagian imbalan dalam kode menjaga sistem tetap jujur. ExtendOliveBranch memberi komunitas cara berulang untuk mengarahkan pendanaan nirlaba tambahan. TheOffering menawarkan staker pilihan tahunan antara membakar pasokan atau memberikan lebih banyak nilai kepada organisasi nirlaba.

OBN tidak dibangun di sekitar ekstraksi. OBN dibangun di sekitar keselarasan.

Pengguna diberi imbalan karena berpartisipasi. Organisasi nirlaba menerima dukungan berkelanjutan. Tata kelola memutuskan cara menyelesaikan aliran protokol tahunan. Setiap tindakan meninggalkan catatan on-chain yang transparan.

Ini bukan sekadar protokol staking.

Ini adalah mesin kontribusi.

Ini adalah lapisan kepentingan publik.

Ini adalah upaya serius untuk menjawab pertanyaan yang terlalu lama dihindari kripto:

Jika kita dapat memprogram uang untuk melakukan hampir apa saja, mengapa tidak memprogramnya untuk berbuat baik?

Setiap stake menjadi bukti.

Setiap klaim menciptakan catatan.

Setiap pool mewakili satu tujuan.

Dan setiap tahun, komunitas memutuskan sejauh mana mengulurkan ranting zaitun.

---

## Lampiran B — Kontrak yang Di-deploy (Base Mainnet)

Referensi ini menjelaskan perilaku staking V9.3.1 dan peningkatan AnnualGovernanceV2 yang diaktifkan pada 7 Oktober 2026 (blok Base 52283807). Revisi tata kelola tidak mengubah versi staking. Transaksi deployment, aktivasi proxy, dan aktivasi layanan dilacak dalam [catatan rilis operasional](governance-operations/2026-09-24-staking-v931-autoclaim-record.json).

Gunakan proxy staking untuk deposit, klaim, penarikan, dan perubahan persetujuan. `MonthlyAutoClaimUpgradeable` dikompilasi ke dalam implementasi V9.3.1 dan tidak di-deploy secara terpisah.

| Kontrak | Jenis | Alamat | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | Pemungutan suara akar kuadrat dengan pendaftaran NFT dan persiapan surat suara per batch; ditingkatkan 7 Oktober 2026. Gunakan proxy di atas untuk berinteraksi. | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Jaringan:** Base Mainnet (Chain ID: 8453)

**Catatan utama:**

- OBNToken dan OBNStakingPools menggunakan pola proxy UUPS untuk peningkatan yang dikendalikan tata kelola
- TeamVesting dan OBNTimeLock secara desain tidak dapat ditingkatkan
- TheOffering dan ExtendOliveBranch secara desain tidak dapat ditingkatkan
- Semua fungsi admin pada proxy UUPS melewati OBNTimeLock (penundaan 24 jam) melalui OPERATOR_SAFE 2-of-3

---

**Versi:** 9.3.1 Proof-of-Contribution / revisi tata kelola AnnualGovernanceV2

**Tanggal:** 13 Oktober 2026

**Repositori kanonis:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

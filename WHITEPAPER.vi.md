# Sách trắng Olive Branch Network — Proof-of-Contribution

[English](WHITEPAPER.md) · **Tiếng Việt** · [한국어](WHITEPAPER.ko.md) · [日本語](WHITEPAPER.ja.md) · [简体中文](WHITEPAPER.zh-CN.md) · [हिन्दी](WHITEPAPER.hi.md) · [العربية](WHITEPAPER.ar.md) · [Русский](WHITEPAPER.ru.md) · [Deutsch](WHITEPAPER.de.md) · [Português](WHITEPAPER.pt.md) · [Español](WHITEPAPER.es.md) · [Bahasa Indonesia](WHITEPAPER.id.md)

> Bản dịch này chỉ nhằm mục đích tiện tham khảo. Bản tiếng Anh ([WHITEPAPER.md](WHITEPAPER.md)) là bản có giá trị chính thức; nếu có khác biệt, bản tiếng Anh được ưu tiên áp dụng. Bản dịch được thực hiện với sự hỗ trợ của AI từ phiên bản `3c740d855` và chưa được dịch giả chuyên nghiệp rà soát. Tên hợp đồng, tên hàm và địa chỉ được giữ nguyên bằng tiếng Anh.

## Mục đích

Olive Branch Network là một giao thức staking theo cơ chế Proof-of-Contribution, được thiết kế để biến hoạt động tham gia on-chain thông thường thành nguồn tài trợ liên tục cho các tổ chức phi lợi nhuận, đồng thời vẫn thưởng cho người dùng khi tham gia. Người dùng stake OBN vào các pool dành riêng cho từng tổ chức phi lợi nhuận, nhận phần phát thải từ staking và giúp chuyển một phần xác định của lượng phát thải đó đến các mục tiêu thiện nguyện ngoài đời thực.

Mục tiêu không phải là buộc người dùng lựa chọn giữa kiếm lợi nhuận và đóng góp. Mục tiêu là khiến cả hai cùng diễn ra thông qua một hành động duy nhất trên giao thức.

OBN giới thiệu một lớp đóng góp, trong đó hoạt động staking tạo ra các bản ghi on-chain minh bạch gắn với những mục tiêu mà người dùng ủng hộ. Mọi lần stake, nhận thưởng, phân phối cho tổ chức phi lợi nhuận, bỏ phiếu quản trị, đốt token và phân bổ hằng năm đều trở thành một phần của hệ thống công khai, có thể được theo dõi, xác minh và phát triển thêm.

Đây là nền tảng của Proof-of-Contribution: một mô hình trong đó tài sản số không chỉ được dùng để đầu cơ, sinh lợi hay quản trị, mà còn để tạo ra đóng góp có thể đo lường được.

Tài liệu này xác định kiến trúc giao thức, kinh tế token, mô hình pool phi lợi nhuận, cấu trúc quản trị, lộ trình nâng cấp, các giả định bảo mật và toàn bộ quy trình hỗ trợ các tổ chức phi lợi nhuận thông qua OBN.

---

## 1) Tóm tắt tổng quan

**Sứ mệnh:** Biến việc đóng góp thành con đường dễ dàng nhất bằng cách chuyển một phần cố định của lượng phát thải staking đến ví của các pool phi lợi nhuận đã được phê duyệt — một cách tự động, minh bạch và có thể xác minh on-chain.

**Ý tưởng cốt lõi:** OBN được xây dựng xoay quanh **Proof-of-Contribution**: một mô hình trong đó người dùng chứng minh sự tham gia không chỉ bằng cách stake vốn, mà còn bằng cách liên tục giúp chuyển giá trị đến các mục tiêu phi lợi nhuận ngoài đời thực. Mọi lần stake, nhận thưởng và mọi dòng phần thưởng cho tổ chức phi lợi nhuận đều trở thành một phần của lớp đóng góp on-chain.

**Cơ chế:** Người dùng stake OBN vào các pool dành riêng cho từng tổ chức phi lợi nhuận. Tỷ lệ chia phát thải được mã hóa cứng: 88% cho người stake, 10% trực tiếp cho tổ chức phi lợi nhuận, 1% cho ExtendOliveBranch (phân phối hằng năm cho tổ chức phi lợi nhuận), 1% cho TheOffering (bỏ phiếu hằng năm về việc đốt hoặc trao tặng).

**Các đảm bảo trong thiết kế:**

- Tỷ lệ chia bốn phần cố định (88/10/1/1) ở cấp hợp đồng
- APR trên mỗi token bằng nhau giữa tất cả các pool tại một thời điểm (theo thiết kế, APR của các pool được cân bằng)
- Kế toán Proof-of-Contribution thông qua các dòng tài trợ phi lợi nhuận on-chain và các chế độ xem đóng góp của người dùng
- Mỗi pool có một charityWallet; pool không có cờ "retire/active"
- Khóa do quản trị viên đặt chỉ có thể tăng và tự động giảm nếu số dư giảm; chỉ dành cho giai đoạn bootstrap
- Minter duy nhất: sau setMinterOnce, chỉ hợp đồng staking mới có thể mint OBN
- Các giai đoạn phát thải dựa trên timestamp, với lịch trình giảm dần trong 10 năm
- Bảo vệ chống tổ chức phi lợi nhuận tự stake, quản lý vòng đời pool, di chuyển bootstrap nguyên tử, các biện pháp buộc rút khẩn cấp

**Quản trị và khả năng nâng cấp:** Các proxy UUPS do Timelock sở hữu cho Token, Staking, AnnualGovernance, Lens và OliveAssembly. AnnualGovernanceV2 đã hoạt động từ ngày 7 tháng 10 năm 2026: việc đăng ký NFT và lượng stake tại thời điểm snapshot xác định quyền biểu quyết theo căn bậc hai đối với các khoản phân bổ hằng năm. Quyền kiểm soát rộng hơn của DAO vẫn là một bước quản trị trong tương lai.

---

## 2) Proof-of-Contribution

### 2.1 Ý nghĩa của Proof-of-Contribution

Proof-of-Contribution là bản sắc cốt lõi của OBN.

Trong các hệ thống staking truyền thống, người dùng chứng minh sự tham gia bằng cách khóa vốn và nhận lợi suất. OBN giữ nền tảng staking đó nhưng bổ sung một lớp thứ hai: mọi hành động của người dùng cũng giúp tài trợ cho một pool phi lợi nhuận. Điều này có nghĩa là sự tham gia không chỉ được đo bằng đầu cơ, quyền sở hữu hay việc khai thác lợi suất, mà còn được đo bằng đóng góp.

Khi stake OBN vào một pool phi lợi nhuận, người dùng không chỉ đơn thuần chọn nơi kiếm phần thưởng. Họ đang chọn mục tiêu mà sự tham gia của mình giúp hỗ trợ. Khi họ nhận thưởng, giao thức tự động mint phần dành cho tổ chức phi lợi nhuận vào charityWallet của pool đã chọn. Kết quả là một bản ghi đóng góp minh bạch, on-chain, được tạo ra từ hoạt động tham gia giao thức thông thường.

Do đó, OBN biến staking thành một cơ chế đóng góp.

### 2.2 Vì sao điều này quan trọng

Hầu hết các giao thức crypto đo lường thành công qua thanh khoản, khối lượng, giá, số người dùng và TVL. OBN vẫn giữ các chỉ số đó nhưng bổ sung một thước đo quan trọng khác: mạng lưới chuyển được bao nhiêu giá trị đến các tổ chức vì lợi ích công.

Điều này tạo ra một dạng hiệu ứng mạng khác:

- Nhiều người dùng hơn tạo ra nhiều hoạt động staking hơn
- Nhiều hoạt động staking hơn tạo ra nhiều phát thải hơn
- Nhiều phát thải hơn tạo ra nhiều nguồn tài trợ phi lợi nhuận hơn
- Nhiều nguồn tài trợ phi lợi nhuận hơn tạo ra tác động rõ ràng hơn
- Tác động rõ ràng hơn củng cố bản sắc và uy tín của giao thức

Proof-of-Contribution gắn kết lợi ích cá nhân với lợi ích công. Người dùng có thể kiếm lợi nhuận, các tổ chức phi lợi nhuận có thể nhận tài trợ, và giao thức có thể xây dựng lịch sử đóng góp minh bạch mà không yêu cầu người dùng phải quyên góp riêng.

### 2.3 Đóng góp như một lớp danh tính on-chain

OBN có thể theo dõi đóng góp thông qua các chế độ xem hiện có và tương lai của giao thức, bao gồm:

- charityContributedByUserInPool(pid, user)
- totalCharityContributedByUser(user)
- các khoản phân phối từ thiện ở cấp pool
- tổng lượng charity đã mint cho từng ví của tổ chức phi lợi nhuận
- thời gian stake và lịch sử tham gia

Các chỉ số này cho phép giao thức xây dựng các bảng điều khiển đóng góp, hồ sơ tác động của người dùng, trang báo cáo về tổ chức phi lợi nhuận và các công cụ quản trị trong tương lai. Theo thời gian, Proof-of-Contribution có thể trở thành một lớp danh tính, cho thấy người dùng đã tham gia mạng lưới như thế nào và đã giúp hỗ trợ những mục tiêu nào.

Điều này không đòi hỏi người dùng phải hy sinh lợi suất. Giao thức được thiết kế để việc kiếm lợi nhuận và đóng góp diễn ra trong cùng một hành động.

---

## 3) Bộ hợp đồng

### 3.1 OBNToken (ERC20 + Permit + Votes + Burnable, UUPS)

**Tiêu chuẩn:** ERC20, EIP-2612 Permit, ERC20Votes (quyền biểu quyết có checkpoint), Burnable.

**Tính năng cốt lõi:**

- **ERC20Upgradeable:** Chuyển token, phê duyệt và số dư theo tiêu chuẩn
- **ERC20PermitUpgradeable:** permit() theo EIP-2612 để phê duyệt không tốn gas
- **ERC20VotesUpgradeable:** Quyền biểu quyết có checkpoint phục vụ quản trị (ủy quyền phiếu bầu, tra cứu lịch sử)
- **ERC20BurnableUpgradeable:** Người dùng có thể tự nguyện đốt token
- **UUPSUpgradeable:** Có thể nâng cấp với sự cho phép của chủ sở hữu
- **OwnableUpgradeable:** Một chủ sở hữu duy nhất, có khả năng chuyển giao

**Đợt mint genesis trong lịch sử (một lần duy nhất khi initialize)** của nguồn cung ban đầu 1,000,000,000 OBN. Các điểm đến của đợt mint ban đầu này không đại diện cho các khoản dự trữ chưa sử dụng hiện tại:

- 40% Thanh khoản — để khởi tạo các pool DEX
- 30% Airdrop — phân phối sớm cho cộng đồng
- 10% phân bổ từ thiện ban đầu
- 10% Ngân quỹ — cho quản trị và vận hành giao thức
- 10% Đội ngũ — chuyển vào hợp đồng TeamVesting với cliff và lịch trình vesting

Toàn bộ việc phân phối được mã hóa cứng trong `initialize()` và diễn ra một cách nguyên tử; không có đợt mint bổ sung nào trong giai đoạn genesis.

**Mô hình một minter (quy tắc cứng):**

- `setMinterOnce(address minterAddr)` đặt đúng một minter (hợp đồng staking) và chỉ có thể được gọi một lần
- Sau khi gọi `setMinterOnce`, không thể thay đổi minter trừ khi nâng cấp hợp đồng
- Chỉ minter mới có thể gọi `mint(to, amount)` để phân phối phần thưởng staking
- Ràng buộc mã hóa cứng này loại bỏ rủi ro phát hành tùy tiện và đảm bảo nguồn cung token có thể dự đoán được

**Cổng nâng cấp:** UUPS với `_authorizeUpgrade` giới hạn cho chủ sở hữu (sẽ do DAO kiểm soát sau giai đoạn bootstrap).

**Ủy quyền phiếu bầu:** Người dùng có thể gọi `delegate(delegatee)` để chuyển quyền biểu quyết của mình (mô hình ERC20Votes).

**Vì sao lại có cấu trúc này?**
Việc phân phối một lần duy nhất loại bỏ sự mơ hồ về nguồn cung ban đầu. Một minter duy nhất loại bỏ rủi ro phát hành tùy tiện. ERC20Votes giúp token phù hợp với sự kiểm soát của DAO và tạo điều kiện cho quản trị trong tương lai. Khả năng đốt tạo ra một cơ chế hấp thụ tự nguyện cho các tích hợp tương lai. Hỗ trợ Permit (EIP-2612) cải thiện trải nghiệm người dùng bằng cách loại bỏ các giao dịch phê duyệt riêng biệt.

### 3.2 OBNStakingPools (giai đoạn theo timestamp, kế toán theo từng pool, UUPS)

**Tỷ lệ chia phần thưởng mã hóa cứng (BPS):**

- STAKER_BPS = 8_800 → 88% cho người dùng
- CHARITY_BPS = 1_000 → 10% cho ví từ thiện (trực tiếp, theo từng hành động)
- CHARITY_FUND_BPS = 100 → 1% cho ExtendOliveBranch
- TREASURY_BPS = 100 → 1% cho TheOffering

Địa chỉ `charityFund` chuyển đến **ExtendOliveBranch** và địa chỉ `treasury` chuyển đến **TheOffering**. Cả hai đều tích lũy OBN trong suốt mỗi chu kỳ hằng năm. AnnualGovernance giải quyết cả hai số dư này thông qua các cuộc bỏ phiếu cộng đồng vào cuối mỗi chu kỳ. Xem Mục 3.4–3.6 để biết chi tiết về hợp đồng.

**Các giai đoạn phát thải (khởi tạo khi triển khai):**

- Năm 0–2: 10.00% APY
- Năm 2–4: 7.50% APY
- Năm 4–6: 5.00% APY
- Năm 6–8: 2.50% APY
- Năm 8–10: 1.25% APY

Quản trị có thể bổ sung các giai đoạn tương lai một cách liên tiếp; các giai đoạn trước đó vẫn bất biến.

**APR bằng nhau giữa các pool:** Theo cấu trúc, APR trên mỗi token chỉ phụ thuộc vào giai đoạn đang hoạt động, không phụ thuộc vào pool bạn chọn.

**Kế toán Proof-of-Contribution:** Hợp đồng staking cung cấp các chế độ xem đóng góp của người dùng và của pool, cho phép giao thức tính toán lượng tài trợ phi lợi nhuận có thể quy cho sự tham gia của từng người dùng.

**Mô hình dữ liệu:** PoolInfo { address charityWallet; uint256 totalStaked; } (mỗi pool một ví).

#### 3.2.1 Các hành động cốt lõi của người dùng

**Các endpoint có giới hạn, theo từng pool:**

- `deposit(pid, amount)` — Stake OBN vào một pool
- `depositFor(pid, amount, beneficiary)` — Stake thay cho một địa chỉ khác
- `depositWithPermit(...)` — Stake bằng ERC20 Permit (không cần phê duyệt riêng)
- `withdraw(pid, amount)` — Rút số dư chưa bị khóa
- `claim(pid)` — Nhận phần thưởng đang chờ
- `claimFor(pid, user)` — Nhận thưởng thay cho địa chỉ khác, chỉ chủ sở hữu mới được gọi
- `claimMultiple(pids[])` — Nhận phần thưởng đang chờ từ nhiều pool trong một giao dịch
- `setAutoClaimEnabled(bool)` — Đặt sự đồng ý của ví gọi hàm cho tất cả các pool của ví đó
- `autoClaimFor(pids[], user, month, consentNonce)` — Bên thực thi chuyên trách gửi một lô hằng tháng đã được cho phép

Người stake có thể chọn tham gia on-chain vào tính năng autoclaim hằng tháng được tài trợ phí cho tất cả các pool hiện tại và tương lai mà ví của họ nắm giữ. Tài khoản tự động hóa gom các pool có phần thưởng người dùng có thể nhận lớn hơn không, tối đa 32 pool mỗi giao dịch, và trả gas thông qua paymaster đã cấu hình. Hợp đồng cho phép một lần tự động nhận thưởng thành công cho mỗi pool trong mỗi tháng dương lịch UTC. Phần thưởng tuân theo cùng tỷ lệ 88% / 10% / 1% / 1% và đi đến cùng những người nhận như khi nhận thủ công. Người dùng có thể hủy sự đồng ý bất cứ lúc nào; việc nạp, rút và nhận thưởng thủ công vẫn khả dụng. Autoclaim không chuyển vốn gốc, không tái đầu tư phần thưởng và không thay đổi quyền biểu quyết.

Việc thay đổi sự đồng ý sẽ vô hiệu hóa các yêu cầu đã xếp hàng trước đó. Bật lại không đặt lại giới hạn hằng tháng. Tháng dương lịch UTC không phải là khoảng thời gian 30 ngày trượt; việc nhận thưởng thủ công không tiêu hao hạn mức tự động. Một pool đủ điều kiện khi phần của người dùng sau khi làm tròn số nguyên lớn hơn không, không có ngưỡng phần thưởng tối thiểu ở cấp dịch vụ. Việc tài trợ phí cho giao dịch chọn tham gia hoặc từ chối phụ thuộc vào khả năng hỗ trợ của ví. Hàm `claimFor` chỉ dành cho chủ sở hữu vẫn độc lập với sự đồng ý autoclaim. Trạng thái triển khai và kích hoạt được ghi lại trong Phụ lục B.

Các tùy chọn autoclaim được gắn với địa chỉ staking và tách biệt với bất kỳ hệ thống danh tính hay điều kiện biểu quyết nào trong tương lai. Bên thực thi không thể chuyển hướng phần thưởng, rút tiền stake của người dùng hoặc thay đổi sự đồng ý của họ.

**Cơ chế từ thiện:**

- 10% phần thưởng được mint theo từng hành động của người dùng (nhận thưởng, nạp, rút) trực tiếp vào charityWallet của pool đó
- 1% tích lũy liên tục vào ExtendOliveBranch; mỗi chu kỳ, cộng đồng bỏ phiếu chọn tổ chức phi lợi nhuận đã được phê duyệt nào nhận khoản phân bổ cố định của chu kỳ
- 1% tích lũy liên tục vào TheOffering; mỗi chu kỳ, cộng đồng bỏ phiếu để đốt khoản phân bổ được cố định khi chu kỳ bắt đầu hoặc tặng khoản đó cho ExtendOliveBranch
- Không có bộ đệm TVL toàn cục; việc chia diễn ra theo từng hành động để thực thi nguyên tử

#### 3.2.2 Quản lý vòng đời pool

**Cơ chế đóng pool:**

- `shutdownPool(pid)` — Chặn các khoản nạp MỚI; việc nhận thưởng và rút vẫn tiếp tục
- Cho phép người dùng rời đi một cách có trật tự mà không cần xóa pool
- Dữ liệu pool vẫn nguyên vẹn cho người stake

**Xóa pool:**

- `removePool(pid)` — Xóa mềm sau khi pool hoàn toàn trống (totalStaked == 0)
- Không đánh lại chỉ mục PID; tương thích ngược
- **An toàn ngân quỹ:** Nếu khoản charity cũ tích lũy trước khi xóa, nó được chuyển vào charityWallet của pool; nếu ví là địa chỉ không, nó được chuyển hướng sang treasury
- Ngăn thất thoát phần thưởng nếu người dùng nhận thưởng sau khi xóa pool

#### 3.2.3 Bảo vệ chống tổ chức phi lợi nhuận tự stake

**Chính sách:** Tổ chức phi lợi nhuận có thể nhận đúng MỘT khoản nạp bootstrap bị khóa vĩnh viễn. Mọi hình thức tự stake khác đều bị chặn.

**Thực thi:** Hàm `_enforceCharitySelfStakePolicy` kiểm tra:

- Người thụ hưởng có phải là ví từ thiện của pool không?
- Nếu có, khoản này có đến từ charityFund VÀ bị khóa VÀ số dư hiện tại của họ bằng không không?
- Nếu tất cả đều đúng thì cho phép (bootstrap đầu tiên). Nếu không thì từ chối.

**Lý do:** Ngăn các tổ chức phi lợi nhuận vô tình hoặc cố ý tự stake, điều có thể phá vỡ động lực phần thưởng của pool hoặc tạo điều kiện cho các cuộc tấn công.

#### 3.2.4 Di chuyển bootstrap nguyên tử

**Hàm:** `migrateBootstrap(pid, oldNonprofit, newNonprofit)`

**Các đảm bảo nguyên tử:**

- Bảo toàn phần thưởng đang chờ (được xác minh với dung sai 1 wei)
- Sao chép lượng bị khóa một cách an toàn, có ngăn chặn tràn số
- Cập nhật ví từ thiện một cách nguyên tử trong cùng giao dịch
- Vô hiệu hóa bộ đếm pool của người dùng cũ
- Kích hoạt người dùng mới nếu đây là lần stake pool đầu tiên của họ

**Điều kiện tiên quyết:**

- oldNonprofit LÀ ví từ thiện hiện tại của pool
- oldNonprofit ≠ newNonprofit
- oldNonprofit có lượng stake khác không
- newNonprofit chưa có lượng stake trong pool này

**Mục đích:** Cho phép chuyển vị thế của tổ chức phi lợi nhuận một cách liền mạch (ví dụ: địa chỉ bị xâm phạm, luân chuyển ví) mà không làm mất hoặc mắc kẹt phần thưởng.

#### 3.2.5 Buộc rút khẩn cấp

**Hàm:** `forceExitUserToSelf(pid, user, claimRewards)` (chỉ chủ sở hữu, nonReentrant)

**Hành vi:**

- Buộc người dùng rời khỏi một pool, bỏ qua các khóa
- Trả vốn gốc về cho người dùng ngay lập tức
- Tùy chọn mint phần thưởng đang chờ cho người dùng
- Xóa khóa, reward debt và bộ đếm người stake đang hoạt động

**Trường hợp sử dụng:** Biện pháp kiểm soát quản trị khẩn cấp khi xóa pool mà người dùng cần được khôi phục; được dùng sau khi pool đã đóng.

#### 3.2.6 Cập nhật ví từ thiện

**Hàm:** `updateCharityWallet(pid, newWallet)` (chỉ chủ sở hữu)

**Cho phép:** Cập nhật địa chỉ từ thiện của một pool (ví dụ: khi bị xâm phạm hoặc luân chuyển sang địa chỉ mới).

**Theo dõi qua:** sự kiện CharityWalletUpdated.

#### 3.2.7 Quản lý khóa

**Hàm:** `setLockedAmount(pid, user, amount)` (chỉ charityFund)

**Quy tắc:**

- Chỉ có thể TĂNG hoặc giữ nguyên; không bao giờ giảm
- Không được vượt quá số dư của người dùng
- Khóa tự động giảm nếu số dư xuống dưới lượng bị khóa
- Chỉ dành cho các khoản nạp bootstrap

**Khả năng quan sát:**

Các truy vấn phân tích được cung cấp qua **OBNStakingLens** (Mục 3.7) — lớp đọc chuẩn cho frontend và bảng điều khiển. Các truy vấn về khóa và số dư vẫn nằm trực tiếp trên hợp đồng staking:

- `pendingRewards(pid, user)` — Trả về lượng đang chờ GỘP (gross)
- `pendingRewardsMultiple(pids[], user)` — Trả về lượng đang chờ của nhiều pool cùng tổng số
- `unlockedBalance(pid, user)` — Trả về số dư trừ đi phần bị khóa
- `stakeElapsed(user)` — Tổng số giây đã stake (được giữ lại qua các lần hủy stake)
- `charityContributedByUserInPool(pid, user)` — Tổng lượng charity đã mint có thể quy cho người dùng trong một pool
- `totalCharityContributedByUser(user)` — Tổng lượng charity đã mint có thể quy cho người dùng trên tất cả các pool

Xem Mục 3.7 để biết toàn bộ các chế độ xem của OBNStakingLens (getGlobalStats, getPoolStats, getUserPoolView, getPoolAPR, pendingCharityFor).

### 3.3 TeamVesting (tuyến tính, có cliff; không thể nâng cấp)

**Cliff:** ~4 tháng; **Thời hạn:** ~20 tháng tuyến tính sau đó.

**`release()`:** Chuyển dần các token đã vesting đến teamWallet.

**Hàm hỗ trợ:** claimableNow, timeUntilCliff, timeUntilNextRelease, nextReleaseTimestamp.

**An toàn:** Không thể thu hồi token đang vesting; chỉ thu hồi được các ERC20 bị gửi nhầm.

### 3.4 TheOffering (không thể nâng cấp)

TheOffering là kho đốt-hoặc-tặng hằng năm của giao thức. Hợp đồng staking chuyển vị trí phát thải 1% treasury đến địa chỉ này. OBN tích lũy liên tục trong suốt mỗi chu kỳ hằng năm.

Vào cuối mỗi chu kỳ, AnnualGovernance thực thi kết quả bỏ phiếu Giai đoạn 1 của cộng đồng:

- **BURN:** Khoản phân bổ được ghi nhận khi chu kỳ bắt đầu bị đốt vĩnh viễn, làm giảm tổng nguồn cung OBN.
- **GIVE:** Khoản phân bổ được ghi nhận khi chu kỳ bắt đầu được chuyển đến ExtendOliveBranch, làm tăng khoản phân phối cho tổ chức phi lợi nhuận của chu kỳ đó.

**Kiểm soát truy cập:** `timelockOwner` (Timelock) kiểm soát các hàm quản trị, bao gồm `emergencySweep`. `governance` (AnnualGovernance) là địa chỉ duy nhất được phép gọi `burn()` hoặc `sendToExtend()`. Địa chỉ `governance` được khởi tạo là `address(0)` và được kết nối với AnnualGovernance qua `setGovernance()` thông qua Timelock.

**Không thể nâng cấp:** TheOffering được triển khai như một hợp đồng tiêu chuẩn, không có proxy. Các đối số của constructor (địa chỉ token `obn`, `timelockOwner`) là bất biến. Nếu cần thay thế, Timelock phải triển khai một hợp đồng mới và gọi `setTreasury(newAddress)` trên proxy staking để định tuyến lại phát thải.

### 3.5 ExtendOliveBranch (không thể nâng cấp)

ExtendOliveBranch là kho phân phối hằng năm cho tổ chức phi lợi nhuận của giao thức. Hợp đồng staking chuyển vị trí phát thải 1% charityFund đến địa chỉ này. OBN tích lũy liên tục và cũng có thể nhận khoản tặng từ TheOffering khi cộng đồng bỏ phiếu GIVE ở Giai đoạn 1.

Vào cuối mỗi chu kỳ, AnnualGovernance thực thi kết quả bỏ phiếu Giai đoạn 2 của cộng đồng: charityWallet của pool phi lợi nhuận thắng cuộc nhận khoản phân bổ cố định theo chu kỳ của ExtendOliveBranch trong một giao dịch duy nhất.

**Danh sách tổ chức phi lợi nhuận được phê duyệt:** ExtendOliveBranch duy trì một danh sách trắng các địa chỉ nhận đã được phê duyệt. Timelock có thể gọi `setApprovedNonprofit(address, bool)`. Tất cả ví từ thiện của pool đều được giữ trong danh sách trắng; các pool mới được phê duyệt một cách nguyên tử cùng với `addPool` thông qua `schedule_addPool.js`.

**Phân phối:** Chỉ địa chỉ `governance` mới có thể gọi `distributeFromGovernance(to, amount)`. Kho không lặp lại việc kiểm tra danh sách trắng trên đường này: AnnualGovernanceV2 xác thực từng người nhận khi lô lá phiếu của họ được chuẩn bị và chỉ thanh toán cho thành viên lá phiếu được chọn.

**Không thể nâng cấp:** Cùng đảm bảo bất biến như TheOffering. Các đối số của constructor (`obn`, `timelockOwner`) là bất biến.

### 3.6 AnnualGovernanceV2 (bản triển khai đang hoạt động; proxy UUPS hiện có)

AnnualGovernance điều phối các chu kỳ quyết định hằng năm cho cả TheOffering và ExtendOliveBranch. Proxy UUPS hiện có do Timelock sở hữu của nó đã được nâng cấp lên AnnualGovernanceV2 vào **ngày 7 tháng 10 năm 2026, tại khối Base 52283807**, như được ghi nhận trong [tài liệu triển khai của kho mã nguồn](README.md#annual-governance). OliveAssembly cung cấp việc đăng ký NFT có checkpoint cho các quy tắc biểu quyết mới. Bản thân việc triển khai không khởi động một chu kỳ hằng năm.

**Cấu trúc chu kỳ:** Mỗi chu kỳ hằng năm gồm hai giai đoạn nối tiếp:

1. **Giai đoạn 1 — Đốt hay Tặng:** Những người stake đã đăng ký và đủ điều kiện bỏ phiếu về khoản phân bổ của TheOffering được ghi nhận khi chu kỳ bắt đầu. Kết quả thắng được thực thi một cách nguyên tử: BURN gọi `TheOffering.burn()`; GIVE gọi `TheOffering.sendToExtend()`.

2. **Giai đoạn 2 — Chọn tổ chức phi lợi nhuận:** Những người stake đã đăng ký và đủ điều kiện chọn tổ chức phi lợi nhuận đã được phê duyệt sẽ nhận khoản phân bổ đầu chu kỳ của ExtendOliveBranch cộng với khoản chuyển GIVE của chu kỳ đó, nếu có. Các khoản nhận sau đó được giữ lại cho chu kỳ tiếp theo. Không có giới hạn cứng về lá phiếu: các lô không cần cấp phép xử lý tối đa 100 ID pool mỗi lần gọi theo thứ tự tăng dần, loại trừ các pool đã bị xóa hoàn toàn và loại bỏ các ví từ thiện trùng lặp. Các pool đã đóng vẫn đủ điều kiện cho đến khi bị xóa hoàn toàn. charityWallet thắng cuộc nhận khoản phân bổ cố định thông qua `ExtendOliveBranch.distributeFromGovernance()`.

**Phá vỡ thế hòa:**

- Giai đoạn 1: GIVE chỉ thắng nếu tổng phiếu của nó lớn hơn hẳn BURN. Hòa chính xác — hoặc không có ai tham gia — sẽ được giải quyết thành BURN.
- Giai đoạn 2: tổ chức phi lợi nhuận có tổng phiếu cao nhất sẽ thắng; khi hòa, tổ chức đứng sớm nhất trên lá phiếu sẽ thắng. Nếu không có phiếu nào được bỏ, số dư được chuyển sang chu kỳ tiếp theo thay vì được phân phối.

**Tính toàn vẹn của phiếu bầu:**

- Điều kiện tham gia yêu cầu một OliveNFT đã đăng ký trong OliveAssembly và ít nhất 1 OBN trong tổng số dư stake tại `block.number - 1` trước khi chu kỳ bắt đầu. Cả hai giai đoạn dùng chung snapshot đó; việc đăng ký hoặc stake sau đó không thể bổ sung quyền cho chu kỳ, và việc rút sau đó không xóa quyền lợi của chu kỳ.
- Quyền biểu quyết là căn bậc hai của lượng stake tại snapshot: 100 OBN đã stake cho 10 đơn vị quyền biểu quyết. Hợp đồng tính `floor(sqrt(stakeInWei)) * 1e9`, biểu diễn theo đơn vị 18 chữ số thập phân. NFT bổ sung trong một ví không tăng thêm quyền; các chu kỳ trước V2 trong lịch sử giữ nguyên trọng số tuyến tính ban đầu.
- Safe voteAdmin trực tiếp khởi động Giai đoạn 1, không qua độ trễ của Timelock, và chuẩn bị lô lá phiếu đầu tiên. Bất kỳ ai cũng có thể tiếp tục chuẩn bị và tất toán từng giai đoạn. Giai đoạn 1 kéo dài đúng 30 ngày và không thể tất toán cho đến khi hoàn tất chuẩn bị lá phiếu; Giai đoạn 2 có đủ 30 ngày kể từ thời điểm tất toán thực tế của Giai đoạn 1.

**Thực thi:** AnnualGovernance gọi trực tiếp TheOffering và ExtendOliveBranch. Không cần thêm sự phê duyệt của multisig sau khi cuộc bỏ phiếu kết thúc — kết quả được hợp đồng thực thi.

**Khả năng nâng cấp:** AnnualGovernance là một proxy UUPS. Các cơ chế biểu quyết phức tạp hơn (ủy quyền, yêu cầu quorum, biểu quyết có trọng số theo thời gian) có thể được bổ sung thông qua các nâng cấp do Timelock quản lý khi DAO trưởng thành.

**Thời điểm chuẩn bị:** Điều kiện tham gia của cử tri và lượng stake dùng snapshot của khối trước; số dư quỹ và độ dài lịch sử pool được ghi nhận trong giao dịch khởi động của Safe. Trạng thái ví/xóa của mỗi pool và sự phê duyệt của mỗi người nhận mới được đọc khi lô của chúng thực thi. Các ID pool sau đó bị loại trừ và những người nhận đã được chấp nhận vẫn cố định, ngay cả khi sự phê duyệt của họ sau đó bị thu hồi. Người nhận chưa được phê duyệt làm lô đó bị revert; Timelock phải sửa cấu hình hoặc hủy chu kỳ trước khi tất toán Giai đoạn 1. Tránh thay đổi cấu hình tổ chức phi lợi nhuận trong lúc chuẩn bị.

**Tham số đang hoạt động và các biện pháp bảo vệ:** `owner` = Timelock; `voteAdmin` = OperatorSafe. Bộ nhớ `maxBallotSize` cũ được giữ lại để tương thích nhưng không hạn chế tư cách thành viên. Các nâng cấp của Governance và OliveAssembly bị chặn trong suốt các chu kỳ đang hoạt động, kể cả giai đoạn chuẩn bị. Việc hủy chỉ khả dụng trước khi Giai đoạn 1 thực thi. Các khoản phân bổ là những khoản dự trữ về mặt kế toán trong các kho hiện có, không phải lưu ký tách biệt; khoản thiếu hụt phải được bù đắp trước khi việc tất toán có thể thành công.

**Đăng ký OliveAssembly:** Phê duyệt cho proxy Assembly chuyển một OliveNFT, sau đó gọi `deposit(tokenId)` để đăng ký. Assembly giữ một NFT cho mỗi ví; việc đăng ký duy trì qua các chu kỳ cho đến khi rút. Người gửi có thể dùng `withdraw()`, `withdrawTo(recipient)` hoặc `withdrawExpected(tokenId, recipient)` mà không có thời gian khóa. Quản trị viên không thể rút các NFT đã đăng ký. Việc đăng ký NFT không xác lập danh tính con người duy nhất.

### 3.7 OBNStakingLens (proxy UUPS)

OBNStakingLens là một hợp đồng phân tích chuyên dụng, chỉ đọc. Đây là lớp đọc chuẩn cho frontend, bảng điều khiển và các công cụ phân tích ngoài chuỗi. Việc gom các truy vấn phân tích vào một proxy có thể nâng cấp riêng giúp bề mặt bên ngoài của hợp đồng staking luôn tối giản và ổn định, trong khi khả năng phân tích có thể phát triển độc lập.

**Các chế độ xem chính:**

- `getGlobalStats()` — Số lượng pool, tổng TVL, số người stake duy nhất, phần thưởng mỗi giây hiện tại
- `getPoolStats(pid)` — Thống kê theo từng pool: ví từ thiện, lượng đã stake, số người stake, trạng thái bộ tích lũy
- `getUserPoolView(pid, user)` — Dữ liệu staking của từng người dùng: số dư, khóa, phần thưởng đang chờ, trạng thái hoạt động
- `getPoolAPR(pid)` — APR hiện tại cho phần của người stake trong một pool
- `pendingCharityFor(pid, user)` — Ước tính khoản đóng góp phi lợi nhuận đang chờ có thể quy cho một người dùng

**Kiểm soát truy cập:** `owner` (Timelock) kiểm soát việc nâng cấp. Lens đọc từ proxy staking với tư cách bên gọi chỉ xem và không có trạng thái có thể thay đổi của riêng mình.

**Khởi tạo:** `initialize(stakingPools, timelock)` — đặt địa chỉ proxy staking và chủ sở hữu Timelock.

---

## 4) Kinh tế token và tính bền vững dài hạn

### 4.1 Toán học phát thải (trực quan)

Gọi cơ sở APR của giai đoạn là B (tính bằng BPS), TVL toàn cục là G và TVL của pool là P.

**Tổng gộp hằng năm cho pool:** YearlyPoolGross = P × (B / 10,000)

**Người stake nhận 88% trong đó;** phần còn lại chuyển đến charityWallet của tổ chức phi lợi nhuận (10%), ExtendOliveBranch (1%), TheOffering (1%).

**APR trên mỗi token được rút gọn thành** 0.88 × (B / 10,000), **bằng nhau giữa các pool** — không phụ thuộc vào quy mô nguồn cung.

### 4.2 Phát thải giảm dần hỗ trợ tính bền vững

**Áp lực bán suy giảm:** Lượng phát hành thấp hơn theo thời gian làm giảm áp lực bán mang tính cấu trúc.

**Nhu cầu xuất phát từ mục tiêu:** Giao thức tạo ra sự gắn kết liên tục giữa người dùng, tổ chức phi lợi nhuận và uy tín dài hạn của mạng lưới.

**Uy tín TVL:** Các khóa bootstrap tạo ra TVL bền vững, cải thiện niềm tin và quá trình khám phá giá.

**Khả năng dự đoán:** Với các tỷ lệ chia và giai đoạn nằm on-chain, người tham gia có thể lên kế hoạch dài hạn.

**Lịch sử đóng góp:** Proof-of-Contribution bổ sung một dạng giá trị khác của giao thức: bằng chứng minh bạch về nguồn tài trợ lợi ích công được tạo ra từ sự tham gia của người dùng.

### 4.3 Tối giản tỷ lệ chia phát thải (1% + 1%)

Người dùng nhận 88%, tài trợ trực tiếp cho tổ chức phi lợi nhuận chiếm 10%, và 2% còn lại tích lũy vào ExtendOliveBranch và TheOffering — mỗi kho được giải quyết hằng năm thông qua bỏ phiếu quản trị cộng đồng.

Việc giữ mỗi dòng tích lũy cho quản trị ở mức 1% đảm bảo giao thức vẫn tinh gọn và lấy người dùng cùng hoạt động từ thiện làm trung tâm. Không dòng nào có thể bị âm thầm chuyển hướng; cả hai đều được quản trị minh bạch on-chain thông qua AnnualGovernance.

### 4.4 Các dòng quản trị hằng năm (1% + 1%)

Cả hai dòng phát thải 1% đều do AnnualGovernance quản lý, mỗi dòng có mục đích được xác định rõ. V2 ghi nhận cả hai số dư khi chu kỳ bắt đầu; Giai đoạn 2 chỉ cộng thêm khoản chuyển GIVE của chu kỳ đó. Các khoản nhận sau đó được giữ lại cho chu kỳ tiếp theo.

**ExtendOliveBranch (1% phát thải):** Tích lũy OBN liên tục trong suốt mỗi chu kỳ hằng năm. Vào cuối mỗi chu kỳ, người stake bỏ phiếu trong Giai đoạn 2 của AnnualGovernance để chọn pool phi lợi nhuận đã được phê duyệt sẽ nhận khoản phân bổ cố định của chu kỳ. Điều này cung cấp cho cộng đồng một cơ chế minh bạch và định kỳ để hướng nguồn lực cấp giao thức đến những mục tiêu cụ thể.

**TheOffering (1% phát thải):** Tích lũy OBN liên tục. Vào cuối mỗi chu kỳ, người stake bỏ phiếu trong Giai đoạn 1 của AnnualGovernance để chọn giữa hai kết quả: BURN khoản phân bổ đầu chu kỳ (giảm phát vĩnh viễn) hoặc GIVE cho ExtendOliveBranch (cộng thêm vào khoản phân phối cho tổ chức phi lợi nhuận của chu kỳ đó). Cuộc bỏ phiếu này trao cho cộng đồng quyền kiểm soát liên tục đối với chính sách nguồn cung — một quyết định ngày càng quan trọng khi TVL của giao thức và lượng tích lũy hằng năm tăng lên.

Toàn bộ cấu trúc phần thưởng:

- **Khoản phân bổ 10% theo từng hành động** được chuyển trực tiếp và nguyên tử đến charityWallet của pool đã chọn trong mỗi lần nhận thưởng.
- **Dòng 1% ExtendOliveBranch** tích lũy và được phân phối lại hằng năm cho tổ chức phi lợi nhuận do quản trị lựa chọn.
- **Dòng 1% TheOffering** tích lũy và hoặc bị đốt, hoặc được cộng vào khoản phân phối cho tổ chức phi lợi nhuận của năm đó.

### 4.5 Khả năng đốt (cơ chế hấp thụ tùy chọn)

OBN có tính lạm phát thông qua staking, nhưng việc đốt tự nguyện (ví dụ: phí ứng dụng trong tương lai) có thể bù đắp lượng phát hành — một cách phi tập trung và theo thị trường.

---

## 5) Cơ chế giao thức và lý do thiết kế

### 5.1 Phân phối cho tổ chức phi lợi nhuận

**Mô hình theo từng hành động:** Trong mỗi lần nhận thưởng/nạp/rút, 10% phần thưởng đang chờ của người dùng được mint trực tiếp vào charityWallet của pool đó.

**Thực thi nguyên tử:** Không có lệnh gọi bên ngoài hay bộ đệm toàn cục; mọi khoản chia đều diễn ra trong giao dịch của người dùng.

**Không có tranh chấp phân bổ:** Hoạt động từ thiện của mỗi pool là độc lập; không có hàm tái phân bổ toàn cục.

**Proof-of-Contribution:** Vì việc phân phối từ thiện gắn với hành động của người dùng và lựa chọn pool, giao thức có thể quy đóng góp cho từng người dùng và từng pool phi lợi nhuận cụ thể.

### 5.2 Các dòng quản trị hằng năm so với Quỹ dự trữ hạt giống phi lợi nhuận

**Quỹ dự trữ hạt giống phi lợi nhuận:** Khoản phân bổ 300M OBN tài trợ cho các khoản hạt giống phi lợi nhuận được stake vĩnh viễn, mỗi khoản 1M OBN. Khoản này tách biệt với phát thải staking đang diễn ra và các khoản phân bổ quản trị hằng năm. Xem Mục 11 để biết kế toán dự trữ.

**ExtendOliveBranch (1% phát thải đang diễn ra):** Tích lũy liên tục. Các cuộc bỏ phiếu Giai đoạn 2 của AnnualGovernance chọn tổ chức phi lợi nhuận đã được phê duyệt sẽ nhận khoản phân bổ cố định của chu kỳ. Đây là cơ chế đóng góp có định hướng hằng năm của giao thức.

**TheOffering (1% phát thải đang diễn ra):** Tích lũy liên tục. Các cuộc bỏ phiếu Giai đoạn 1 của AnnualGovernance chọn giữa việc đốt khoản phân bổ đầu chu kỳ hoặc tặng nó cho ExtendOliveBranch. Đây là cơ chế chính sách nguồn cung hằng năm của giao thức.

Sự phân biệt ba chiều này rất quan trọng:

- **Phần thưởng 10% cho tổ chức phi lợi nhuận** diễn ra tự động, theo từng hành động và riêng cho từng pool.
- **Quỹ dự trữ hạt giống phi lợi nhuận** tài trợ các khoản stake bootstrap từ các khoản nắm giữ đã phân bổ.
- **Các dòng quản trị hằng năm 1% + 1%** là phát thải đang diễn ra, được giải quyết hằng năm thông qua bỏ phiếu cộng đồng.

### 5.3 Khóa vĩnh viễn (chỉ cho bootstrap; chỉ tăng)

**Chính sách:** Quản trị viên chỉ có thể tăng lockedAmount và không bao giờ giảm được; khóa tự động giảm nếu số dư của người dùng xuống dưới mức khóa đã lưu.

**Mục đích:** Hoàn toàn phục vụ cơ chế bootstrap. Các khóa đảm bảo vốn gốc hạt giống không thể bị rút, đồng thời cho phép người thụ hưởng kiếm lợi suất ngay từ ngày đầu. Điều này bảo vệ tính toàn vẹn của TVL và ngăn việc bán tháo ngay lập tức các token hạt giống.

**Các khoản stake của người dùng mặc định không bị khóa;** người dùng luôn có thể rút số dư chưa bị khóa của mình.

### 5.4 Không có bộ điều khiển phát thải

Các giai đoạn xác định đầy đủ lượng phát hành; không có "núm vặn tỷ lệ" bên ngoài. DAO có thể bổ sung các giai đoạn tương lai một cách liên tiếp kèm thông báo trước (timelock).

---

## 6) Tổ chức phi lợi nhuận: ví, tiếp nhận và hiển thị

### 6.1 Mỗi pool một ví

Mỗi pool ánh xạ đến một charityWallet duy nhất. Điều này giữ cho việc định tuyến mang tính xác định và việc báo cáo đơn giản.

### 6.2 Niêm yết ưu tiên địa chỉ

Chúng tôi đang lập chỉ mục các địa chỉ Ethereum công khai mà các tổ chức uy tín đã công bố và đưa chúng vào nền tảng của mình.

Ngoài ra, chúng tôi đang liên hệ với các tổ chức qua email và điện thoại để cho họ biết về nền tảng của chúng tôi.

Theo mặc định, mọi trang từ thiện đều hiển thị biểu ngữ rõ ràng "Không liên kết / Không được chứng thực", trừ khi tồn tại mối quan hệ trực tiếp hoặc sự công nhận chính thức.


### 6.3 Chương trình Bootstrap

**Mục tiêu:** Đảm bảo mỗi tổ chức từ thiện mới được tiếp nhận đều kiếm được ngay từ ngày đầu và các pool khởi đầu với TVL đáng tin cậy.

**Nguồn tiền:** Quỹ dự trữ hạt giống phi lợi nhuận 300M OBN tài trợ các khoản stake bootstrap 1M OBN cho mỗi tổ chức phi lợi nhuận. Việc cấp hạt giống do cộng đồng tài trợ hỗ trợ tiếp tục tiếp nhận khi dự trữ cạn; không có giới hạn cứng về số pool.

**Cơ chế:**

1. Quản trị hoặc bên thực thi được ủy quyền (địa chỉ `charityFund`, được đặt là ExtendOliveBranch) gọi `charityFundBootstrap(pid, amount, beneficiary)` hoặc dùng `depositForWithLock(pid, amount, beneficiary)` khi phù hợp.
2. Lượng OBN bootstrap được stake và khóa vĩnh viễn cho pool/người thụ hưởng của tổ chức phi lợi nhuận đó.
3. Khóa ngăn việc rút vốn gốc hạt giống, loại bỏ rủi ro bán tháo ngay lập tức trong khi vị thế vẫn liên tục kiếm lợi suất.
4. Tổ chức phi lợi nhuận được hưởng lợi từ cả lợi suất phần người stake trên vị thế bootstrap bị khóa của mình và khoản phân bổ từ thiện 10% của pool được chuyển đến charityWallet.

**Báo cáo:** Mỗi lần bootstrap đều minh bạch on-chain và được đưa vào các công bố công khai định kỳ.

**Bảo vệ:** `_enforceCharitySelfStakePolicy` đảm bảo mỗi tổ chức phi lợi nhuận chỉ có thể nhận một vị thế bootstrap bị khóa. Các khoản stake thông thường trong tương lai phải đến từ người dùng bên ngoài, còn việc di chuyển ví của tổ chức phi lợi nhuận phải tuân theo quy trình di chuyển do quản trị kiểm soát của giao thức.

### 6.4 Chính sách hủy niêm yết

Nếu các tiêu chuẩn không được đáp ứng, chúng tôi sẽ gỡ tổ chức phi lợi nhuận khỏi frontend và ngừng quảng bá pool đó.

Các khoản stake và phần thưởng đang chờ của người dùng nên được trả lại cho họ trước khi pool bị đóng và xóa khỏi giao thức.

OBN là một giao thức định tuyến và staking, không phải là một tổ chức phi lợi nhuận đã đăng ký hay một bên chứng nhận. Người dùng nên tự xác minh các tổ chức và tham khảo ý kiến chuyên gia thuế.

---

## 7) Quản trị và khả năng nâng cấp

### 7.1 Proxy UUPS và thẩm quyền

Việc nâng cấp Token, Staking, AnnualGovernance, Lens và OliveAssembly cần có sự cho phép của chủ sở hữu Timelock. OperatorSafe lên lịch các thay đổi quản trị thông qua Timelock 24 giờ. AnnualGovernance và OliveAssembly còn từ chối nâng cấp trong các chu kỳ đang hoạt động.

Các cuộc bỏ phiếu phân bổ hằng năm đang hoạt động theo mô hình biểu quyết căn bậc hai với NFT đã đăng ký. Safe voteAdmin khởi động các chu kỳ; các bên gọi không cần cấp phép chuẩn bị lá phiếu và thực thi kết quả. Điều này không chuyển thẩm quyền nâng cấp giao thức cho các cử tri hằng năm. Quyền kiểm soát rộng hơn của DAO vẫn là một bước trong tương lai.

### 7.2 Mã hóa cứng so với do quản trị kiểm soát

**Các ràng buộc mã hóa cứng hoặc ở cấp hợp đồng (cần nâng cấp để thay đổi khi áp dụng):**

- Tỷ lệ chia bốn phần: 88% / 10% / 1% / 1%
- Lịch trình phát thải 10 năm (thay đổi mỗi 2 năm): 10% APY → 7.5% APY → 5% APY → 2.5% APY → 1.25% APY
- Ngữ nghĩa khóa của quản trị viên (chỉ tăng, tự động giảm)
- Một minter duy nhất trong OBNToken
- Chính sách tổ chức phi lợi nhuận tự stake
- Các đảm bảo nguyên tử của di chuyển bootstrap
- Kế toán đóng góp được cung cấp bởi các chế độ xem của hợp đồng

**Do quản trị kiểm soát (không cần nâng cấp trừ khi một triển khai cụ thể yêu cầu):**

- Thêm pool (`addPool(charityWallet)`)
- Thực hiện các khoản stake bootstrap từ Quỹ dự trữ hạt giống phi lợi nhuận hoặc nguồn tài trợ cộng đồng được ủy quyền
- Khởi động các chu kỳ AnnualGovernance thông qua Safe voteAdmin; AnnualGovernanceV2 xác định thành viên lá phiếu thông qua các lô không cần cấp phép, không phải qua tuyển chọn tùy ý
- Bổ sung liên tiếp các giai đoạn tương lai (`addPhase`)
- Đóng hoặc xóa pool
- Báo cáo chi tiêu và sử dụng cho TheOffering và ExtendOliveBranch
- Tiêu chuẩn cho việc tiếp nhận, hủy niêm yết, thay thế và di chuyển tổ chức phi lợi nhuận

### 7.3 Quản trị

Quản trị có thể quản lý những tổ chức phi lợi nhuận nào được đưa vào, nhưng giả định mặc định là OBN vẫn lấy các pool phi lợi nhuận làm trung tâm.

### 7.4 AnnualGovernance

AnnualGovernance là cơ chế on-chain cho các quyết định định kỳ của cộng đồng OBN, cung cấp các chu kỳ xác định, được hợp đồng thực thi cho TheOffering và ExtendOliveBranch.

**Cấu trúc chu kỳ:**

Mỗi chu kỳ bắt đầu khi voteAdmin mở chu kỳ. Giai đoạn 1 và Giai đoạn 2 diễn ra nối tiếp nhau.

- **Giai đoạn 1 (Đốt hay Tặng):** Những người stake đã đăng ký và đủ điều kiện bỏ phiếu về khoản phân bổ đầu chu kỳ của TheOffering. BURN giảm nguồn cung vĩnh viễn. GIVE chuyển khoản phân bổ đó đến ExtendOliveBranch, làm tăng khoản phân phối cho tổ chức phi lợi nhuận của chu kỳ đó.
- **Giai đoạn 2 (Chọn tổ chức phi lợi nhuận):** Người stake bỏ phiếu chọn pool phi lợi nhuận đã được phê duyệt sẽ nhận khoản phân bổ cố định theo chu kỳ của ExtendOliveBranch. Các lô lá phiếu quét các ID pool đủ điều kiện và xác thực ví từ thiện của chúng theo danh sách trắng được duy trì trong ExtendOliveBranch thông qua `setApprovedNonprofit`.

**Phá vỡ thế hòa:**

- Giai đoạn 1: BURN thắng theo mặc định — GIVE phải lớn hơn hẳn tổng phiếu của BURN mới thắng. Hòa (hoặc không có phiếu nào) sẽ được giải quyết thành BURN.
- Giai đoạn 2: tổ chức phi lợi nhuận có nhiều phiếu nhất sẽ thắng; khi hòa, tổ chức có chỉ số lá phiếu thấp nhất sẽ thắng. Nếu không có phiếu nào được bỏ, số dư được chuyển sang chu kỳ tiếp theo thay vì được phân phối.

**Tính toàn vẹn của phiếu bầu:**

- Yêu cầu một OliveNFT đã đăng ký và ít nhất 1 OBN tổng lượng stake tại snapshot của khối trước. Quyền biểu quyết là căn bậc hai của lượng stake tại snapshot, và cả hai giai đoạn dùng cùng một quyền lợi (Mục 3.6).
- AnnualGovernanceV2 không có giới hạn cứng về pool hay lá phiếu. Mỗi giao dịch chuẩn bị xử lý tối đa 100 ID pool; giới hạn công việc này không phải là giới hạn thành viên. Giai đoạn 2 chờ việc chuẩn bị hoàn tất.
- Safe khởi động chu kỳ một lần; các lệnh gọi keeper không cần cấp phép chuẩn bị lá phiếu và thực thi các bước chuyển giai đoạn. Giai đoạn 2 có đủ 30 ngày kể từ thời điểm tất toán thực tế của Giai đoạn 1.

**Thực thi:**

AnnualGovernance gọi trực tiếp `TheOffering.burn()`, `TheOffering.sendToExtend()` hoặc `ExtendOliveBranch.distributeFromGovernance()`. Không cần thêm sự phê duyệt của multisig sau khi cuộc bỏ phiếu kết thúc — kết quả được hợp đồng thực thi.

**Khả năng nâng cấp:**

AnnualGovernance là một proxy UUPS. Timelock có thể nâng cấp nó để hỗ trợ các cơ chế biểu quyết phức tạp hơn (ủy quyền, yêu cầu quorum, quyền có trọng số theo thời gian) khi DAO trưởng thành.

---

## 8) Mô hình bảo mật

### 8.1 Nguyên tắc cốt lõi

- **Checks-Effects-Interactions:** Cập nhật trạng thái trước các lệnh gọi bên ngoài
- **Bảo vệ chống reentrancy:** nonReentrant trên mọi đường thay đổi trạng thái
- **SafeERC20:** Dùng cho mọi giao dịch chuyển token
- **Toán học chính xác:** Math.mulDiv để tính toán chính xác
- **Không có vòng lặp vô hạn:** Các endpoint theo từng pool, cập nhật có giới hạn

### 8.2 Tăng cường

**Thao tác nguyên tử:** Di chuyển bootstrap, xóa pool và buộc rút đều hoàn tất một cách nguyên tử.

**Bảo toàn phần thưởng:** Xác thực rõ ràng rằng phần thưởng đang chờ được bảo toàn trong quá trình di chuyển (với dung sai 1 wei).

**Ngăn tràn khóa:** Ràng buộc NewLock ≤ userBalance được thực thi trước khi đặt lượng bị khóa.

**Phương án dự phòng ngân quỹ:** Phần thưởng bị mắc kẹt được chuyển hướng đến treasury thay vì bị mất.

**Biện pháp kiểm soát khẩn cấp:** Buộc rút cho phép quản trị khôi phục người dùng trong trường hợp khẩn cấp.

### 8.3 Các đánh đổi trong thiết kế

APR bằng nhau giữ sự tập trung vào tác động, không phải vào việc tối ưu hóa APR.

Mint từ thiện theo từng hành động là nguyên tử nhưng đòi hỏi mọi hành động đều phải mint (đánh đổi về gas).

Việc bổ sung giai đoạn tập trung một phần quyền quyết định; timelock + bỏ phiếu DAO giúp giảm thiểu điều này.

AnnualGovernance giải quyết số dư của TheOffering và ExtendOliveBranch thông qua các cuộc bỏ phiếu cộng đồng minh bạch, có trách nhiệm trong mỗi chu kỳ.

---

## 9) Minh bạch và báo cáo

### 9.1 Sự kiện

- Deposit, Withdraw, Claim
- AutoClaimPreferenceChanged, AutoClaimExecutorChanged, MonthlyAutoClaimed
- CharityDistributed, CharityFundDistributed, TreasuryDistributed
- LockedAmountSet, CharityWalletUpdated
- PoolAdded, PoolShutdown, PoolRemoved
- PhaseAdded

### 9.2 Chế độ xem

**OBNStakingLens (lớp đọc phân tích chuẩn):**
- getGlobalStats, getPoolStats, getUserPoolView
- getPoolAPR, pendingCharityFor

**OBNStakingPools:**
- pendingRewards, pendingRewardsMultiple
- unlockedBalance, stakeElapsed, isGloballyStaked
- charityContributedByUserInPool, totalCharityContributedByUser

### 9.3 Báo cáo Proof-of-Contribution

Báo cáo Proof-of-Contribution nên trở thành một trong những lớp minh bạch quan trọng nhất của OBN.

Các bảng điều khiển trong tương lai có thể hiển thị:

- tổng lượng OBN đã đóng góp cho các tổ chức phi lợi nhuận
- tổng lượng OBN đã đóng góp theo pool
- tổng đóng góp OBN có thể quy cho từng người dùng
- lịch sử đóng góp trọn đời theo ví
- đóng góp của người dùng trên nhiều pool phi lợi nhuận
- các pool hàng đầu theo mức đóng góp
- số người stake đang hoạt động trên mỗi pool
- lượng OBN hiện đang stake trên mỗi pool
- phát thải từ thiện theo thời gian
- lượng tích lũy, lịch sử đốt và lịch sử tặng của TheOffering theo chu kỳ
- lượng tích lũy và lịch sử phân phối cho tổ chức phi lợi nhuận của ExtendOliveBranch theo chu kỳ
- kết quả bỏ phiếu của AnnualGovernance theo chu kỳ

Các báo cáo này sẽ giúp người dùng hiểu không chỉ những gì họ đã kiếm được, mà cả những gì sự tham gia của họ đã giúp tạo ra.

### 9.4 Công bố thông tin

OBN nên công bố các báo cáo công khai định kỳ bao gồm:

- Số dư của Quỹ dự trữ hạt giống phi lợi nhuận, các khoản triển khai hạt giống và khoản dự trữ giao thức riêng biệt
- các đợt bootstrap đã thực hiện
- trạng thái của pool phi lợi nhuận
- việc thêm, xóa hoặc di chuyển pool
- các khoản phân phối từ thiện trực tiếp
- số dư, lượng tích lũy và việc sử dụng của TheOffering và ExtendOliveBranch theo chu kỳ
- các chỉ số Proof-of-Contribution

---

## 10) Hành trình người dùng

1. **Sở hữu OBN** — Người dùng có được OBN thông qua các nguồn thanh khoản sẵn có.
2. **Chọn pool phi lợi nhuận theo mục tiêu** — APR bằng nhau giữa các pool tại một thời điểm, nên người dùng chọn dựa trên sứ mệnh thay vì chênh lệch lợi suất.
3. **Stake** — Người dùng stake bằng `deposit`, stake cho địa chỉ khác bằng `depositFor` hoặc dùng Permit khi được hỗ trợ.
4. **Kiếm phần thưởng** — Người dùng nhận phần phát thải dành cho người stake.
5. **Tạo ra đóng góp** — Tổ chức phi lợi nhuận được chọn nhận phần do giao thức xác định khi người dùng tương tác với pool.
6. **Xây dựng Proof-of-Contribution** — Đóng góp của người dùng có thể được theo dõi trên các pool và theo thời gian.
7. **Rút vốn gốc chưa bị khóa bất cứ lúc nào** — Khóa bootstrap không áp dụng cho các khoản stake thông thường của người dùng.
8. **Bỏ phiếu về TheOffering** — Trước khi chu kỳ bắt đầu, hãy đăng ký một OliveNFT trong OliveAssembly và stake ít nhất 1 OBN. Các ví đủ điều kiện bỏ phiếu trong Giai đoạn 1 về việc khoản phân bổ cố định của TheOffering sẽ bị đốt hay được gửi đến ExtendOliveBranch.
9. **Bỏ phiếu về ExtendOliveBranch** — Sau đó, chính các ví đủ điều kiện đó bỏ phiếu chọn tổ chức phi lợi nhuận đã được phê duyệt sẽ nhận khoản phân bổ cố định theo chu kỳ của ExtendOliveBranch.

OBN được thiết kế để người dùng không cần lựa chọn giữa kiếm lợi nhuận và đóng góp. Cả hai đều diễn ra thông qua cùng một hành động trên giao thức.

---

## 11) Nguồn cung và phân phối token

**Nguồn cung ban đầu:** 1,000,000,000 OBN.

**Phân phối genesis trong lịch sử (khi initialize; không phải số dư dự trữ hiện tại):**

- 40% Thanh khoản
- 30% Airdrop
- 10% phân bổ từ thiện ban đầu
- 10% Ngân quỹ
- 10% Đội ngũ (vào TeamVesting; cliff ~4 tháng, vesting tuyến tính ~20 tháng)

Quỹ dự trữ hạt giống phi lợi nhuận có tổng phân bổ là **300M OBN**, với **50M OBN** được giữ riêng cho nhu cầu của giao thức. Các khoản nắm giữ của ngân quỹ và airdrop đã được hợp nhất vào khoản phân bổ hạt giống. Tại thời điểm đó, 11M OBN đã tài trợ cho 11 hạt giống phi lợi nhuận, còn lại 289M OBN cho 289 hạt giống bổ sung với mức 1M OBN mỗi hạt giống.

**Phát hành liên tục:** Chỉ thông qua phát thải staking; hợp đồng staking là minter duy nhất.

**Tỷ lệ chia phần thưởng trên phát thải:**

- 88% người stake
- 10% pool phi lợi nhuận được chọn
- 1% ExtendOliveBranch (phân phối hằng năm cho tổ chức phi lợi nhuận)
- 1% TheOffering (bỏ phiếu hằng năm về việc đốt hoặc tặng)

**Đốt tự nguyện:** Khả dụng thông qua burn cho các cơ chế hấp thụ trong tương lai.

---

## 12) Lộ trình (mang tính định hướng)

### 12.1 Nảy mầm

- Hình thành khái niệm giao thức cơ sở
- Xây dựng và kiểm thử các hợp đồng thông minh
- Triển khai OBNToken và OBNStakingPools lên Base
- Ra mắt frontend ban đầu
- Khởi tạo thanh khoản
- Tổ chức các chiến dịch airdrop sớm
- Tích hợp Farcaster và các luồng người dùng gốc của Base
- Bắt đầu lập chỉ mục công khai các ví của tổ chức phi lợi nhuận
- Thiết lập câu chuyện Proof-of-Contribution ban đầu

### 12.2 Sinh trưởng

- Triển khai tính năng theo dõi đóng góp mở rộng trong frontend
- Xây dựng các bảng điều khiển Proof-of-Contribution
- Cải thiện các trang báo cáo về tổ chức phi lợi nhuận
- Vận hành các chu kỳ hằng năm bằng AnnualGovernanceV2 và OliveAssembly đã triển khai, với việc đăng ký, bỏ phiếu của cộng đồng và tất toán không cần cấp phép
- Sản xuất nội dung giáo dục
- Tiếp nhận thêm các tổ chức phi lợi nhuận
- Tìm kiếm các quan hệ đối tác
- Tuyển dụng những người đóng góp thiết yếu khi có thể
- Thực hiện kiểm toán bảo mật của bên thứ ba
- Hoàn tất công việc pháp lý và quản trị
- Xây dựng và kiểm thử backend/frontend của DAO

### 12.3 Nở hoa

- Triển khai DAO và chuyển giao quản trị cho cộng đồng
- Chuyển giao thẩm quyền nâng cấp thông qua quản trị timelock
- Chuyển voteAdmin của AnnualGovernance sang địa chỉ do DAO kiểm soát khi quản trị trưởng thành
- Duy trì mạng lưới phi lợi nhuận
- Cập nhật frontend với các tính năng DAO
- Mở rộng các công cụ báo cáo và uy tín đóng góp
- Duy trì và điều chỉnh giao thức khi nhu cầu về lợi ích công thay đổi

---

## 13) Phụ lục — Các hàm chính

### OBNStakingPools

**Thao tác thay đổi của người dùng:**

- `deposit(pid, amount)`
- `depositFor(pid, amount, beneficiary)`
- `depositWithPermit(pid, amount, beneficiary, deadline, v, r, s)`
- `depositForWithLock(pid, amount, beneficiary)` (chỉ charityFund)
- `charityFundBootstrap(pid, amount, beneficiary)` (chỉ charityFund)
- `withdraw(pid, amount)`
- `claim(pid)`
- `claimMultiple(pids[])`
- `setAutoClaimEnabled(bool)` — Chỉ ví gọi hàm

**Thực thi được ủy quyền:**

- `autoClaimFor(uint256[] pids, address user, uint256 month, uint256 consentNonce)` — Chỉ bên thực thi; yêu cầu sự đồng ý và tháng hiện tại; 1–32 ID pool tăng dần nghiêm ngặt

**Thao tác thay đổi của quản trị viên:**

- `claimFor(pid, user)` (chỉ chủ sở hữu; độc lập với sự đồng ý autoclaim)
- `setAutoClaimExecutor(executor)` (chỉ chủ sở hữu; giá trị không sẽ tạm dừng tự động hóa)
- `initializeV931(executor)` (chỉ chủ sở hữu, reinitializer một lần trong quá trình nâng cấp)
- `addPool(charityWallet)`
- `shutdownPool(pid)`
- `removePool(pid)`
- `addPhase(start, end, bps)`
- `updateCharityWallet(pid, newWallet)`
- `migrateBootstrap(pid, oldNonprofit, newNonprofit)`
- `forceExitUserToSelf(pid, user, claimRewards)`
- `setLockedAmount(pid, user, amount)` (chỉ charityFund)
- `setVersion(newVersion)` (chỉ chủ sở hữu)
- `upgradeTo(newImplementation, data)` (chỉ chủ sở hữu, tương thích với quản trị)

**Chế độ xem:**

- `pendingRewards(pid, user)` — Lượng đang chờ GỘP (gross)
- `pendingRewardsMultiple(pids[], user)` — Lượng đang chờ của nhiều pool cùng tổng số
- `autoClaimExecutor()` — Tài khoản thông minh tự động hóa được ủy quyền
- `autoClaimPreference(user)` — Sự đồng ý và nonce của sự đồng ý
- `currentAutoClaimMonth()` — Năm UTC × 12 + tháng (tháng 1 = 1)
- `lastAutoClaimMonth(pid, user)` — Tháng tự động nhận thưởng thành công gần nhất
- `unlockedBalance(pid, user)` — Lượng có thể rút
- `stakeElapsed(user)` — Tổng số giây đã stake
- `poolLength()` — Số lượng pool
- `charityContributedByUserInPool(pid, user)` — Đóng góp từ thiện của người dùng trong một pool
- `totalCharityContributedByUser(user)` — Tổng đóng góp từ thiện của người dùng trên tất cả các pool

Các chế độ xem hiển thị và phân tích như `getGlobalStats`, `getPoolStats`, `getUserPoolView`, `getUserStats` và `getPoolAPR` được cung cấp qua **OBNStakingLens** như lớp đọc chuẩn cho frontend.

### OBNToken

**Thao tác thay đổi:**

- `setMinterOnce(minter)` (chỉ chủ sở hữu, một lần)
- `mint(to, amount)` (chỉ minter)
- ERC20 tiêu chuẩn: `transfer`, `approve`, `transferFrom`
- Hỗ trợ `permitAndCall` (EIP-2612)
- `burn(amount)` — Đốt tự nguyện
- `delegate(delegatee)` — Ủy quyền phiếu bầu (ERC20Votes)

**Chế độ xem:**

- ERC20 tiêu chuẩn: `balanceOf`, `allowance`, `totalSupply`
- ERC20Votes: `getVotes`, `getPastVotes`, `checkpoints`
- EIP-2612: `nonces`

### TeamVesting

**Thao tác thay đổi:**

- `release()` — Giải phóng token đã vesting đến teamWallet
- `updateTeamWallet(newWallet)` (chỉ chủ sở hữu)
- `rescueERC20(token, amount)` (chỉ chủ sở hữu, không bao gồm token đang vesting)

**Chế độ xem:**

- `vestedAmount(timestamp)` — Tổng lượng đã vesting tại một thời điểm
- `claimableNow()` — Lượng hiện có thể nhận
- `timeUntilCliff()` — Đếm ngược đến cliff
- `timeUntilNextRelease()` — Đếm ngược đến lần giải phóng tiếp theo
- `nextReleaseTimestamp()` — Thời điểm giải phóng tiếp theo

### TheOffering

**Thao tác thay đổi của quản trị:**

- `burn(amount)` (chỉ governance) — Đốt khoản phân bổ cố định của chu kỳ sau phiếu BURN
- `sendToExtend(amount)` (chỉ governance) — Gửi khoản phân bổ cố định của chu kỳ đến ExtendOliveBranch sau phiếu GIVE

**Thao tác thay đổi của quản trị viên:**

- `setGovernance(newGovernance)` (chỉ timelockOwner) — Kết nối hoặc cập nhật địa chỉ quản trị; `address(0)` sẽ tạm dừng nó
- `emergencySweep(token, to)` (chỉ timelockOwner)

### ExtendOliveBranch

**Thao tác phân phối:**

- `distribute(nonprofit, amount)` (timelockOwner hoặc governance) — Có thực thi danh sách trắng
- `distributeFromGovernance(nonprofit, amount)` (chỉ governance) — Cố ý bỏ qua kiểm tra danh sách trắng; người nhận đã được xác thực và cố định khi lô lá phiếu của họ được chuẩn bị

**Thao tác thay đổi của quản trị viên:**

- `setApprovedNonprofit(nonprofit, approved)` (chỉ timelockOwner) — Quản lý danh sách trắng phân phối
- `setGovernance(newGovernance)` (chỉ timelockOwner)
- `emergencySweep(token, to)` (chỉ timelockOwner)

**Chế độ xem:**

- `approvedNonprofit(nonprofit)` — Trạng thái danh sách trắng

### AnnualGovernance

**Thao tác thay đổi của quản trị viên bỏ phiếu:**

- `startAnnualCycle(phase1Duration, phase2Duration)` (chỉ voteAdmin) — Yêu cầu cả hai khoảng thời gian bằng 2,592,000 giây (30 ngày); chụp snapshot điều kiện tham gia, lượng stake và phân bổ quỹ, cố định ranh giới số lượng pool và chuẩn bị lô lá phiếu đầu tiên

**Thao tác thay đổi của người dùng:**

- `castOfferingVote(cycleId, burn)` — Phiếu Giai đoạn 1
- `castNonprofitVote(cycleId, nonprofit)` — Phiếu Giai đoạn 2

**Thực thi không cần cấp phép:**

- `prepareBallot(cycleId, maxPools)` xử lý từ 1 đến 100 ID pool mỗi lần gọi trong Giai đoạn 1
- `executePhase1(cycleId)` / `executePhase2(cycleId)`
- `executeCurrentCycle()` — Tiếp tục chuẩn bị lá phiếu chưa hoàn tất hoặc tất toán giai đoạn đã sẵn sàng; bất kỳ ai cũng có thể gọi

**Quản trị của chủ sở hữu (Timelock):**

- `cancelCycle(cycleId)` — Chỉ trước khi Giai đoạn 1 được thực thi
- `setVoteAdmin(newAdmin)`
- `setMaxBallotSize(newMax)` (thiết lập tương thích cũ; không giới hạn thành viên lá phiếu của V2)

**Chế độ xem:**

- `currentCycleId()` / `getCycleState(cycleId)` / `getCycleSummary(cycleId)`
- `getBallot(cycleId)` / `getBallotPage(cycleId, offset, limit)` / `getNonprofitVotes(cycleId, nonprofit)`
- `getCyclePreparation(cycleId)` báo cáo tiến độ và sự hoàn tất của việc chuẩn bị
- `getCycleFundSnapshot(cycleId)` / `getPhase2Allocation(cycleId)` báo cáo các khoản phân bổ tiền tệ cố định
- `getCurrentVoterInfo(user)` báo cáo điều kiện tham gia hiện tại, khác với snapshot của một chu kỳ hiện có
- `getCycleParticipation(cycleId)` / `getPhase2Result(cycleId)` báo cáo mức độ tham gia và kết quả tất toán đã xác nhận
- `hasVotedPhase1(cycleId, voter)` / `hasVotedPhase2(cycleId, voter)`
- `getVotingPowerForCycle(cycleId, user)` — Điều kiện NFT và quyền căn bậc hai theo từng chu kỳ; trả về quyền và trạng thái bootstrap checkpoint

### OliveAssembly

- `deposit(tokenId)` đăng ký một OliveNFT đã được phê duyệt cho mỗi ví, do Assembly lưu giữ
- `withdraw()` / `withdrawTo(recipient)` / `withdrawExpected(tokenId, recipient)` cho phép người gửi tự rút, không có thời gian khóa
- `registeredTokenId(user)` / `registeredCount()` báo cáo các đăng ký hiện tại; số lượng này không ngụ ý điều kiện staking
- `getPastRegistration(user, blockNumber)` / `getPastRegisteredCount(blockNumber)` báo cáo các snapshot đăng ký trong lịch sử

### OBNStakingLens

Lớp phân tích chỉ đọc; không giữ tiền. Tái tạo các chế độ xem hiển thị/phân tích đã bị loại bỏ khỏi StakingPoolsV93 — mọi lệnh gọi ghi vẫn nằm trên OBNStakingPools.

**Chế độ xem:**

- `getUserStats(user)` / `getUserPoolView(pid, user)`
- `pendingRewards(pid, user)` / `pendingRewardsMultiple(pids[], user)`
- `getPoolStats(pid)` / `pendingCharityFor(pid)` / `listPoolsBasic()`
- `getPoolAPR(pid)` / `getGlobalStats()` / `currentRewardsPerSecond()`
- `getVotingPower(user, snapshotBlock)` — Quyền staking có checkpoint ở dạng thô, không có điều kiện NFT hay trọng số căn bậc hai; hãy dùng `getVotingPowerForCycle` của AnnualGovernanceV2 cho bỏ phiếu hằng năm

**Quản trị:**

- `upgradeToAndCall(newImplementation, data)` (chỉ chủ sở hữu)

---

## 14) Lời kết

Nếu chúng ta đang thiết kế hạ tầng tài chính cho các thế hệ tương lai, thì chúng ta nên sẵn sàng đặt ra một câu hỏi tốt hơn:

Liệu hạ tầng đó có thể giúp tạo ra một thế giới tốt đẹp hơn không?

Crypto đã mang lại cho chúng ta một điều chưa từng tồn tại: khả năng lập trình hành vi vào tiền. Một tài sản số không còn phải nằm yên. Nó có thể di chuyển theo quy tắc. Nó có thể thưởng theo quy tắc. Nó có thể định tuyến giá trị theo quy tắc. Nó có thể trở thành nhiều hơn một thứ để người ta mua, bán và đầu cơ.

Điều đó nên có ý nghĩa.

Olive Branch Network được xây dựng từ niềm tin rằng tiền có thể lập trình không nên thờ ơ. Nếu chúng ta có thể thiết kế token để thưởng cho thanh khoản, bảo mật mạng lưới, tài trợ ngân quỹ và vận hành quản trị, thì chúng ta cũng có thể thiết kế chúng để hỗ trợ các tổ chức đang làm điều tốt có thể xác minh được trên thế giới.

OBN là một nỗ lực nhằm chứng minh rằng sự đóng góp có thể được xây dựng trực tiếp vào chính tài sản.

Người dùng không cần hy sinh vốn gốc để tham gia. Họ không cần quyên góp riêng. Họ không cần lựa chọn giữa kiếm lợi nhuận và giúp đỡ. Khi người dùng stake, họ kiếm được phần thưởng. Khi họ nhận thưởng, các tổ chức phi lợi nhuận nhận được tài trợ. Khi mạng lưới phát triển, lớp đóng góp cũng phát triển theo.

Đó chính là Proof-of-Contribution.

Về cốt lõi, giao thức được cố ý thiết kế đơn giản: người dùng stake vào các pool phi lợi nhuận, phần thưởng được chia theo hợp đồng và một phần phát thải được chuyển đến các mục tiêu ngoài đời thực. Tỷ lệ chia phần thưởng được mã hóa cứng giữ cho hệ thống trung thực. ExtendOliveBranch cung cấp cho cộng đồng một cách định kỳ để hướng thêm nguồn tài trợ phi lợi nhuận. TheOffering mang đến cho người stake lựa chọn hằng năm giữa việc đốt nguồn cung hoặc mở rộng thêm giá trị đến các tổ chức phi lợi nhuận.

OBN không được xây dựng xoay quanh sự khai thác. Nó được xây dựng xoay quanh sự gắn kết.

Người dùng được thưởng khi tham gia. Các tổ chức phi lợi nhuận nhận được sự hỗ trợ liên tục. Quản trị quyết định cách giải quyết các dòng hằng năm của giao thức. Mọi hành động đều để lại một bản ghi on-chain minh bạch.

Đây không chỉ là một giao thức staking.

Đó là một động cơ đóng góp.

Đó là một lớp lợi ích công.

Đó là một nỗ lực nghiêm túc nhằm trả lời câu hỏi mà crypto đã né tránh quá lâu:

Nếu chúng ta có thể lập trình tiền để làm hầu như mọi thứ, tại sao không lập trình nó để làm điều tốt?

Mỗi lần stake trở thành một bằng chứng.

Mỗi lần nhận thưởng tạo ra một bản ghi.

Mỗi pool đại diện cho một mục tiêu.

Và mỗi năm, cộng đồng quyết định sẽ chìa cành ô liu xa đến đâu.

---

## Phụ lục B — Các hợp đồng đã triển khai (Base Mainnet)

Tài liệu tham khảo này mô tả hành vi staking V9.3.1 và bản nâng cấp AnnualGovernanceV2 được kích hoạt vào ngày 7 tháng 10 năm 2026 (khối Base 52283807). Bản sửa đổi quản trị không thay đổi phiên bản staking. Các giao dịch triển khai, việc kích hoạt proxy và kích hoạt dịch vụ được theo dõi trong [hồ sơ phát hành vận hành](governance-operations/2026-09-24-staking-v931-autoclaim-record.json).

Hãy dùng proxy staking để nạp, nhận thưởng, rút và thay đổi sự đồng ý. `MonthlyAutoClaimUpgradeable` được biên dịch vào bản triển khai V9.3.1 và không được triển khai riêng.

| Hợp đồng | Loại | Địa chỉ | BaseScan |
|----------|------|---------|----------|
| **OBNToken** | ERC20 (UUPS Proxy) | [0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) | [Verified ✅](https://basescan.org/address/0x07e5efCD1B5fAE3f461bf913BBEE03a10A20C685) |
| **OBNStakingPools** | Staking (UUPS Proxy) | [0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) | [Verified ✅](https://basescan.org/address/0x2C4Bd5B2a48a76f288d7F2DB23aFD3a03b9E7cD2) |
| **StakingPoolsV93 (v9.3 Impl)** | V9.3 implementation | [0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) | [Verified ✅](https://basescan.org/address/0x8ae630a14254Fd9632C505fbdeB7f104f0b9844E#code) |
| **StakingPoolsV931 (v9.3.1 Impl)** | V9.3.1 implementation | [0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) | [Verified](https://basescan.org/address/0x416dfFfDc4245a9f4C38f05d203AEcaC5E24908f#code) |
| **OBNStakingLens** | Analytics Read Layer (UUPS Proxy) | [0x2ae4df523040c0245a6F84342E4B06850c5bdb9b](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) | [Verified ✅](https://basescan.org/address/0x2ae4df523040c0245a6F84342E4B06850c5bdb9b) |
| **OBNTimeLock** | Timelock (non-upgradeable) | [0x86396526286769ace21982E798Df5eef2389f51c](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) | [Verified ✅](https://basescan.org/address/0x86396526286769ace21982E798Df5eef2389f51c) |
| **AnnualGovernance** | Governance (UUPS Proxy) | [0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) | [Verified ✅](https://basescan.org/address/0x1135d5fEA8098b09b4ED3AFbfFDc7B248359D270) |
| **AnnualGovernanceV2 implementation** | Biểu quyết căn bậc hai với NFT đã đăng ký và chuẩn bị lá phiếu theo lô; nâng cấp ngày 7 tháng 10 năm 2026. Hãy dùng proxy ở trên để tương tác. | [0x000a76f74b47498D6a9A593F9Cb7cfB71d975437](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437) | [Verified ✅](https://basescan.org/address/0x000a76f74b47498D6a9A593F9Cb7cfB71d975437#code) |
| **OliveAssembly** | Voter registration (UUPS Proxy) | [0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c) | [Verified ✅](https://basescan.org/address/0xE1ba5a8bC457E60FC2377B1837a40FF85da1578c#code) |
| **TheOffering** | Accumulator (non-upgradeable) | [0xc75B2a5C7B8F88327D44C223769cFa19cc93E341](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) | [Verified ✅](https://basescan.org/address/0xc75B2a5C7B8F88327D44C223769cFa19cc93E341) |
| **ExtendOliveBranch** | Accumulator (non-upgradeable) | [0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) | [Verified ✅](https://basescan.org/address/0xE1BbfAf0552ACC183579a3D172e002adF0c66d8B) |
| **TeamVesting** | Vesting (non-upgradeable) | [0x9428Edd912224778d84D762ebCDA52e1c829aB8d](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) | [Verified ✅](https://basescan.org/address/0x9428Edd912224778d84D762ebCDA52e1c829aB8d) |
| **OBN Impact NFT** | ERC-721 | [0xB66F67444b09f509D72d832567C2df84Edeb80F8](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) | [Verified ✅](https://basescan.org/address/0xB66F67444b09f509D72d832567C2df84Edeb80F8) |

**Mạng:** Base Mainnet (Chain ID: 8453)

**Lưu ý chính:**

- OBNToken và OBNStakingPools dùng mô hình proxy UUPS để nâng cấp do quản trị kiểm soát
- TeamVesting và OBNTimeLock theo thiết kế không thể nâng cấp
- TheOffering và ExtendOliveBranch theo thiết kế không thể nâng cấp
- Mọi hàm quản trị trên các proxy UUPS đều đi qua OBNTimeLock (độ trễ 24 giờ) thông qua OPERATOR_SAFE 2-of-3

---

**Phiên bản:** 9.3.1 Proof-of-Contribution / bản sửa đổi quản trị AnnualGovernanceV2

**Ngày:** 13 tháng 10 năm 2026

**Kho mã nguồn chuẩn:** [github.com/jdmaverick369/olive-branch-network](https://github.com/jdmaverick369/olive-branch-network)

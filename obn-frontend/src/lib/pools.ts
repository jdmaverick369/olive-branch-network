export type PoolCategory = "humanitarian" | "environment" | "animals";

export type PoolMeta = {
  pid: number;
  name: string;
  logo: string;               // path or URL
  ethereumAddress: string;
  listDescription: string;    // shown on /stake-earn-contribute
  detailDescription: string;  // shown on /stake-earn-contribute/[poolId]
  websiteUrl?: string;        // optional link to charity's website
  twitterUrl?: string;        // optional link to charity's Twitter
  verifyUrl?: string;         // ✅ nonprofit-hosted page that lists/validates this wallet
  live: boolean;
  onBaseApp?: boolean;        // ✅ indicates nonprofit is on BaseApp
  category: PoolCategory;
};

export const POOLS: PoolMeta[] = [
  {
    pid: 0,
    name: "Give Directly",
    logo: "/nonprofit-logos/GiveDirectly.png",
    ethereumAddress: "0x750EF1D7a0b4Ab1c97B7A623D7917CcEb5ea779C",
    listDescription:
      "Send money to people living in poverty, no strings attached.",
    detailDescription:
      "Send money to people living in poverty, no strings attached.",
    websiteUrl: "https://www.givedirectly.org/",
    twitterUrl: "https://x.com/givedirectly",
    verifyUrl: "https://www.givedirectly.org/crypto#eth-wallet",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 1,
    name: "Heifer International",
    logo: "/nonprofit-logos/HeiferInternational.png",
    ethereumAddress: "0xE04063602B8b6B5d3526e6af873d2A4777E12d92",
    listDescription:
      "Heifer International supports smallholder farmers to sustainably address hunger and poverty.",
    detailDescription:
      "Heifer International supports smallholder farmers to sustainably address hunger and poverty.",
    websiteUrl: "https://www.heifer.org/",
    twitterUrl: "https://x.com/Heifer",
    verifyUrl: "https://www.heifer.org/give/other-ways-to-give/digital-currency",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 2,
    name: "Last Door",
    logo: "/nonprofit-logos/LastDoor.png",
    ethereumAddress: "0xAB739D4F2B44F3f4ed8236070A8f97119eaEd4aB",
    listDescription:
      "Last Door provides addiction recovery services in a licensed accredited environment.",
    detailDescription:
      "Last Door provides addiction recovery services in a licensed accredited environment.",
    websiteUrl: "https://lastdoor.org/",
    twitterUrl: "https://x.com/last_door",
    verifyUrl: "https://lastdoor.org/donate/ethereum-donations/",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 3,
    name: "Freedom of Press",
    logo: "/nonprofit-logos/FreedomOfPress.png",
    ethereumAddress: "0x998F25Be40241CA5D8F5fCaF3591B5ED06EF3Be7",
    listDescription:
      "Defending and supporting public-interest journalism in the 21st century.",
    detailDescription:
      "Defending and supporting public-interest journalism in the 21st century.",
    websiteUrl: "https://freedom.press/",
    twitterUrl: "https://x.com/FreedomofPress",
    verifyUrl: "https://freedom.press/donate/cryptocurrency/",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 4,
    name: "Khan Academy",
    logo: "/nonprofit-logos/KhanAcademy.png",
    ethereumAddress: "0x891432Ab6414EFff5d986E14848eCD1e6b2961ae",
    listDescription:
      "Working to make a free, world-class education available for anyone, anywhere.",
    detailDescription:
      "Working to make a free, world-class education available for anyone, anywhere.",
    websiteUrl: "https://www.khanacademy.org/",
    twitterUrl: "https://x.com/khanacademy",
    verifyUrl: "https://drive.google.com/file/d/1rux_kf-lqK2c7D5kAb8kzDGzNEHvK4ZO/view",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 5,
    name: "Rainforest Foundation US",
    logo: "/nonprofit-logos/RainforestFoundationUS.png",
    ethereumAddress: "0x0A60e17d5c98D491809CD8A15370C53806EEc1ec",
    listDescription:
      "Protecting rainforests and our climate in partnership with Indigenous peoples since 1988.",
    detailDescription:
      "Protecting rainforests and our climate in partnership with Indigenous peoples since 1988.",
    websiteUrl: "https://rainforestfoundation.org/",
    twitterUrl: "https://x.com/RainforestUS",
    verifyUrl: "https://rainforestfoundation.org/give/cryptocurrency/",
    live: true,
    onBaseApp: true,
    category: "environment",
  },
  {
    pid: 6,
    name: "Tor Project",
    logo: "/nonprofit-logos/TorProject.png",
    ethereumAddress: "0x532Fb5D00f40ced99B16d1E295C77Cda2Eb1BB4F",
    listDescription:
      "We're a nonprofit defending privacy & freedom online.",
    detailDescription:
      "We're a nonprofit defending privacy & freedom online.",
    websiteUrl: "https://www.torproject.org/",
    twitterUrl: "https://x.com/torproject",
    verifyUrl: "https://donate.torproject.org/cryptocurrency/",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 7,
    name: "St. Jude Children's Research Hospital",
    logo: "/nonprofit-logos/StJudeChildrensResearchHospital.png",
    ethereumAddress: "0x92EE2370b56DC32794A6CD72585dC01d4288D314",
    listDescription:
      "Leading the way the world understands, treats and defeats childhood cancer.",
    detailDescription:
      "Leading the way the world understands, treats and defeats childhood cancer.",
    websiteUrl: "https://www.stjude.org/",
    twitterUrl: "https://x.com/StJude",
    verifyUrl: "https://www.stjude.org/donate/crypto.html#ae3ecd4c26dcd8922236410a4c276c00e507ac7d93efa5975098ea92907e3d9e=6",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 8,
    name: "charity: water",
    logo: "/nonprofit-logos/charitywater.png",
    ethereumAddress: "0x718A03C0b38889D57224B5A4eC853953f7B1Aa18",
    listDescription:
      "We believe in a world where everyone has clean water. 100% of your donation funds clean water.",
    detailDescription:
      "We believe in a world where everyone has clean water. 100% of your donation funds clean water.",
    websiteUrl: "https://www.charitywater.org/",
    twitterUrl: "https://x.com/charitywater",
    verifyUrl: "https://www.charitywater.org/crypto#",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 9,
    name: "Internet Archive",
    logo: "/nonprofit-logos/InternetArchive.png",
    ethereumAddress: "0xa23fa5a73C6366f6a829aC1F452A24eFdc5EcFF7",
    listDescription:
      "Internet Archive is a non-profit research library preserving web pages, books, movies & audio for public access.",
    detailDescription:
      "Internet Archive is a non-profit research library preserving web pages, books, movies & audio for public access.",
    websiteUrl: "https://archive.org/",
    twitterUrl: "https://x.com/internetarchive",
    verifyUrl: "https://archive.org/donate/cryptocurrency/",
    live: true,
    category: "humanitarian",
  },
  {
    pid: 10,
    name: "K9 Rescue International",
    logo: "/nonprofit-logos/K9RescueInternational.png",
    ethereumAddress: "0x859D4d3096928048dE53cF256A640aBd428f9bC9",
    listDescription:
      "Turning compassion into action for stray dogs and cats worldwide.",
    detailDescription:
      "Reducing stray dog suffering with spay/neuter, food, medical & frontline aid in regions without animal welfare",
    websiteUrl: "https://k9-rescue.org",
    twitterUrl: "https://x.com/k9_rescue",
    live: true,
    category: "animals",
  },
];

const byPid = new Map(POOLS.map((p) => [p.pid, p]));
export function getPoolMeta(pid: number) {
  return byPid.get(pid);
}

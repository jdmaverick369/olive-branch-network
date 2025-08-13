export type PoolMeta = {
  pid: number;
  name: string;
  logo: string;               // path or URL
  ethereumAddress: string;
  listDescription: string;    // shown on /dashboard
  detailDescription: string;  // shown on /dashboard/[poolId]
  websiteUrl?: string;        // optional link to charity's website
  twitterUrl?: string;        // optional link to charity's Twitter
  live: boolean;
};

export const POOLS: PoolMeta[] = [
  {
    pid: 0,
    name: "Give Directly",
    logo: "/GiveDirectly.png",
    ethereumAddress: "0x750EF1D7a0b4Ab1c97B7A623D7917CcEb5ea779C",
    listDescription:
      "Send money to people living in poverty, no strings attached. In Bangladesh, DRC, Kenya, Liberia, Malawi, Mozambique, Morocco, Rwanda, Uganda, & U.S. currently.",
    detailDescription:
      "Send money to people living in poverty, no strings attached. In Bangladesh, DRC, Kenya, Liberia, Malawi, Mozambique, Morocco, Rwanda, Uganda, & U.S. currently.",
    websiteUrl: "https://www.givedirectly.org/",
    twitterUrl: "https://twitter.com/givedirectly",
    live: true,
  },
  {
    pid: 1,
    name: "Heifer International",
    logo: "/HeiferInternational.png",
    ethereumAddress: "0xE04063602B8b6B5d3526e6af873d2A4777E12d92",
    listDescription:
      "Since 1944, we have helped more than 52 million families lift themselves out of hunger and poverty by providing livestock, training, tools and education.",
    detailDescription:
      "Since 1944, we have helped more than 52 million families lift themselves out of hunger and poverty by providing livestock, training, tools and education.",
    websiteUrl: "https://www.heifer.org/",
    twitterUrl: "https://twitter.com/Heifer",
    live: true,
  },
  {
    pid: 2,
    name: "Last Door",
    logo: "/LastDoor.png",
    ethereumAddress: "0xAB739D4F2B44F3f4ed8236070A8f97119eaEd4aB",
    listDescription:
      "Long Term Addiction Treatment Centre for youth and adult males 14 years of age and over. Drugs, Alcohol, Gambling, Nicotine & Gaming addictions - Since 1984.",
    detailDescription:
      "Long Term Addiction Treatment Centre for youth and adult males 14 years of age and over. Drugs, Alcohol, Gambling, Nicotine & Gaming addictions - Since 1984.",
    websiteUrl: "https://lastdoor.org/",
    twitterUrl: "https://x.com/last_door",
    live: true,
  },
  {
    pid: 3,
    name: "Freedom of Press",
    logo: "/FreedomOfPress.png",
    ethereumAddress: "0x998F25Be40241CA5D8F5fCaF3591B5ED06EF3Be7",
    listDescription:
      "Defending and supporting public-interest journalism in the 21st century.",
    detailDescription:
      "Defending and supporting public-interest journalism in the 21st century.",
    websiteUrl: "https://freedom.press/",
    twitterUrl: "https://x.com/FreedomofPress",
    live: true,
  },
  {
    pid: 4,
    name: "Khan Academy",
    logo: "/KhanAcademy.png",
    ethereumAddress: "0x891432Ab6414EFff5d986E14848eCD1e6b2961ae",
    listDescription:
      "Working to make a free, world-class education available for anyone, anywhere.",
    detailDescription:
      "Working to make a free, world-class education available for anyone, anywhere.",
    websiteUrl: "https://www.khanacademy.org/",
    twitterUrl: "https://x.com/khanacademy",
    live: true,
  },
  {
    pid: 5,
    name: "Rainforest Foundation US",
    logo: "/RainforestFoundationUS.png",
    ethereumAddress: "0xE422729513e2dB165D2f017CEa761FC555CF220A",
    listDescription:
      "Protecting rainforests and our climate in partnership with Indigenous peoples since 1988.",
    detailDescription:
      "Protecting rainforests and our climate in partnership with Indigenous peoples since 1988.",
    websiteUrl: "https://rainforestfoundation.org/",
    twitterUrl: "https://x.com/RainforestUS",
    live: true,
  },
  {
    pid: 6,
    name: "Tor Project",
    logo: "/TorProject.png",
    ethereumAddress: "0x532Fb5D00f40ced99B16d1E295C77Cda2Eb1BB4F",
    listDescription:
      "We're a nonprofit defending privacy & freedom online.",
    detailDescription:
      "We're a nonprofit defending privacy & freedom online.",
    websiteUrl: "https://www.torproject.org/",
    twitterUrl: "https://x.com/torproject",
    live: true,
  },
  {
    pid: 7,
    name: "St. Jude Children's Research Hospital",
    logo: "/StJudeChildrensResearchHospital.png",
    ethereumAddress: "0x92EE2370b56DC32794A6CD72585dC01d4288D314",
    listDescription:
      "St. Jude Children's Research Hospital is leading the way the world understands, treats and defeats childhood cancer.",
    detailDescription:
      "St. Jude Children's Research Hospital is leading the way the world understands, treats and defeats childhood cancer.",
    websiteUrl: "https://www.torproject.org/",
    twitterUrl: "https://x.com/torproject",
    live: true,
  },
  {
    pid: 8,
    name: "charity: water",
    logo: "/charitywater.png",
    ethereumAddress: "0x718A03C0b38889D57224B5A4eC853953f7B1Aa18",
    listDescription:
      "We believe in a world where everyone has clean water. 100% of your donation funds clean water.",
    detailDescription:
      "We believe in a world where everyone has clean water. 100% of your donation funds clean water.",
    websiteUrl: "https://www.charitywater.org/",
    twitterUrl: "https://x.com/charitywater",
    live: true,
  },
];

const byPid = new Map(POOLS.map((p) => [p.pid, p]));
export function getPoolMeta(pid: number) {
  return byPid.get(pid);
}

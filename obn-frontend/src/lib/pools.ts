export type PoolMeta = {
  pid: number;
  name: string;
  logo: string;               // path or URL
  listDescription: string;    // shown on /dashboard
  detailDescription: string;  // shown on /dashboard/[poolId]
  live: boolean;
};

export const POOLS: PoolMeta[] = [
  {
    pid: 0,
    name: "Olive Branch Network Treasury",
    logo: "/charity1.png",
    listDescription:
      "Stake OBN to support the Olive Branch Network treasury while we onboard charities.",
    detailDescription:
      "Until we onboard charities, stake OBN to support the Olive Branch Network treasury. 80% of rewards go to users, 20% to the treasury. Treasury funds will be used for growth and development. This pool will be removed once the first charity is onboarded.",
    live: true,
  },
  {
    pid: 1,
    name: "Example Charity Pool",
    logo: "/charity2.png",
    listDescription:
      "Preview pool. Final details will be announced when a charity is onboarded.",
    detailDescription:
      "This is a placeholder charity pool. Once live, rewards will split 80% to users, 15% to charity, and 5% to treasury.",
    live: true,
  },
];

const byPid = new Map(POOLS.map((p) => [p.pid, p]));
export function getPoolMeta(pid: number) {
  return byPid.get(pid);
}

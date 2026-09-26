export const ANALYTICS_METRICS = [
  { id: 'active-stakers', key: 'activeStakers', title: 'Active Stakers', description: 'Distinct wallets with positive stake across all pools' },
  { id: 'total-staked', key: 'totalStaked', title: 'Total Staked', description: 'Total OBN currently staked' },
  { id: 'total-contributed', key: 'totalContributed', title: 'Total Contributed', description: 'OBN paid to nonprofits, including claimed seed rewards, and the charity fund' },
] as const;

export interface AnalyticsSnapshot {
  schema: 1;
  chainId: 8453;
  contract: string;
  generatedAt: string;
  throughBlock: number;
  throughTimestamp: string;
  definitions: Record<string, string>;
  rows: { day: string; activeStakers: number; totalStaked: number; totalContributed: number }[];
}

export function isAnalyticsSnapshot(value: unknown): value is AnalyticsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const data = value as AnalyticsSnapshot;
  return data.schema === 1 && data.chainId === 8453 &&
    typeof data.contract === 'string' && data.contract.toLowerCase() === '0x2c4bd5b2a48a76f288d7f2db23afd3a03b9e7cd2' &&
    Number.isSafeInteger(data.throughBlock) && data.throughBlock > 0 &&
    Number.isFinite(Date.parse(data.generatedAt)) && Number.isFinite(Date.parse(data.throughTimestamp)) &&
    Date.parse(data.throughTimestamp) <= Date.parse(data.generatedAt) &&
    Array.isArray(data.rows) && data.rows.length > 0 && data.rows.every((row, i) =>
      row && /^\d{4}-\d{2}-\d{2}$/.test(row.day) && Number.isFinite(Date.parse(row.day)) &&
      (i === 0 || row.day > data.rows[i - 1].day) &&
      Number.isSafeInteger(row.activeStakers) && row.activeStakers >= 0 &&
      Number.isFinite(row.totalStaked) && row.totalStaked >= 0 &&
      Number.isFinite(row.totalContributed) && row.totalContributed >= 0 &&
      (i === 0 || row.totalContributed >= data.rows[i - 1].totalContributed)
    ) && data.rows.at(-1)?.day === data.throughTimestamp.slice(0, 10);
}

export async function fetchAnalytics(signal?: AbortSignal): Promise<AnalyticsSnapshot> {
  const response = await fetch('/api/analytics', { signal });
  if (!response.ok) throw new Error('Chart history is temporarily unavailable. Please check back soon.');
  const data: unknown = await response.json();
  if (!isAnalyticsSnapshot(data)) throw new Error('Chart history could not be read. Please check back soon.');
  return data;
}

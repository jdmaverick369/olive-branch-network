export interface DuneQuery {
  id: string;
  queryId: number;
  title: string;
  description: string;
}

export const DUNE_QUERIES: DuneQuery[] = [
  {
    id: "active-stakers",
    queryId: 5887886,
    title: "Active Stakers",
    description: "Number of active users staking OBN tokens",
  },
  {
    id: "total-staked",
    queryId: 6172584,
    title: "Total Staked",
    description: "Total amount of OBN tokens currently staked",
  },
  {
    id: "total-contributed",
    queryId: 6798005,
    title: "Total Contributed",
    description: "Cumulative OBN contributed to nonprofits over time",
  },
];

export async function fetchDuneQuery(queryId: number) {
  try {
    const response = await fetch(`/api/dune?queryId=${queryId}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching Dune query ${queryId}:`, error);
    throw error;
  }
}

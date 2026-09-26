// Preserve old client URLs while deployments and browser caches roll forward.
import { NextRequest, NextResponse } from 'next/server';
import { GET as getAnalytics } from '@/app/api/analytics/route';
import { AnalyticsSnapshot } from '@/lib/analytics';

const legacyMetrics = new Map<string, 'activeStakers' | 'totalStaked' | 'totalContributed'>([
  ['5887886', 'activeStakers'], ['6172584', 'totalStaked'], ['6798005', 'totalContributed'],
]);

export async function GET(request: NextRequest) {
  const key = legacyMetrics.get(request.nextUrl.searchParams.get('queryId') || '');
  if (!key) return NextResponse.json({ error: 'Unsupported queryId parameter' }, { status: 400 });
  const response = await getAnalytics();
  if (!response.ok) return response;
  const data: AnalyticsSnapshot = await response.json();
  return NextResponse.json({ result: { rows: data.rows.map(row => ({ day: row.day, value: row[key] })) } }, {
    headers: response.headers,
  });
}

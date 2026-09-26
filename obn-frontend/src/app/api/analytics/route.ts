import { NextResponse } from 'next/server';
import { isAnalyticsSnapshot } from '@/lib/analytics';
import bundledSnapshot from '@/data/analytics.json';

export async function GET() {
  if (isAnalyticsSnapshot(bundledSnapshot)) return NextResponse.json(bundledSnapshot, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600' },
  });
  return NextResponse.json({ error: 'Analytics history is being prepared' }, {
    status: 503, headers: { 'Cache-Control': 'no-store' },
  });
}

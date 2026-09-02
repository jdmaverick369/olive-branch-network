import { NextRequest, NextResponse } from "next/server";
import { DuneClient } from "@duneanalytics/client-sdk";
import { DUNE_QUERIES } from "@/lib/dune";

const DUNE_API_KEY = process.env.DUNE_API_KEY;
const ALLOWED_QUERY_IDS = new Set(DUNE_QUERIES.map(({ queryId }) => queryId));

export async function GET(request: NextRequest) {
  const queryId = request.nextUrl.searchParams.get("queryId");

  const parsedQueryId = Number(queryId);
  if (!queryId || !Number.isInteger(parsedQueryId) || !ALLOWED_QUERY_IDS.has(parsedQueryId)) {
    return NextResponse.json(
      { error: "Unsupported queryId parameter" },
      { status: 400 }
    );
  }

  if (!DUNE_API_KEY) {
    console.error("DUNE_API_KEY environment variable is not configured");
    return NextResponse.json(
      {
        error: "Dune API key not configured",
        message: "Please set the DUNE_API_KEY environment variable"
      },
      { status: 500 }
    );
  }

  try {
    const dune = new DuneClient(DUNE_API_KEY);
    const result = await dune.getLatestResult({ queryId: parsedQueryId });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" },
    });
  } catch {
    console.error(`Error fetching configured Dune query ${parsedQueryId}`);
    return NextResponse.json(
      { error: "Failed to fetch analytics data" },
      { status: 502 }
    );
  }
}

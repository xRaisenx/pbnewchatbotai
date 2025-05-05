import { redisClient } from '@/lib/redis'; // Assuming '@/lib/redis' is resolved
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { eventType, details } = body as { eventType: string; details?: Record<string, unknown> | undefined };

    if (!eventType) {
      return NextResponse.json({ error: 'Missing eventType' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const eventKey = `analytics:${eventType}`;
    const dailyEventKey = `analytics:${eventType}:${timestamp.substring(0, 10)}`; // YYYY-MM-DD

    // Increment total counter
    await redisClient.incr(eventKey);

    // Increment daily counter and set expiry (e.g., 7 days)
    await redisClient.incr(dailyEventKey);
    await redisClient.expire(dailyEventKey, 7 * 24 * 60 * 60); // Expire after 7 days

    console.log(`Tracked event: ${eventType}`, details);

    // Optional: Store details in a list or hash if needed for more granular analysis
    // await redisClient.rPush(`${eventKey}:details`, JSON.stringify({ timestamp, details }));

    return NextResponse.json({ success: true, eventType, timestamp });
  } catch (error) {
    console.error('Analytics Track API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to track event: ${errorMessage}` }, { status: 500 });
  }
}
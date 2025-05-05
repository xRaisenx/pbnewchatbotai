// app/api/admin/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { redisClient } from '@/lib/redis'; // Assuming '@/lib/redis' is resolved

export async function POST(req: NextRequest) {
  try {
    // TODO: Implement authentication/authorization check for admin access

    const settings = await req.json();

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json({ error: 'Invalid settings provided' }, { status: 400 });
    }

    // Store settings in Redis (e.g., as a JSON string under a specific key)
    const settingsKey = 'admin:settings';
    await redisClient.set(settingsKey, JSON.stringify(settings));

    console.log('Admin settings saved:', settings);

    return NextResponse.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Admin Settings API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to save settings: ${errorMessage}` }, { status: 500 });
  }
}

// Optional: Add a GET function to fetch settings
export async function GET() {
  try {
    // TODO: Implement authentication/authorization check for admin access

    const settingsKey = 'admin:settings';
    const settings = await redisClient.get(settingsKey);

    if (settings) {
      return NextResponse.json(JSON.parse(settings));
    } else {
      return NextResponse.json({}); // Return empty object if no settings found
    }
  } catch (error) {
    console.error('Admin Settings API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to fetch settings: ${errorMessage}` }, { status: 500 });
  }
}

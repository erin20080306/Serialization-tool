import { NextRequest, NextResponse } from 'next/server';
import { generateAppsScript } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { prompt, context } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const result = await generateAppsScript(prompt, context);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Generate appsscript error:', error);
    return NextResponse.json({ error: 'Failed to generate Apps Script' }, { status: 500 });
  }
}

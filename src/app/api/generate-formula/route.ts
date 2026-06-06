import { NextRequest, NextResponse } from 'next/server';
import { generateFormula } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { prompt, columns, platform } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const result = await generateFormula(prompt, columns, platform);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Generate formula error:', error);
    return NextResponse.json({ error: 'Failed to generate formula' }, { status: 500 });
  }
}

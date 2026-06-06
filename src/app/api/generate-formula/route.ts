import { NextRequest, NextResponse } from 'next/server';
import { generateFormula } from '@/lib/openai';
import { resolveModel } from '@/lib/models';
import { requireCredits } from '@/lib/credits';

export async function POST(req: NextRequest) {
  try {
    const { prompt, columns, platform, model } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const { response, balance, unlimited } = await requireCredits();
    if (response) return response;

    const result = await generateFormula(prompt, columns, platform, resolveModel(model));

    return NextResponse.json({ ...result, balance: unlimited ? null : balance });
  } catch (error) {
    console.error('Generate formula error:', error);
    return NextResponse.json({ error: 'Failed to generate formula' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { generateAppsScript } from '@/lib/openai';
import { resolveModel } from '@/lib/models';
import { requireCredits } from '@/lib/credits';

export async function POST(req: NextRequest) {
  try {
    const { prompt, context, model } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const { response, balance, unlimited } = await requireCredits();
    if (response) return response;

    const result = await generateAppsScript(prompt, context, resolveModel(model));

    return NextResponse.json({ ...result, balance: unlimited ? null : balance });
  } catch (error) {
    console.error('Generate appsscript error:', error);
    return NextResponse.json({ error: 'Failed to generate Apps Script' }, { status: 500 });
  }
}

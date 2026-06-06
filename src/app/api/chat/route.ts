import { NextRequest, NextResponse } from 'next/server';
import { analyzeData } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { question, columns, rows } = await req.json();

    if (!question || !columns || !rows) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const answer = await analyzeData(columns, rows, question);

    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: 'Failed to process chat request' }, { status: 500 });
  }
}

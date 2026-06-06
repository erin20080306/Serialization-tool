import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

// GET /api/analyses - 取得使用者的分析紀錄
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json([], { status: 200 });
    }

    const { data, error } = await supabase
      .from('analyses')
      .select('*, projects!inner(user_id)')
      .eq('projects.user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Get analyses error:', error);
    return NextResponse.json([], { status: 200 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getProjects, createProject } from '@/lib/supabase';

// GET /api/projects - 取得使用者的所有專案
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json([], { status: 200 });
    }

    const projects = await getProjects(session.user.id);
    return NextResponse.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    // 資料庫未設定時回傳空陣列，避免前端崩潰
    return NextResponse.json([], { status: 200 });
  }
}

// POST /api/projects - 建立新專案
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await req.json();
    const project = await createProject({ user_id: session.user.id, name });
    return NextResponse.json(project);
  } catch (error) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

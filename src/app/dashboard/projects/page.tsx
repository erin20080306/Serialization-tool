'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, FileSpreadsheet, Database } from 'lucide-react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  created_at: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">專案列表</h2>
          <p className="text-slate-500 mt-1">管理您所有的資料分析專案。</p>
        </div>
        <Link href="/dashboard/upload">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> 建立新分析
          </Button>
        </Link>
      </div>

      {loading ? (
        <Card className="p-8 text-center text-slate-500">載入中...</Card>
      ) : projects.length > 0 ? (
        <Card className="divide-y divide-slate-100">
          {projects.map((project) => (
            <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
              <div className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-2 rounded text-green-700">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-900">{project.name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(project.created_at).toLocaleString('zh-TW')}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">查看</Button>
              </div>
            </Link>
          ))}
        </Card>
      ) : (
        <Card className="p-8 text-center border-dashed border-2 bg-slate-50/50">
          <Database className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">目前還沒有專案，點擊上方按鈕開始載入資料。</p>
        </Card>
      )}
    </div>
  );
}

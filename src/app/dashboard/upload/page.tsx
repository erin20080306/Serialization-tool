'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Link as LinkIcon, Loader2, FileSpreadsheet } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // Store data in sessionStorage for the analyze page
        sessionStorage.setItem('uploadedData', JSON.stringify(data));
        router.push('/dashboard/analyze');
      } else {
        alert('上傳失敗');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('上傳失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSheetsConnect = async () => {
    if (!sheetUrl) {
      alert('請輸入 Google Sheet URL');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/google-sheets/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl }),
      });

      if (response.ok) {
        const data = await response.json();
        sessionStorage.setItem('uploadedData', JSON.stringify(data));
        router.push('/dashboard/analyze');
      } else {
        alert('連接失敗');
      }
    } catch (error) {
      console.error('Connect error:', error);
      alert('連接失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">載入資料來源</h2>
        <p className="text-slate-500 mt-1">上傳檔案或連接雲端試算表以供 AI 分析。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload File */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 p-2 rounded-lg"><Upload className="w-5 h-5 text-blue-600"/></div>
            <h3 className="font-semibold text-lg">上傳檔案</h3>
          </div>
          <p className="text-sm text-slate-500 mb-6">支援 .xlsx, .xls, .csv 格式。</p>
          
          <div className="border-2 border-dashed border-slate-200 rounded-lg p-8 text-center hover:bg-slate-50 transition-colors">
            {loading ? (
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto mb-3" />
            ) : (
              <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-3" />
            )}
            <Input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              disabled={loading}
              className="max-w-xs mx-auto"
            />
            <p className="text-xs text-slate-500 mt-2">點擊選擇檔案</p>
          </div>
        </Card>

        {/* Connect Google Sheets */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-100 p-2 rounded-lg"><LinkIcon className="w-5 h-5 text-green-600"/></div>
            <h3 className="font-semibold text-lg">連接 Google Sheets</h3>
          </div>
          <p className="text-sm text-slate-500 mb-6">貼上共用連結，或登入以選擇檔案。</p>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Google Sheet URL</Label>
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button
              className="w-full gap-2 bg-[#0F9D58] hover:bg-[#0b8043]"
              onClick={handleGoogleSheetsConnect}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              連接並讀取資料
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

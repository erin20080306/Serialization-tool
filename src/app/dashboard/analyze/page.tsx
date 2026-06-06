'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Database, Bot, Send, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface Data {
  columns: string[];
  rows: any[][];
  sheetName?: string;
  fileName?: string;
  tableType?: string;
}

export default function AnalyzePage() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedData = sessionStorage.getItem('uploadedData');
    if (storedData) {
      setData(JSON.parse(storedData));
      setMessages([
        {
          role: 'assistant',
          text: `你好！我是你的資料分析助手。我已經看過這份包含 ${JSON.parse(storedData).rows.length} 筆紀錄的資料表了。這看起來像是一份「${JSON.parse(storedData).tableType || '資料表'}」。有什麼我可以幫忙的嗎？你可以問我：「哪些商品營業額最高？」或「幫我找出異常資料」。`,
        },
      ]);
    } else {
      router.push('/dashboard/upload');
    }
  }, [router]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || !data) return;

    const userMsg = input;
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userMsg,
          columns: data.columns,
          rows: data.rows.slice(0, 50), // Send first 50 rows for context
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setMessages((prev) => [...prev, { role: 'assistant', text: result.answer }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: '抱歉，我無法回答這個問題。請稍後再試。' },
        ]);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '發生錯誤，請稍後再試。' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
          <Database className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">尚未載入資料</h3>
        <p className="text-slate-500 text-center max-w-sm">
          你需要先載入資料來源才能使用 AI 資料分析功能。
        </p>
        <Button onClick={() => router.push('/dashboard/upload')} className="mt-4 gap-2">
          前往載入資料
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6">
      {/* Left: Data Preview */}
      <Card className="flex-1 flex flex-col overflow-hidden border-slate-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-500" />
            <h3 className="font-semibold text-sm">
              資料預覽 (來源：{data.fileName || data.sheetName})
            </h3>
          </div>
          <Badge variant="default">已解析 {data.rows.length} 筆</Badge>
        </div>
        <div className="flex-1 overflow-auto p-0">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 border-b border-slate-200 shadow-sm">
              <tr>
                {data.columns.map((col, idx) => (
                  <th key={idx} className="px-4 py-3 font-semibold">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/50">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2.5 text-slate-700">
                      {typeof cell === 'number' ? cell.toLocaleString() : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Right: AI Chat */}
      <Card className="w-full lg:w-[400px] flex flex-col overflow-hidden border-indigo-100 shadow-md">
        <div className="p-4 border-b border-slate-100 bg-indigo-50/50 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          <h3 className="font-semibold text-indigo-900">AI 資料助理</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                }`}
              >
                {msg.text.split('\n').map((line, i) => (
                  <div key={i} className="min-h-[1em]">
                    {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                      part.startsWith('**') && part.endsWith('**') ? (
                        <strong key={j} className="font-semibold">
                          {part.slice(2, -2)}
                        </strong>
                      ) : (
                        part
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-1.5">
                <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div>
                <div
                  className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.15s' }}
                ></div>
                <div
                  className="w-2 h-2 bg-slate-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.3s' }}
                ></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-slate-100 bg-white">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="問我關於資料的問題..."
              className="pr-12 resize-none min-h-[60px]"
            />
            <Button
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8 rounded-full"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {['哪些商品賣最好？', '幫我找出異常', '產生週報大綱'].map((suggestion) => (
              <Badge
                key={suggestion}
                variant="secondary"
                className="cursor-pointer whitespace-nowrap hover:bg-slate-200"
                onClick={() => setInput(suggestion)}
              >
                {suggestion}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

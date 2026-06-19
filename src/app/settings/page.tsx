'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Shield, Cpu, Coins, Check, Sparkles, Zap, Brain, Infinity as InfinityIcon } from 'lucide-react';
import Link from 'next/link';
import { doSignOut } from '@/lib/actions';
import { MODELS, type ModelConfig, type ModelId } from '@/lib/models';
import { getSelectedModel, setSelectedModel } from '@/lib/client-model';

interface PricingPlan {
  id: string;
  name: string;
  model: ModelId;
  priceLabel: string;
  price: number;
  credits: number;
  uses: number;
  highlight?: boolean;
  paymentUrl?: string;
}

interface CreditsResponse {
  email: string | null;
  unlimited: boolean;
  balance: number | null;
  costPerAction: number;
  freeCredits: number;
  plans: PricingPlan[];
}

const MODEL_ICON: Record<ModelId, typeof Zap> = {
  'gemini-2.5-flash': Zap,
  'gemini-2.5-pro': Brain,
  'gemini-flash-latest': Sparkles,
  'gpt-4o-mini': Zap,
  'gpt-4o': Brain,
  'gpt-5.5': Sparkles,
};

export default function SettingsPage() {
  const [selected, setSelected] = useState<ModelId>('gemini-2.5-flash');
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSelected(getSelectedModel());
    fetch('/api/credits')
      .then((res) => res.json())
      .then((data) => setCredits(data))
      .catch((err) => console.error('load credits error', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSelectModel = (model: ModelId) => {
    setSelected(model);
    setSelectedModel(model);
  };

  const flashPlans = credits?.plans.filter((p) => p.model === 'gemini-2.5-flash' && p.price > 0) ?? [];
  const proPlans = credits?.plans.filter((p) => p.model === 'gemini-2.5-pro') ?? [];
  const selectedCost = MODELS.find((m) => m.id === selected)?.costPerAction ?? 25;

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">設定</h2>
            <p className="text-slate-500 mt-1">管理 AI 模型、點數與方案。</p>
          </div>
        </div>

        {/* 點數狀態 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Coins className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-lg">我的點數</h3>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">載入中...</p>
          ) : credits?.unlimited ? (
            <div className="flex items-center gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <InfinityIcon className="w-8 h-8 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-800">無限使用（管理者帳號）</div>
                <div className="text-sm text-emerald-700">{credits.email} 免付費，不限次數。</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500">剩餘點數</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{credits?.balance ?? 0}</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500">目前模型每次消耗</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">{selectedCost} 點</div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs text-slate-500">約可使用</div>
                <div className="mt-1 text-2xl font-bold text-slate-900">
                  {Math.floor((credits?.balance ?? 0) / selectedCost)} 次
                </div>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-3">
            點數依模型計費：{MODELS.map((m) => `${m.label} ${m.costPerAction} 點`).join('、')}。
          </p>
        </Card>

        {/* 模型選擇 */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-lg">AI 模型</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MODELS.map((model: ModelConfig) => {
              const Icon = MODEL_ICON[model.id];
              const active = selected === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => handleSelectModel(model.id)}
                  className={`text-left rounded-xl border-2 p-4 transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-5 h-5 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          model.provider === 'openai'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {model.provider === 'openai' ? 'OpenAI' : 'Gemini'}
                      </span>
                    </div>
                    {active && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{model.label}</span>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                      {model.costPerAction} 點/次
                    </span>
                  </div>
                  <div className="text-xs text-indigo-600 mb-2">{model.tagline}</div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">速度 {model.speed}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">成本 {model.cost}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">推理 {model.reasoning}</span>
                  </div>
                  <ul className="space-y-1">
                    {model.goodFor.map((item) => (
                      <li key={item} className="text-xs text-slate-600 flex gap-1">
                        <Check className="w-3 h-3 mt-0.5 text-emerald-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-3">選擇會即時套用到分析、問答、公式與 Apps Script 產生。</p>
        </Card>

        {/* 方案 */}
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold text-lg">付費方案</h3>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-indigo-500" />
              <span className="font-medium text-slate-800">Gemini 2.5 Flash 方案</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {flashPlans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-purple-500" />
              <span className="font-medium text-slate-800">Gemini 2.5 Pro 方案</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {proPlans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          </div>

          <p className="text-xs text-slate-400">
            付費連結即將開放。管理者帳號 erin20080306@gmail.com 登入後免付費、無限使用。
          </p>
        </Card>

        {/* 帳戶安全 */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-lg">帳戶安全</h3>
          </div>
          <p className="text-sm text-slate-500">您透過 Google 帳戶登入，安全性由 Google 管理。</p>
          <form action={doSignOut}>
            <Button type="submit" variant="outline">登出帳戶</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: PricingPlan }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 flex flex-col">
      <div className="font-semibold text-slate-900">{plan.name}</div>
      <div className="text-2xl font-bold text-slate-900 mt-1">{plan.priceLabel}</div>
      <div className="text-xs text-slate-500 mt-1">
        {plan.credits.toLocaleString()} 點 · 約 {plan.uses.toLocaleString()} 次
      </div>
      <Button
        className="mt-4 w-full"
        variant="outline"
        disabled={!plan.paymentUrl}
        onClick={() => plan.paymentUrl && window.open(plan.paymentUrl, '_blank')}
      >
        {plan.paymentUrl ? '前往購買' : '即將開放'}
      </Button>
    </div>
  );
}

'use client';

import { ArrowUp, CalendarClock, Dumbbell, Gauge, Minus, TrendingUp } from 'lucide-react';
import { EXERCISE_RULES } from '@/lib/workout-rules';
import { recommendWorkout } from '@/lib/workout-recommendations';
import type { WorkoutRecord } from '@/lib/workout-recommendations';

type Props = {
  records: WorkoutRecord[];
  asOf: string;
};

const statusPresentation = {
  baseline: ['基準を確認', 'bg-slate-100 text-slate-700'],
  reassess: ['再開時に確認', 'bg-amber-100 text-amber-800'],
  recovery: ['回復を優先', 'bg-rose-100 text-rose-800'],
  repeat: ['重量を維持', 'bg-blue-100 text-blue-800'],
  'increase-reps': ['回数を伸ばす', 'bg-cyan-100 text-cyan-800'],
  'increase-load': ['重量アップ', 'bg-emerald-100 text-emerald-800'],
  transition: ['段階的に増量', 'bg-violet-100 text-violet-800'],
  'equipment-limit': ['器具の上限', 'bg-orange-100 text-orange-800'],
  'review-difficulty': ['難度を確認', 'bg-violet-100 text-violet-800'],
  'confirm-equipment': ['重量を確認', 'bg-amber-100 text-amber-800'],
  unsupported: ['ルール未設定', 'bg-slate-100 text-slate-700'],
  'invalid-history': ['記録を確認', 'bg-rose-100 text-rose-800'],
} as const;

const formatVolume = (value: number | null) => value === null ? '—' : `${Math.round(value).toLocaleString()} lb`;

export default function RecommendationPanel({ records, asOf }: Props) {
  const recommendations = EXERCISE_RULES.map(rule => recommendWorkout(rule.exercise, records, {
    asOf,
    pullupAddedLoadsLb: [0, 5, 10, 15, 20, 25, 30],
  })).sort((a, b) => {
    const aDate = a.lastProgressionDate ?? '';
    const bDate = b.lastProgressionDate ?? '';
    return bDate.localeCompare(aDate) || a.exercise.localeCompare(b.exercise, 'ja');
  });

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-600 p-2 text-white"><Dumbbell size={22} /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">次回メニュー</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              通常の記録は限界近くまで行った実績として評価します。回数は止める目標ではなく、増量判断の目安です。
              「軽く動くだけ」の記録は週間総量に含めますが、以下の提案は変更しません。
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {recommendations.map(item => {
          const [statusLabel, statusClass] = statusPresentation[item.status];
          return (
            <article key={item.exercise} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-bold text-slate-900">{item.exercise}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
              </div>

              {item.plan.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {item.plan.map((set, index) => (
                    <div key={`${set.loadLb}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                      <div className="flex items-center gap-2">
                        {set.role === 'main' ? <ArrowUp size={17} /> : <Minus size={17} />}
                        <span className="text-sm text-slate-300">{set.role === 'main' ? 'メイン' : '軽め'}</span>
                      </div>
                      <strong>{set.loadLb} lb × {set.reps[0]}〜{set.reps[1]}回 × {set.sets}セット</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">再開時に重量を確認します</div>
              )}

              <p className="mt-3 text-sm leading-6 text-slate-700">{item.reasons.at(-1)}</p>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-3">
                  <TrendingUp className="mx-auto mb-1 text-blue-600" size={17} />
                  <div className="text-xs text-slate-500">直近7日</div>
                  <div className="mt-1 text-sm font-semibold">{formatVolume(item.recent7.volumeLb)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <Gauge className="mx-auto mb-1 text-violet-600" size={17} />
                  <div className="text-xs text-slate-500">28日週平均</div>
                  <div className="mt-1 text-sm font-semibold">{formatVolume(item.weeklyAverageVolume28Lb)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <CalendarClock className="mx-auto mb-1 text-amber-600" size={17} />
                  <div className="text-xs text-slate-500">通常記録から</div>
                  <div className="mt-1 text-sm font-semibold">
                    {item.daysSinceLastProgression === null ? '記録なし' : `${item.daysSinceLastProgression}日`}
                  </div>
                </div>
              </div>

              {item.recent7.lightSessions > 0 && (
                <p className="mt-3 text-xs text-slate-500">直近7日に、提案へ反映しない軽い日が{item.recent7.lightSessions}回あります。</p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Calendar, TrendingUp, Dumbbell, BarChart3, RefreshCw, Minus, ClipboardList } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase';
import RecommendationPanel from '@/components/RecommendationPanel';
import { EXERCISE_RULES } from '@/lib/workout-rules';

// === 型定義 ==============================
type RawRecord = {
  id: string | number;
  date: string;
  weight: number;
  exercise: string;
  load: number;
  reps: number;
  sets: number;
  comment: string;
  recommendationMode: 'normal' | 'light';
};

type VolumeData = {
  id: string | number;
  date: string;
  weight: number;
  exercise: string;
  volume: number;
};

type SetForm = {
  load: string;
  reps: string;
  sets: string;
};

type FormData = {
  date: string;
  weight: string;
  exercise: string;
  comment: string;
  details: SetForm[];
  affectsRecommendation: boolean;
};

type EditFormData = {
  date: string;
  weight: string;
  exercise: string;
  load: string;
  reps: string;
  sets: string;
  comment: string;
  affectsRecommendation: boolean;
};

type DbRawRecord = {
  id: string | number;
  date: string;
  weight: number;
  exercise: string;
  load: number;
  reps: number;
  sets: number;
  comment: string | null;
  affects_recommendation?: boolean | null;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
};
// ========================================

const KG_TO_LB = 2.20462;
const LIGHT_SESSION_MARKER = '[[light-session]]';

const hasLightSessionMarker = (comment: string | null | undefined): boolean =>
  Boolean(comment?.startsWith(LIGHT_SESSION_MARKER));

const visibleComment = (comment: string | null | undefined): string =>
  hasLightSessionMarker(comment)
    ? (comment ?? '').slice(LIGHT_SESSION_MARKER.length).replace(/^\s+/, '')
    : comment || '';

const storedComment = (comment: string, affectsRecommendation: boolean): string =>
  affectsRecommendation ? comment : `${LIGHT_SESSION_MARKER}${comment ? ` ${comment}` : ''}`;

const toIso = (date: string): string => {
  const normalized = date.replace(/\./g, '-').replace(/\//g, '-').trim();
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return normalized;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const calculateVolume = (record: RawRecord): number => {
  const { weight, exercise, load, reps, sets } = record;
  const weightLb = weight * KG_TO_LB;
  if (exercise === '懸垂') return (weightLb + load) * reps * sets;
  if (exercise.includes('アブローラー(膝コロ)')) return weightLb * reps * sets * 0.6;
  if (exercise.includes('アブローラー(立ちコロ)')) return weightLb * reps * sets * 0.9;
  if (exercise === 'ブルガリアンスクワット(左右)') return load * reps * sets * 4;
  if (exercise.includes('(左右)')) return load * reps * sets * 2;
  return load * reps * sets * 2;
};

const aggregateVolumeData = (records: RawRecord[]): VolumeData[] => {
  const aggregated: Record<string, VolumeData> = {};
  records.forEach(record => {
    const date = toIso(record.date);
    const key = `${date}_${record.exercise}`;
    if (!aggregated[key]) {
      aggregated[key] = { id: key, date, weight: record.weight, exercise: record.exercise, volume: 0 };
    }
    aggregated[key].volume += calculateVolume(record);
  });
  return Object.values(aggregated);
};

const WorkoutTracker = () => {
  // === カスタムツールチップ ===
  

  const [rawRecords, setRawRecords] = useState<RawRecord[]>([]);
  const [formData, setFormData] = useState<FormData>({
    date: '',
    weight: '',
    exercise: '',
    comment: '',
    details: [{ load: '', reps: '', sets: '1' }],
    affectsRecommendation: true
  });
  const [view, setView] = useState<'input' | 'menu' | 'raw' | 'volume' | 'graph' | 'stats'>('input');
  const [selectedExerciseForGraph, setSelectedExerciseForGraph] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCustomExercise, setIsCustomExercise] = useState(false);
  const [supportsRecommendationColumn, setSupportsRecommendationColumn] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    date: '',
    weight: '',
    exercise: '',
    load: '',
    reps: '',
    sets: '',
    comment: '',
    affectsRecommendation: true
  });
  const volumeData = useMemo(() => aggregateVolumeData(rawRecords), [rawRecords]);

const CustomTooltip = ({ active, payload, label }: ChartTooltipProps) => {
    if (active && payload && payload.length) {
      const date = label;
      const records = rawRecords.filter(
        (r) => r.date === date && r.exercise === selectedExerciseForGraph
      );
      const details = records.map((r) => `${r.load}lb × ${r.reps}回 × ${r.sets}セット`);

      return (
        <div className="bg-white border p-2 rounded shadow text-sm">
          <p className="font-semibold">{date}</p>
          <p>総挙上重量: {payload[0]?.value?.toFixed?.(1)} lb</p>
          <p>最大負荷: {payload[1]?.value} lb</p>
          {details.length > 0 && (
            <div className="mt-1">
              <p className="font-semibold text-gray-700">セット内訳:</p>
              {details.map((d, i) => (
                <p key={i} className="text-gray-600">{d}</p>
              ))}
            </div>
          )}
        </div>
      );
    }
    return null;
  };
  // Supabaseからデータを読み込む
  const loadData = useCallback(async (): Promise<void> => {
    try {
      setIsRefreshing(true);
      const { data: rawData, error: rawError } = await supabase
        .from('workout_raw_records')
        .select('*')
        .order('created_at', { ascending: true });

      if (rawError) throw rawError;

      const formattedRawData: RawRecord[] = (rawData as DbRawRecord[] | null ?? []).map(record => ({
        id: record.id,
        date: record.date,
        weight: record.weight,
        exercise: record.exercise,
        load: record.load,
        reps: record.reps,
        sets: record.sets,
        comment: visibleComment(record.comment),
        recommendationMode: record.affects_recommendation === false || hasLightSessionMarker(record.comment) ? 'light' : 'normal'
      }));
      setRawRecords(formattedRawData);

      const { error: recommendationColumnError } = await supabase
        .from('workout_raw_records')
        .select('id, affects_recommendation')
        .limit(1);
      setSupportsRecommendationColumn(!recommendationColumnError);
    } catch (error) {
      console.error('データ読み込みエラー:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const now = new Date();
    const formatted = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    setFormData(prev => ({ ...prev, date: formatted }));
  }, [loadData]);

  const getUniqueExercises = (): string[] => Array.from(new Set(rawRecords.map(r => r.exercise))).sort();

  const addDetail = (): void => {
    setFormData(prev => ({
      ...prev,
      details: [...prev.details, { load: '', reps: '', sets: '1' }]
    }));
  };

  const removeDetail = (index: number): void => {
    if (formData.details.length > 1) {
      setFormData(prev => ({
        ...prev,
        details: prev.details.filter((_, i) => i !== index)
      }));
    }
  };

  const updateDetail = (index: number, field: string, value: string): void => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    }));
  };

  const handleSubmit = async (): Promise<void> => {
    if (!formData.date || !formData.exercise || formData.details.some(d => !d.load || !d.reps || !d.sets)) {
      alert('すべての項目を入力してください');
      return;
    }

    try {
      const records = formData.details.map(detail => {
        const record = {
          date: formData.date.replace(/\//g, '-'),
          weight: parseFloat(formData.weight) || 60,
          exercise: formData.exercise,
          load: parseFloat(detail.load),
          reps: parseInt(detail.reps),
          sets: parseInt(detail.sets),
          comment: supportsRecommendationColumn
            ? formData.comment
            : storedComment(formData.comment, formData.affectsRecommendation),
        };
        return supportsRecommendationColumn
          ? { ...record, affects_recommendation: formData.affectsRecommendation }
          : record;
      });

      const { data, error } = await supabase.from('workout_raw_records').insert(records).select();
      if (error) throw error;

      const addedRecords: RawRecord[] = (data as DbRawRecord[] | null ?? []).map(r => ({
        id: r.id,
        date: r.date,
        weight: r.weight,
        exercise: r.exercise,
        load: r.load,
        reps: r.reps,
        sets: r.sets,
        comment: visibleComment(r.comment),
        recommendationMode: r.affects_recommendation === false || hasLightSessionMarker(r.comment) ? 'light' : 'normal'
      }));

      setRawRecords(prev => [...prev, ...addedRecords]);
      setFormData({
        date: formData.date,
        weight: formData.weight,
        exercise: '',
        comment: '',
        details: [{ load: '', reps: '', sets: '1' }],
        affectsRecommendation: true
      });
      setIsCustomExercise(false);

      alert(`${records.length}件のセットを追加しました！`);
    } catch (error) {
      console.error('記録追加エラー:', error);
      alert('記録の追加に失敗しました');
    }
  };

const getGraphDataForExercise = (exercise: string) => {
  return volumeData
    .filter(v => v.exercise === exercise)
    .map(v => ({
      date: v.date,        // すでに ISO
      volume: v.volume,
      maxLoad: Math.max(
        ...rawRecords
          .filter(r => r.exercise === exercise && toIso(r.date) === v.date)
          .map(r => r.load),
        0
      )
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};


const getExerciseStats = () => {
  // volumeData は既に ISO 日付に統一されている想定
  const grouped = volumeData.reduce((acc, cur) => {
    if (!acc[cur.exercise]) acc[cur.exercise] = [];
    acc[cur.exercise].push(cur);
    return acc;
  }, {} as Record<string, VolumeData[]>);

  return Object.entries(grouped).map(([exercise, data]) => {
    // 最終日＝ISO文字列で最大値
    const lastDateIso = data.reduce((max, d) => (d.date > max ? d.date : max), '0000-00-00');

    // 1日最高総挙上重量（volumeData から）
    const maxDailyVolume = Math.max(...data.map(d => d.volume));

    // 最高重量（rawRecords から）
    const maxWeight = Math.max(
      ...rawRecords.filter(r => r.exercise === exercise).map(r => r.load),
      0
    );

    // 実施日数（重複日付を除外）
    const workoutDays = new Set(data.map(d => d.date)).size;

    return {
      exercise,
      lastDate: lastDateIso,
      maxDailyVolume,
      maxWeight,
      workoutDays
    };
  }).sort((a, b) => a.exercise.localeCompare(b.exercise));
};


  // ====== UI部分 =======
  return (
    <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Dumbbell /> 筋トレ記録ツール</h1>
          <p className="text-gray-600">生データ: {rawRecords.length}件 | 総挙上データ: {volumeData.length}件</p>
        </div>
        <button
          onClick={loadData}
          disabled={isRefreshing}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
        >
          <RefreshCw size={18} /> 再読み込み
        </button>
      </div>

      {/* タブ切替 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { key: 'input', icon: <Plus size={18} />, label: '記録入力' },
          { key: 'menu', icon: <ClipboardList size={18} />, label: '次回メニュー' },
          { key: 'raw', icon: <Calendar size={18} />, label: '生データ' },
          { key: 'volume', icon: <TrendingUp size={18} />, label: '総挙上重量' },
          { key: 'graph', icon: <BarChart3 size={18} />, label: 'グラフ' },
          { key: 'stats', icon: <Dumbbell size={18} />, label: '統計' }
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`px-6 py-2 rounded-lg font-medium ${
              view === tab.key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* 記録入力 */}
      {view === 'input' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">新規記録（複数セット対応）</h2>
          <div className="space-y-4">

            {/* 日付・体重 */}
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                value={formData.date}
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                className="border rounded-lg p-2"
              />
              <input
                type="number"
                step="0.1"
                value={formData.weight}
                onChange={e => setFormData({ ...formData, weight: e.target.value })}
                placeholder="体重(kg)"
                className="border rounded-lg p-2"
              />
            </div>

            {/* ✅ 種目選択＋手入力対応 */}
            <div>
              <select
                value={formData.exercise || ''}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    setIsCustomExercise(true);
                    setFormData({ ...formData, exercise: '' });
                  } else {
                    setIsCustomExercise(false);
                    setFormData({ ...formData, exercise: val });
                  }
                }}
                className="border rounded-lg p-2 w-full"
              >
                <option value="">種目を選択</option>
                {Array.from(new Set([...EXERCISE_RULES.map(rule => rule.exercise), ...getUniqueExercises()])).map((ex, i) => (
                  <option key={i} value={ex}>{ex}</option>
                ))}
                <option value="custom">＋ 新しく記入する</option>
              </select>

              {/* 新規種目記入欄 */}
              {isCustomExercise && (
                <input
                  type="text"
                  placeholder="種目名を入力"
                  value={formData.exercise}
                  onChange={e => setFormData({ ...formData, exercise: e.target.value })}
                  className="border rounded-lg p-2 w-full mt-2"
                />
              )}

              {/* ✅ 選択中の過去統計表示 */}
              {formData.exercise && (() => {
                const filtered = rawRecords.filter(r => r.exercise === formData.exercise);
                if (filtered.length === 0) return null;
                const maxLoad = Math.max(...filtered.map(r => r.load));
                const maxVolume = Math.max(
                  ...Object.values(
                    filtered.reduce((acc, r) => {
                      acc[r.date] = (acc[r.date] || 0) + calculateVolume(r);
                      return acc;
                    }, {} as Record<string, number>)
                  )
                );
                return (
                  <div className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded-lg border">
                    <p>🔹これまでの最高総挙上重量: <span className="font-semibold">{maxVolume.toFixed(1)} lb</span></p>
                    <p>🔹これまでの最高負荷(1セットあたり): <span className="font-semibold">{maxLoad} lb</span></p>
                  </div>
                );
              })()}
            </div>

            {/* ✅ スマホ対応：＋／−ボタン付きセット入力欄 */}
            {formData.details.map((d, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-3 items-center bg-gray-50 p-3 rounded-lg">
                
                {/* 重量 */}
                <div className="flex items-center gap-2 w-full sm:w-1/3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">重量(lb)</label>
                  <div className="flex items-center border rounded-lg w-full bg-white">
                    <button
                      type="button"
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      onClick={() => updateDetail(i, 'load', String(Math.max(0, (parseFloat(d.load) || 0) - 5)))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={d.load}
                      onChange={(e) => updateDetail(i, 'load', e.target.value)}
                      className="w-full text-center outline-none py-1"
                      step="5"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      onClick={() => updateDetail(i, 'load', String((parseFloat(d.load) || 0) + 5))}
                    >
                      ＋
                    </button>
                  </div>
                </div>

                {/* 回数 */}
                <div className="flex items-center gap-2 w-full sm:w-1/3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">回数</label>
                  <div className="flex items-center border rounded-lg w-full bg-white">
                    <button
                      type="button"
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      onClick={() => updateDetail(i, 'reps', String(Math.max(0, (parseInt(d.reps) || 0) - 1)))}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={d.reps}
                      onChange={(e) => updateDetail(i, 'reps', e.target.value)}
                      className="w-full text-center outline-none py-1"
                      step="1"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      onClick={() => updateDetail(i, 'reps', String((parseInt(d.reps) || 0) + 1))}
                    >
                      ＋
                    </button>
                  </div>
                </div>

                {/* セット数 */}
                <div className="flex items-center gap-2 w-full sm:w-1/3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">セット</label>
                  <div className="flex items-center border rounded-lg w-full bg-white">
                    <button
                      type="button"
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      onClick={() => updateDetail(i, 'sets', String(Math.max(1, (parseInt(d.sets) || 1) - 1)))}
                    >
                      −
                    </button>
                    <select
                      value={d.sets || '1'}
                      onChange={(e) => updateDetail(i, 'sets', e.target.value)}
                      className="w-full text-center outline-none py-1 bg-transparent"
                    >
                      {[...Array(10)].map((_, n) => (
                        <option key={n + 1} value={n + 1}>{n + 1}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="px-2 py-1 text-gray-600 hover:bg-gray-100"
                      onClick={() => updateDetail(i, 'sets', String(Math.min(10, (parseInt(d.sets) || 1) + 1)))}
                    >
                      ＋
                    </button>
                  </div>
                </div>

                {/* セット削除 */}
                {formData.details.length > 1 && (
                  <button
                    onClick={() => removeDetail(i)}
                    className="text-red-600 hover:bg-red-100 rounded-full p-2 mt-2 sm:mt-0"
                  >
                    <Minus size={16} />
                  </button>
                )}
              </div>
            ))}


            {/* ✅ リアルタイム総挙上重量表示 */}
            {formData.exercise && (
              <div className="text-sm bg-blue-50 border rounded-lg p-2">
                {(() => {
                  const tempRecords: RawRecord[] = formData.details.map((d, i) => ({
                    id: i,
                    date: formData.date,
                    weight: parseFloat(formData.weight) || 60,
                    exercise: formData.exercise,
                    load: parseFloat(d.load) || 0,
                    reps: parseInt(d.reps) || 0,
                    sets: parseInt(d.sets) || 0,
                    comment: '',
                    recommendationMode: formData.affectsRecommendation ? 'normal' : 'light'
                  }));
                  const totalVolume = tempRecords.reduce((sum, r) => sum + calculateVolume(r), 0);
                  return <p>💪 この記録の総挙上重量: <span className="font-semibold">{totalVolume.toFixed(1)} lb</span></p>;
                })()}
              </div>
            )}

            <button
              onClick={addDetail}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Plus size={16} /> セット追加
            </button>

            <textarea
              value={formData.comment}
              onChange={e => setFormData({ ...formData, comment: e.target.value })}
              placeholder="メモ"
              rows={2}
              className="border rounded-lg p-2 w-full"
            />

            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
              formData.affectsRecommendation ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'
            }`}>
              <input
                type="checkbox"
                checked={!formData.affectsRecommendation}
                onChange={e => setFormData({ ...formData, affectsRecommendation: !e.target.checked })}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block font-medium text-slate-900">今日は軽く動くだけ</span>
                <span className="mt-1 block text-sm leading-5 text-slate-600">
                  総挙上重量には含めますが、次回メニューの重量・回数判定には反映しません。
                </span>
              </span>
            </label>

            <button
              onClick={handleSubmit}
              className="bg-blue-600 text-white w-full py-3 rounded-lg hover:bg-blue-700"
            >
              記録を追加
            </button>
          </div>
        </div>
      )}

      {view === 'menu' && (
        <RecommendationPanel
          records={rawRecords}
          asOf={(() => {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          })()}
        />
      )}



      {/* 生データ */}
        {view === 'raw' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">生データ（編集・削除対応）</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    <th>日付</th>
                    <th>体重</th>
                    <th>種目</th>
                    <th>重量</th>
                    <th>回数</th>
                    <th>セット</th>
                    <th>提案への反映</th>
                    <th>コメント</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rawRecords].reverse().map((record) => (
                    <tr key={record.id} className="border-b">
                      {editingId === record.id ? (
                        <>
                          <td><input value={editFormData.date} onChange={e => setEditFormData({...editFormData, date: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td><input value={editFormData.weight} onChange={e => setEditFormData({...editFormData, weight: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td><input value={editFormData.exercise} onChange={e => setEditFormData({...editFormData, exercise: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td><input value={editFormData.load} onChange={e => setEditFormData({...editFormData, load: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td><input value={editFormData.reps} onChange={e => setEditFormData({...editFormData, reps: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td><input value={editFormData.sets} onChange={e => setEditFormData({...editFormData, sets: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td className="text-center"><input type="checkbox" checked={editFormData.affectsRecommendation} onChange={e => setEditFormData({...editFormData, affectsRecommendation: e.target.checked})}/></td>
                          <td><input value={editFormData.comment} onChange={e => setEditFormData({...editFormData, comment: e.target.value})} className="border rounded p-1 w-full"/></td>
                          <td className="flex gap-1">
                            <button
                              onClick={async () => {
                                const updateRecord = {
                                  date: editFormData.date,
                                  weight: parseFloat(editFormData.weight),
                                  exercise: editFormData.exercise,
                                  load: parseFloat(editFormData.load),
                                  reps: parseInt(editFormData.reps),
                                  sets: parseInt(editFormData.sets),
                                  comment: supportsRecommendationColumn
                                    ? editFormData.comment
                                    : storedComment(editFormData.comment, editFormData.affectsRecommendation),
                                };
                                const { error } = await supabase
                                  .from('workout_raw_records')
                                  .update(supportsRecommendationColumn
                                    ? { ...updateRecord, affects_recommendation: editFormData.affectsRecommendation }
                                    : updateRecord)
                                  .eq('id', record.id);
                                if (!error) {
                                  alert('更新しました');
                                  setEditingId(null);
                                  loadData();
                                } else {
                                  alert('更新失敗');
                                }
                              }}
                              className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="bg-gray-400 text-white px-2 py-1 rounded hover:bg-gray-500"
                            >
                              キャンセル
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{record.date}</td>
                          <td>{record.weight}</td>
                          <td>{record.exercise}</td>
                          <td>{record.load}</td>
                          <td>{record.reps}</td>
                          <td>{record.sets}</td>
                          <td>{record.recommendationMode === 'light' ? '軽い日' : '通常'}</td>
                          <td>{record.comment}</td>
                          <td className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingId(record.id);
                                setEditFormData({
                                  date: record.date,
                                  weight: record.weight.toString(),
                                  exercise: record.exercise,
                                  load: record.load.toString(),
                                  reps: record.reps.toString(),
                                  sets: record.sets.toString(),
                                  comment: record.comment,
                                  affectsRecommendation: record.recommendationMode !== 'light'
                                });
                              }}
                              className="bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                            >
                              編集
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm('削除しますか？')) {
                                  const { error } = await supabase
                                    .from('workout_raw_records')
                                    .delete()
                                    .eq('id', record.id);
                                  if (!error) {
                                    alert('削除しました');
                                    loadData();
                                  } else {
                                    alert('削除失敗');
                                  }
                                }
                              }}
                              className="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
                            >
                              削除
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* 総挙上重量 */}
      {view === 'volume' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">総挙上重量</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-100">
                <tr><th>日付</th><th>種目</th><th>総挙上重量(lb)</th></tr>
              </thead>
              <tbody>
                {volumeData
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((v, i) => (
                    <tr key={i} className="border-b">
                      <td>{v.date}</td>
                      <td>{v.exercise}</td>
                      <td>{v.volume.toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* グラフ */}
      {view === 'graph' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">推移グラフ</h2>

          {/* 種目選択 */}
          <select
            value={selectedExerciseForGraph}
            onChange={(e) => setSelectedExerciseForGraph(e.target.value)}
            className="border p-2 rounded-lg mb-4"
          >
            <option value="">種目を選択</option>
            {getUniqueExercises().map((ex, i) => (
              <option key={i} value={ex}>{ex}</option>
            ))}
          </select>

          {/* グラフ描画 */}
          {selectedExerciseForGraph && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={getGraphDataForExercise(selectedExerciseForGraph)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />

                {/* ✅ 左軸：総挙上重量 */}
                <YAxis yAxisId="left" orientation="left" />

                {/* ✅ 右軸：最大負荷 */}
                <YAxis yAxisId="right" orientation="right" />

                {/* ✅ カスタムツールチップ */}
                <Tooltip content={<CustomTooltip />} />

                <Legend />

                {/* 総挙上重量線 */}
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="volume"
                  stroke="#2563eb"
                  name="総挙上重量(lb)"
                />

                {/* 最大負荷線 */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="maxLoad"
                  stroke="#dc2626"
                  name="最大負荷(lb)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}


      {/* 統計 */}
      {view === 'stats' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">統計</h2>
          <div className="grid gap-3">
            {getExerciseStats().map((s, i) => (
              <div key={i} className="border rounded-lg p-4">
                <h3 className="font-bold text-lg mb-2">{s.exercise}</h3>
                <p>最後に行った日: {s.lastDate}</p>
                <p>最高重量: {s.maxWeight}lb</p>
                <p>1日最高総挙上重量: {s.maxDailyVolume.toFixed(1)}lb</p>
                <p>実施日数: {s.workoutDays}日</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutTracker;

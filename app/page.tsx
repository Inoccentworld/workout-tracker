'use client'

import React, { useState, useEffect } from 'react';
import { Plus, Calendar, TrendingUp, Dumbbell, Download, BarChart3, RefreshCw, Upload, Edit, Trash2, Save, X, Minus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase';

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
};

type FormData = {
  date: string;
  weight: string;
  exercise: string;
  comment: string;
  sets: SetForm[];
};

type EditFormData = {
  date: string;
  weight: string;
  exercise: string;
  load: string;
  reps: string;
  sets: string;
  comment: string;
};
// ========================================

const WorkoutTracker = () => {
  const [rawRecords, setRawRecords] = useState<RawRecord[]>([]);
  const [volumeData, setVolumeData] = useState<VolumeData[]>([]);
  const [formData, setFormData] = useState<FormData>({
    date: '',
    weight: '',
    exercise: '',
    comment: '',
    sets: [{ load: '', reps: '' }]
  });
  const [view, setView] = useState<'input' | 'raw' | 'volume' | 'graph' | 'stats' | 'import'>('input');
  const [selectedExerciseForGraph, setSelectedExerciseForGraph] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    date: '',
    weight: '',
    exercise: '',
    load: '',
    reps: '',
    sets: '',
    comment: ''
  });

  const KG_TO_LB = 2.20462;

  // Supabaseからデータを読み込む
  const loadData = async (): Promise<void> => {
    try {
      setLoading(true);

      const { data: rawData, error: rawError } = await supabase
        .from('workout_raw_records')
        .select('*')
        .order('created_at' as any, { ascending: true });

      if (rawError) {
        console.error('Raw data error:', rawError);
        setRawRecords([]);
      } else if (rawData) {
        const formattedRawData: RawRecord[] = rawData.map((record: any) => ({
          id: record.id,
          date: record.date,
          weight: record.weight,
          exercise: record.exercise,
          load: record.load,
          reps: record.reps,
          sets: record.sets,
          comment: record.comment || ''
        }));
        setRawRecords(formattedRawData);
      }

      const { data: volumeDataFromDB, error: volumeError } = await supabase
        .from('workout_volume_data')
        .select('*')
        .order('created_at' as any, { ascending: true });

      if (volumeError) {
        console.error('Volume data error:', volumeError);
        setVolumeData([]);
      } else if (volumeDataFromDB) {
        const formattedVolumeData: VolumeData[] = volumeDataFromDB.map((record: any) => ({
          id: record.id,
          date: record.workout_date,
          weight: 0,
          exercise: record.exercise_name,
          volume: record.total_volume
        }));
        setVolumeData(formattedVolumeData);
      }
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
      setRawRecords([]);
      setVolumeData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setCurrentDateTime();
  }, []);

  const getUniqueExercises = (): string[] => {
    const exercises = new Set(rawRecords.map(r => r.exercise));
    return Array.from(exercises).sort();
  };

  const setCurrentDateTime = (): void => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    setFormData(prev => ({ ...prev, date: `${year}/${month}/${day}` }));
  };

  const addSet = (): void => {
    setFormData(prev => ({
      ...prev,
      sets: [...prev.sets, { load: '', reps: '' }]
    }));
  };

  const removeSet = (index: number): void => {
    if (formData.sets.length > 1) {
      setFormData(prev => ({
        ...prev,
        sets: prev.sets.filter((_, i) => i !== index)
      }));
    }
  };

  const updateSet = (index: number, field: string, value: string): void => {
    setFormData(prev => ({
      ...prev,
      sets: prev.sets.map((set, i) =>
        i === index ? { ...set, [field]: value } : set
      )
    }));
  };

  const deleteRecord = async (id: string | number): Promise<void> => {
    if (!confirm('この記録を削除しますか？この操作は元に戻せません。')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('workout_raw_records')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRawRecords(prev => prev.filter(record => record.id !== id));
      alert('記録を削除しました');
    } catch (error) {
      console.error('削除エラー:', error);
      alert('記録の削除に失敗しました');
    }
  };

  const startEdit = (record: RawRecord): void => {
    setEditingId(record.id);
    setEditFormData({
      date: record.date,
      weight: record.weight.toString(),
      exercise: record.exercise,
      load: record.load.toString(),
      reps: record.reps.toString(),
      sets: record.sets.toString(),
      comment: record.comment
    });
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditFormData({
      date: '',
      weight: '',
      exercise: '',
      load: '',
      reps: '',
      sets: '',
      comment: ''
    });
  };

  const saveEdit = async (): Promise<void> => {
    try {
      const { error } = await supabase
        .from('workout_raw_records')
        .update({
          date: editFormData.date,
          weight: parseFloat(editFormData.weight),
          exercise: editFormData.exercise,
          load: parseFloat(editFormData.load),
          reps: parseInt(editFormData.reps),
          sets: parseInt(editFormData.sets),
          comment: editFormData.comment
        })
        .eq('id', editingId);

      if (error) throw error;

      setRawRecords(prev =>
        prev.map(record =>
          record.id === editingId
            ? {
                ...record,
                ...editFormData,
                weight: parseFloat(editFormData.weight),
                load: parseFloat(editFormData.load),
                reps: parseInt(editFormData.reps),
                sets: parseInt(editFormData.sets)
              }
            : record
        )
      );

      cancelEdit();
      alert('記録を更新しました');
    } catch (error) {
      console.error('更新エラー:', error);
      alert('記録の更新に失敗しました');
    }
  };

  const importCSVData = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm(`CSVファイル "${file.name}" からデータをインポートしますか？`)) {
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const lines = text.trim().split('\n');
      const records: RawRecord[] = [];

      for (let i = 1; i < lines.length; i++) {
        const [date, weight, exercise, load, reps, sets, comment] = lines[i].split(',');
        records.push({
          id: i,
          date,
          weight: parseFloat(weight),
          exercise,
          load: parseFloat(load),
          reps: parseInt(reps),
          sets: parseInt(sets),
          comment: comment || ''
        });
      }

      const { error } = await supabase.from('workout_raw_records').insert(records);
      if (error) throw error;

      alert(`${records.length}件のデータをインポートしました！`);
      await loadData();
      event.target.value = '';
    } catch (error) {
      console.error('インポートエラー:', error);
      alert('インポートに失敗しました');
      event.target.value = '';
    }
  };

  const handleRefresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await loadData();
      alert('データを更新しました！');
    } catch (error) {
      console.error('リフレッシュに失敗しました:', error);
      alert('データの更新に失敗しました');
    } finally {
      setIsRefreshing(false);
    }
  };

  const calculateVolume = (record: RawRecord): number => {
    const { weight, exercise, load, reps, sets } = record;
    const weightLb = weight * KG_TO_LB;

    if (exercise === '懸垂') {
      return (weightLb + load) * reps * sets;
    } else if (exercise.includes('アブローラー(膝コロ)')) {
      return weightLb * reps * sets * 0.6;
    } else if (exercise.includes('アブローラー(立ちコロ)')) {
      return weightLb * reps * sets * 0.9;
    } else if (exercise === 'ブルガリアンスクワット(左右)') {
      return load * reps * sets * 4;
    } else if (exercise.includes('(左右)')) {
      return load * reps * sets * 2;
    } else {
      return load * reps * sets * 2;
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!formData.date || !formData.exercise || formData.sets.some(set => !set.load || !set.reps)) {
      alert('必須項目を入力してください');
      return;
    }

    try {
      const records: Omit<RawRecord, 'id'>[] = [];
      formData.sets.forEach(set => {
        if (set.load && set.reps) {
          records.push({
            date: formData.date.replace(/\//g, '-'),
            weight: parseFloat(formData.weight) || 60,
            exercise: formData.exercise,
            load: parseFloat(set.load),
            reps: parseInt(set.reps),
            sets: 1,
            comment: formData.comment
          });
        }
      });

      const { data, error } = await supabase.from('workout_raw_records').insert(records).select();
      if (error) throw error;

      const addedRecords: RawRecord[] = (data as any[]).map(record => ({
        id: record.id,
        date: record.date,
        weight: record.weight,
        exercise: record.exercise,
        load: record.load,
        reps: record.reps,
        sets: record.sets,
        comment: record.comment
      }));

      setRawRecords(prev => [...prev, ...addedRecords]);
      setFormData({
        date: formData.date,
        weight: formData.weight,
        exercise: '',
        comment: '',
        sets: [{ load: '', reps: '' }]
      });

      alert(`${records.length}セットの記録を追加しました！`);
    } catch (error) {
      console.error('記録の追加でエラーが発生しました:', error);
      alert('記録の追加に失敗しました');
    }
  };

  const getAggregatedVolumeData = (): { date: string; exercise: string; totalVolume: number; details: any[] }[] => {
    const aggregated: Record<string, { date: string; exercise: string; totalVolume: number; details: any[] }> = {};

    rawRecords.forEach(record => {
      const key = `${record.date}_${record.exercise}`;
      if (!aggregated[key]) {
        aggregated[key] = { date: record.date, exercise: record.exercise, totalVolume: 0, details: [] };
      }

      const volume = calculateVolume(record);
      aggregated[key].totalVolume += volume;
      aggregated[key].details.push({ load: record.load, reps: record.reps, sets: record.sets, volume });
    });

    return Object.values(aggregated).sort((a, b) => b.date.localeCompare(a.date));
  };

  const getExerciseStats = (): {
    exercise: string;
    lastDate: string;
    maxDailyVolume: number;
    maxWeight: number;
    workoutDays: number;
  }[] => {
    const statsMap: Record<string, {
      exercise: string;
      lastDate: string;
      maxDailyVolume: number;
      maxWeight: number;
      workoutDays: number;
    }> = {};

    const aggregated = getAggregatedVolumeData();

    aggregated.forEach((entry) => {
      const { exercise, date, totalVolume } = entry;
      if (!statsMap[exercise]) {
        statsMap[exercise] = {
          exercise,
          lastDate: date,
          maxDailyVolume: totalVolume,
          maxWeight: 0,
          workoutDays: 1
        };
      } else {
        const stat = statsMap[exercise];
        stat.workoutDays += 1;
        if (date > stat.lastDate) stat.lastDate = date;
        if (totalVolume > stat.maxDailyVolume) stat.maxDailyVolume = totalVolume;
      }
    });

    rawRecords.forEach((r) => {
      if (!statsMap[r.exercise]) return;
      if (r.load > statsMap[r.exercise].maxWeight) {
        statsMap[r.exercise].maxWeight = r.load;
      }
    });

    return Object.values(statsMap).sort((a, b) =>
      a.exercise.localeCompare(b.exercise, 'ja')
    );
  };

  const exportRawToCSV = (): void => {
    const headers = '日付,体重(kg),種目,重量(lb),回数,セット数,コメント\n';
    const csv = headers + rawRecords.map(r =>
      `${r.date},${r.weight},${r.exercise},${r.load},${r.reps},${r.sets},${r.comment}`
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'workout_raw_data.csv';
    link.click();
  };

  const exportVolumeToCSV = (): void => {
    const aggregatedData = getAggregatedVolumeData();
    const headers = '日付,種目,総挙上重量(lb)\n';
    const csv = headers + aggregatedData.map(v =>
      `${v.date},${v.exercise},${v.totalVolume.toFixed(1)}`
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'workout_volume_data.csv';
    link.click();
  };

  const getGraphDataForExercise = (exercise: string): { date: string; volume: number; maxLoad: number }[] => {
    const dateMap: Record<string, { date: string; volume: number; maxLoad: number }> = {};

    rawRecords.filter(r => r.exercise === exercise).forEach(r => {
      if (!dateMap[r.date]) {
        dateMap[r.date] = { date: r.date, volume: 0, maxLoad: 0 };
      }
      const volume = calculateVolume(r);
      dateMap[r.date].volume += volume;
      if (r.load > dateMap[r.date].maxLoad) dateMap[r.date].maxLoad = r.load;
    });

    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  };

  // === JSX部分（省略せず完全版） ===
  return (
     <div className="max-w-6xl mx-auto p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2 flex items-center gap-2">
              <Dumbbell className="text-blue-600" />
              筋トレ記録ツール
            </h1>
            <p className="text-gray-600">生データ: {rawRecords.length}件 | 総挙上データ: {volumeData.length}件</p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
              isRefreshing 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : ''} size={20} />
            {isRefreshing ? '更新中...' : 'データ更新'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setView('input')}
          className={`px-6 py-2 rounded-lg font-medium ${
            view === 'input' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Plus className="inline mr-2" size={18} />
          記録入力
        </button>
        <button
          onClick={() => setView('raw')}
          className={`px-6 py-2 rounded-lg font-medium ${
            view === 'raw' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Calendar className="inline mr-2" size={18} />
          生データ
        </button>
        <button
          onClick={() => setView('volume')}
          className={`px-6 py-2 rounded-lg font-medium ${
            view === 'volume' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <TrendingUp className="inline mr-2" size={18} />
          総挙上重量
        </button>
        <button
          onClick={() => setView('graph')}
          className={`px-6 py-2 rounded-lg font-medium ${
            view === 'graph' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <BarChart3 className="inline mr-2" size={18} />
          グラフ
        </button>
        <button
          onClick={() => setView('stats')}
          className={`px-6 py-2 rounded-lg font-medium ${
            view === 'stats' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          種目別統計
        </button>
        <button
          onClick={() => setView('import')}
          className={`px-6 py-2 rounded-lg font-medium ${
            view === 'import' 
              ? 'bg-blue-600 text-white' 
              : 'bg-white text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Upload className="inline mr-2" size={18} />
          データインポート
        </button>
      </div>

      {view === 'input' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">新規記録（複数セット対応）</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">日付</label>
                <input
                  type="text"
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  placeholder="2025/11/01"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">体重 (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => setFormData({...formData, weight: e.target.value})}
                  placeholder="59.0"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">種目</label>
              <input
                type="text"
                value={formData.exercise}
                onChange={(e) => setFormData({...formData, exercise: e.target.value})}
                placeholder="ベンチプレス、スクワット、デッドリフトなど"
                className="w-full px-3 py-2 border rounded-lg"
                list="exercise-list"
              />
              <datalist id="exercise-list">
                {getUniqueExercises().map((ex, idx) => (
                  <option key={idx} value={ex} />
                ))}
                <option value="ベンチプレス" />
                <option value="スクワット" />
                <option value="デッドリフト" />
                <option value="懸垂" />
                <option value="ダンベルチェストプレス" />
                <option value="ダンベルショルダープレス" />
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">セット詳細</label>
              <div className="space-y-3">
                {formData.sets.map((set, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-600 w-16">
                      セット{index + 1}:
                    </span>
                    <div className="flex-1">
                      <input
                        type="number"
                        value={set.load}
                        onChange={(e) => updateSet(index, 'load', e.target.value)}
                        placeholder="重量(lb)"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <span className="text-sm text-gray-500">×</span>
                    <div className="flex-1">
                      <input
                        type="number"
                        value={set.reps}
                        onChange={(e) => updateSet(index, 'reps', e.target.value)}
                        placeholder="回数"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    {formData.sets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSet(index)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg"
                        title="セットを削除"
                      >
                        <Minus size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addSet}
                className="mt-3 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus size={16} />
                セットを追加
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">コメント</label>
              <textarea
                value={formData.comment}
                onChange={(e) => setFormData({...formData, comment: e.target.value})}
                placeholder="次回の目標やメモ"
                className="w-full px-3 py-2 border rounded-lg"
                rows={2}
              />
            </div>

            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              記録を追加 ({formData.sets.filter(set => set.load && set.reps).length}セット)
            </button>
          </div>
        </div>
      )}

      {view === 'import' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">📥 CSVデータインポート</h2>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-bold text-blue-800 mb-2">📄 CSVファイル形式</h3>
              <p className="text-sm text-blue-700 mb-2">以下の形式でCSVファイルを準備してください：</p>
              <code className="text-xs bg-white p-2 rounded block">
                date,weight,exercise,load,reps,sets,comment<br/>
                2025-08-26,57.0,ダンベルチェストプレス,35,13,2,コメント
              </code>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">CSVファイルを選択</label>
              <input
                type="file"
                accept=".csv"
                onChange={importCSVData}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-bold text-yellow-800 mb-1">⚠️ 注意事項</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• 既存のデータと重複する可能性があります</li>
                <li>• インポート後は元に戻せません</li>
                <li>• 日付形式は YYYY-MM-DD で入力してください</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {view === 'raw' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">生データ（各セット記録）</h2>
            <button
              onClick={exportRawToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download size={18} />
              CSVエクスポート
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">日付</th>
                  <th className="px-3 py-2 text-left">体重</th>
                  <th className="px-3 py-2 text-left">種目</th>
                  <th className="px-3 py-2 text-left">重量</th>
                  <th className="px-3 py-2 text-left">回数</th>
                  <th className="px-3 py-2 text-left">セット</th>
                  <th className="px-3 py-2 text-left">コメント</th>
                  <th className="px-3 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {[...rawRecords].reverse().map((record, idx) => (
                  <tr key={record.id} className="border-b hover:bg-gray-50">
                    {editingId === record.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editFormData.date}
                            onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editFormData.weight}
                            onChange={(e) => setEditFormData({...editFormData, weight: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editFormData.exercise}
                            onChange={(e) => setEditFormData({...editFormData, exercise: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editFormData.load}
                            onChange={(e) => setEditFormData({...editFormData, load: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editFormData.reps}
                            onChange={(e) => setEditFormData({...editFormData, reps: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={editFormData.sets}
                            onChange={(e) => setEditFormData({...editFormData, sets: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editFormData.comment}
                            onChange={(e) => setEditFormData({...editFormData, comment: e.target.value})}
                            className="w-full px-2 py-1 border rounded text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={saveEdit}
                              className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
                              title="保存"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 bg-gray-600 text-white rounded hover:bg-gray-700"
                              title="キャンセル"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2">{record.date}</td>
                        <td className="px-3 py-2">{record.weight}kg</td>
                        <td className="px-3 py-2">{record.exercise}</td>
                        <td className="px-3 py-2">{record.load}lb</td>
                        <td className="px-3 py-2">{record.reps}</td>
                        <td className="px-3 py-2">{record.sets}</td>
                        <td className="px-3 py-2 text-gray-600">{record.comment}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button
                              onClick={() => startEdit(record)}
                              className="p-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                              title="編集"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => deleteRecord(record.id)}
                              className="p-1 bg-red-600 text-white rounded hover:bg-red-700"
                              title="削除"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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

      {view === 'volume' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">総挙上重量（日付・種目別集計）</h2>
            <button
              onClick={exportVolumeToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <Download size={18} />
              CSVエクスポート
            </button>
          </div>
          <div className="mb-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              ※ 同じ日の同じ種目はまとめて表示されています。各セットの詳細は生データタブで確認できます。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">日付</th>
                  <th className="px-4 py-2 text-left">種目</th>
                  <th className="px-4 py-2 text-left">総挙上重量 (lb)</th>
                  <th className="px-4 py-2 text-left">セット詳細</th>
                </tr>
              </thead>
              <tbody>
                {getAggregatedVolumeData().map((vol, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">{vol.date}</td>
                    <td className="px-4 py-2">{vol.exercise}</td>
                    <td className="px-4 py-2 font-bold text-blue-600">
                      {vol.totalVolume.toFixed(1)}lb
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {vol.details.map((detail, detailIdx) => (
                        <span key={detailIdx} className="inline-block mr-2 mb-1">
                          {detail.load}lb × {detail.reps}回
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'graph' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">種目別推移グラフ</h2>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">種目を選択</label>
            <select
              value={selectedExerciseForGraph}
              onChange={(e) => setSelectedExerciseForGraph(e.target.value)}
              className="w-full md:w-1/2 px-3 py-2 border rounded-lg"
            >
              <option value="">-- 種目を選択 --</option>
              {getUniqueExercises().map((ex, idx) => (
                <option key={idx} value={ex}>{ex}</option>
              ))}
            </select>
          </div>

          {selectedExerciseForGraph && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">{selectedExerciseForGraph} の推移</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={getGraphDataForExercise(selectedExerciseForGraph)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" label={{ value: '総挙上重量 (lb)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: '最大重量 (lb)', angle: 90, position: 'insideRight' }} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="volume" stroke="#2563eb" strokeWidth={2} name="総挙上重量" />
                  <Line yAxisId="right" type="monotone" dataKey="maxLoad" stroke="#dc2626" strokeWidth={2} name="最大重量" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {!selectedExerciseForGraph && (
            <div className="text-center text-gray-500 py-12">
              種目を選択してグラフを表示してください
            </div>
          )}
        </div>
      )}

      {view === 'stats' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">種目別統計（改良版）</h2>
          <div className="mb-4 p-4 bg-green-50 rounded-lg">
            <h3 className="font-bold text-green-800 mb-2">📊 統計項目の説明</h3>
            <ul className="text-sm text-green-700 space-y-1">
              <li>• <strong>最後に行った日</strong>: その種目を最後に実施した日付</li>
              <li>• <strong>1日最高総挙上重量</strong>: 1日で記録した総挙上重量の最高値</li>
              <li>• <strong>最高重量</strong>: その種目で扱った重量（ダンベルなど）の最高値</li>
              <li>• <strong>実施日数</strong>: その種目を行った日の合計数</li>
            </ul>
          </div>
          <div className="grid gap-4">
            {getExerciseStats().map((stat, idx) => (
              <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50">
                <h3 className="font-bold text-lg mb-3 text-blue-800">{stat.exercise}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">最後に行った日:</span>
                    <span className="font-medium">{stat.lastDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">1日最高総挙上重量:</span>
                    <span className="font-medium text-green-600">{stat.maxDailyVolume.toFixed(1)}lb</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">最高重量:</span>
                    <span className="font-medium text-purple-600">{stat.maxWeight}lb</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">実施日数:</span>
                    <span className="font-medium text-blue-600">{stat.workoutDays}日</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkoutTracker;
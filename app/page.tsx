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
  sets: string;  // ← セット数を追加！
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
    sets: [{ load: '', reps: '', sets: '' }]
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
        .order('created_at', { ascending: true });

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
        .order('created_at', { ascending: true });

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

  const setCurrentDateTime = (): void => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setFormData(prev => ({ ...prev, date: `${y}/${m}/${d}` }));
  };

  const addSet = (): void => {
    setFormData(prev => ({
      ...prev,
      sets: [...prev.sets, { load: '', reps: '', sets: '' }]
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

  const updateSet = (index: number, field: keyof SetForm, value: string): void => {
    setFormData(prev => ({
      ...prev,
      sets: prev.sets.map((set, i) =>
        i === index ? { ...set, [field]: value } : set
      )
    }));
  };

  // === ここが改良ポイント ===
  const handleSubmit = async (): Promise<void> => {
    if (!formData.date || !formData.exercise || formData.sets.some(set => !set.load || !set.reps || !set.sets)) {
      alert('日付・種目・重量・回数・セット数を入力してください');
      return;
    }

    try {
      const records: Omit<RawRecord, 'id'>[] = formData.sets.map(set => ({
        date: formData.date.replace(/\//g, '-'),
        weight: parseFloat(formData.weight) || 60,
        exercise: formData.exercise,
        load: parseFloat(set.load),
        reps: parseInt(set.reps),
        sets: parseInt(set.sets),
        comment: formData.comment
      }));

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
        sets: [{ load: '', reps: '', sets: '' }]
      });

      alert(`${records.length}件の記録を追加しました！`);
    } catch (error) {
      console.error('記録追加エラー:', error);
      alert('記録の追加に失敗しました');
    }
  };
  // =========================

  const calculateVolume = (record: RawRecord): number => {
    const weightLb = record.weight * KG_TO_LB;
    const base = record.load * record.reps * record.sets;
    if (record.exercise === '懸垂') return (weightLb + record.load) * record.reps * record.sets;
    if (record.exercise.includes('アブローラー(膝コロ)')) return weightLb * record.reps * record.sets * 0.6;
    if (record.exercise.includes('アブローラー(立ちコロ)')) return weightLb * record.reps * record.sets * 0.9;
    if (record.exercise === 'ブルガリアンスクワット(左右)') return record.load * record.reps * record.sets * 4;
    if (record.exercise.includes('(左右)')) return record.load * record.reps * record.sets * 2;
    return base * 2;
  };

  // ================= 表示部分 =================
  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <Dumbbell /> 筋トレ記録ツール
      </h1>

      <div className="bg-white shadow p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-4">記録入力（重量・回数・セット数）</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <input
            type="text"
            value={formData.date}
            onChange={(e) => setFormData({...formData, date: e.target.value})}
            className="border rounded p-2"
            placeholder="日付 (YYYY/MM/DD)"
          />
          <input
            type="text"
            value={formData.weight}
            onChange={(e) => setFormData({...formData, weight: e.target.value})}
            className="border rounded p-2"
            placeholder="体重 (kg)"
          />
        </div>

        <input
          type="text"
          value={formData.exercise}
          onChange={(e) => setFormData({...formData, exercise: e.target.value})}
          className="border rounded p-2 w-full mb-4"
          placeholder="種目名"
        />

        <div className="space-y-3">
          {formData.sets.map((set, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={set.load}
                onChange={(e) => updateSet(i, 'load', e.target.value)}
                className="border rounded p-2 w-1/3"
                placeholder="重量(lb)"
              />
              <input
                type="number"
                value={set.reps}
                onChange={(e) => updateSet(i, 'reps', e.target.value)}
                className="border rounded p-2 w-1/3"
                placeholder="回数"
              />
              <input
                type="number"
                value={set.sets}
                onChange={(e) => updateSet(i, 'sets', e.target.value)}
                className="border rounded p-2 w-1/3"
                placeholder="セット数"
              />
              {formData.sets.length > 1 && (
                <button onClick={() => removeSet(i)} className="text-red-500 hover:text-red-700"><Minus /></button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addSet} className="mt-3 text-blue-600 flex items-center gap-1"><Plus size={16}/>セットを追加</button>

        <textarea
          value={formData.comment}
          onChange={(e) => setFormData({...formData, comment: e.target.value})}
          className="border rounded p-2 w-full mt-4"
          placeholder="コメント"
          rows={2}
        />

        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white py-3 rounded-lg mt-4 hover:bg-blue-700"
        >
          記録を追加
        </button>
      </div>
    </div>
  );
};

export default WorkoutTracker;

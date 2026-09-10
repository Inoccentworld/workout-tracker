/** Initial programming choices, not scientifically established optimal thresholds. */
export interface ExerciseRule {
  exercise: string;
  reps: readonly [number, number];
  sets: number;
  restSeconds: number;
  targetRir: number;
  equipment: 'dumbbell' | 'pullup' | 'ab-wheel';
  bilateralConfirmation: boolean;
  volumeFactor: number;
}

const rule = (
  exercise: string,
  reps: readonly [number, number],
  sets: number,
  equipment: ExerciseRule['equipment'] = 'dumbbell',
  bilateralConfirmation = false,
  volumeFactor = 2,
  restSeconds = 180,
): ExerciseRule => ({
  exercise, reps, sets, equipment, bilateralConfirmation, volumeFactor,
  restSeconds, targetRir: 0,
});

export const EXERCISE_RULES: readonly ExerciseRule[] = [
  rule('ダンベルチェストプレス', [8, 12], 3),
  rule('ダンベルショルダープレス', [8, 12], 3),
  rule('インクラインサイドレイズ(左右)', [12, 20], 3, 'dumbbell', true, 2, 120),
  rule('懸垂', [6, 10], 3, 'pullup', false, 1),
  rule('ワンハンドローイング(左右)', [8, 12], 3, 'dumbbell', true),
  rule('ダンベルデッドリフト', [6, 8], 2),
  rule('ブルガリアンスクワット(左右)', [8, 12], 2, 'dumbbell', true, 4),
  rule('アブローラー(膝コロ)', [8, 15], 2, 'ab-wheel', false, 0.6, 120),
];

// User's formula: 10x, 10x - 2.5, 10x - 5; integer 1 < x < 9.
// These are per-dumbbell loads in lb. Do not extrapolate beyond the stated range.
export const DUMBBELL_LOADS_LB: readonly number[] = Array.from(
  { length: 7 }, (_, i) => (i + 2) * 10,
).flatMap(load => [load - 5, load - 2.5, load]);

export const DEFAULT_POLICY = {
  confirmationSessions: 2,
  // Product heuristic: a gap at least this long requests reassessment, not a
  // physiological claim about detraining. Caller may override it.
  reassessAfterDays: 14,
  // Product heuristic controlling whether all sets or just one set changes.
  largeLoadIncreaseRatio: 0.10,
} as const;

export const RULE_SOURCES = [
  { title: 'ACSM position stand (2026)', url: 'https://pubmed.ncbi.nlm.nih.gov/41843416/' },
  { title: 'Load versus repetition progression (2022)', url: 'https://pubmed.ncbi.nlm.nih.gov/36199287/' },
  { title: 'Loading and repetition ranges (2021)', url: 'https://pubmed.ncbi.nlm.nih.gov/33671664/' },
  { title: 'Proximity to failure (2024)', url: 'https://pubmed.ncbi.nlm.nih.gov/38970765/' },
];

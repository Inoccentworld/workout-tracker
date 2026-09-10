import { DEFAULT_POLICY, DUMBBELL_LOADS_LB, EXERCISE_RULES } from './workout-rules';
import type { ExerciseRule } from './workout-rules';

export interface WorkoutRecord {
  id: string | number;
  exercise: string;
  date: string;
  load: number;
  reps: number;
  sets: number;
  weight?: number;
  warmup?: boolean;
  recommendationMode?: 'normal' | 'light';
  formConfirmed?: boolean;
  bothSidesConfirmed?: boolean;
  stoppedBy?: 'muscle' | 'breathing' | 'grip' | 'form' | 'pain';
}

export interface RecommendationOptions {
  asOf: string;
  dumbbellLoadsLb?: readonly number[];
  pullupAddedLoadsLb?: readonly number[];
  bodyWeightKg?: number;
  workingSets?: number;
  reassessAfterDays?: number;
  readiness?: 'ready' | 'fatigued' | 'pain';
}

export interface PlannedSetGroup {
  role: 'main' | 'backoff';
  loadLb: number;
  sets: number;
  reps: readonly [number, number];
  targetRir: number;
  restSeconds: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  sessions: number;
  lightSessions: number;
  sets: number;
  repetitions: number;
  volumeLb: number | null;
}

export type RecommendationStatus =
  | 'unsupported' | 'invalid-history' | 'baseline' | 'reassess' | 'recovery'
  | 'repeat' | 'increase-reps' | 'increase-load' | 'transition'
  | 'equipment-limit' | 'review-difficulty' | 'confirm-equipment';

export interface Recommendation {
  exercise: string;
  status: RecommendationStatus;
  rule: ExerciseRule | null;
  lastActivityDate: string | null;
  lastProgressionDate: string | null;
  daysSinceLastProgression: number | null;
  recent7: PeriodSummary;
  previous7: PeriodSummary;
  recent28: PeriodSummary;
  weeklyAverageVolume28Lb: number | null;
  volumeKind: 'external-load' | 'bodyweight-plus-load' | 'bodyweight-proxy';
  plan: PlannedSetGroup[];
  referencePlan: PlannedSetGroup[];
  proposedVolumeLb: { min: number; max: number } | null;
  reasons: string[];
  requiredConfirmations: string[];
  issues: string[];
}

const DAY = 86_400_000;

export function normalizeWorkoutDate(value: string): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const time = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : null;
}

function timeOf(iso: string): number { return Date.parse(`${iso}T00:00:00Z`); }
function dateAt(time: number): string { return new Date(time).toISOString().slice(0, 10); }
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function calculateRecordedVolume(record: WorkoutRecord, rule: ExerciseRule): number | null {
  const count = record.reps * record.sets;
  if (rule.equipment === 'pullup' || rule.equipment === 'ab-wheel') {
    if (!positive(record.weight)) return null;
    const bodyLb = record.weight * 2.20462;
    return rule.equipment === 'pullup'
      ? (bodyLb + record.load) * count
      : bodyLb * rule.volumeFactor * count;
  }
  return record.load * count * rule.volumeFactor;
}

function summarize(rows: WorkoutRecord[], end: number, days: number, rule?: ExerciseRule): PeriodSummary {
  const start = end - (days - 1) * DAY;
  const included = rows.filter(r => timeOf(r.date) >= start && timeOf(r.date) <= end);
  const volumes = included.map(r => rule ? calculateRecordedVolume(r, rule) : null);
  return {
    from: dateAt(start), to: dateAt(end),
    sessions: new Set(included.map(r => r.date)).size,
    lightSessions: new Set(included.filter(r => r.recommendationMode === 'light').map(r => r.date)).size,
    sets: included.reduce((sum, r) => sum + r.sets, 0),
    repetitions: included.reduce((sum, r) => sum + r.reps * r.sets, 0),
    volumeLb: volumes.some(v => v === null) ? null : volumes.reduce<number>((sum, v) => sum + (v ?? 0), 0),
  };
}

function planGroup(rule: ExerciseRule, loadLb: number, sets = rule.sets, role: PlannedSetGroup['role'] = 'main'): PlannedSetGroup {
  return { role, loadLb, sets, reps: rule.reps, targetRir: rule.targetRir, restSeconds: rule.restSeconds };
}

function qualityFailed(rows: WorkoutRecord[], rule: ExerciseRule): boolean {
  return rows.some(r => r.formConfirmed === false
    || (rule.bilateralConfirmation && r.bothSidesConfirmed === false)
    || (r.stoppedBy !== undefined && r.stoppedBy !== 'muscle'));
}

function validateLoads(loads: readonly number[]): number[] {
  if (loads.some(v => !Number.isFinite(v) || v < 0)) throw new Error('重量一覧には0以上の数値を指定してください。');
  return [...new Set(loads)].sort((a, b) => a - b);
}

function setsAtLoad(rows: WorkoutRecord[], load: number): number {
  return rows.filter(r => r.load === load).reduce((sum, r) => sum + r.sets, 0);
}

function allRepsAtLeast(rows: WorkoutRecord[], load: number, reps: number): boolean {
  const target = rows.filter(r => r.load === load);
  return target.length > 0 && target.every(r => r.reps >= reps);
}

export function recommendWorkout(
  exercise: string, records: readonly WorkoutRecord[], options: RecommendationOptions,
): Recommendation {
  const asOf = normalizeWorkoutDate(options.asOf);
  if (!asOf) throw new Error('基準日に有効な日付を指定してください。');
  const end = timeOf(asOf);
  const original = EXERCISE_RULES.find(r => r.exercise === exercise);
  const sets = options.workingSets ?? original?.sets ?? 3;
  const reassessDays = options.reassessAfterDays ?? DEFAULT_POLICY.reassessAfterDays;
  if (!Number.isInteger(sets) || sets < 1 || !Number.isInteger(reassessDays) || reassessDays < 1) {
    throw new Error('セット数と再確認までの日数は正の整数にしてください。');
  }
  if (options.bodyWeightKg !== undefined && !positive(options.bodyWeightKg)) {
    throw new Error('体重は0より大きい数値にしてください。');
  }
  const rule = original ? { ...original, sets } : undefined;
  const issues: string[] = [];
  let invalid = false;
  const seen = new Set<string | number>();
  const rows: WorkoutRecord[] = [];
  for (const r of records.filter(r => r.exercise === exercise)) {
    const date = normalizeWorkoutDate(r.date);
    if (!date || !Number.isFinite(r.load) || r.load < 0
      || !Number.isInteger(r.reps) || r.reps <= 0 || !Number.isInteger(r.sets) || r.sets <= 0
      || (r.weight !== undefined && !positive(r.weight))
      || (r.recommendationMode !== undefined && !['normal', 'light'].includes(r.recommendationMode))) {
      issues.push(`記録 ${r.id}: 日付または値が不正です。`); invalid = true; continue;
    }
    if (seen.has(r.id)) {
      issues.push(`記録 ${r.id}: IDが重複しています。`); invalid = true; continue;
    }
    seen.add(r.id);
    if (timeOf(date) > end) { issues.push(`記録 ${r.id}: 基準日より後のため除外しました。`); continue; }
    if (!r.warmup) rows.push({ ...r, date, recommendationMode: r.recommendationMode ?? 'normal' });
  }

  const progressionRows = rows.filter(r => r.recommendationMode !== 'light');
  const activityDates = [...new Set(rows.map(r => r.date))].sort().reverse();
  const progressionDates = [...new Set(progressionRows.map(r => r.date))].sort().reverse();
  const recent28 = summarize(rows, end, 28, rule);
  const result: Recommendation = {
    exercise, status: 'baseline', rule: rule ?? null,
    lastActivityDate: activityDates[0] ?? null,
    lastProgressionDate: progressionDates[0] ?? null,
    daysSinceLastProgression: progressionDates[0] ? (end - timeOf(progressionDates[0])) / DAY : null,
    recent7: summarize(rows, end, 7, rule),
    previous7: summarize(rows, end - 7 * DAY, 7, rule), recent28,
    weeklyAverageVolume28Lb: recent28.volumeLb === null ? null : recent28.volumeLb / 4,
    volumeKind: rule?.equipment === 'pullup' ? 'bodyweight-plus-load'
      : rule?.equipment === 'ab-wheel' ? 'bodyweight-proxy' : 'external-load',
    plan: [], referencePlan: [], proposedVolumeLb: null,
    reasons: [], requiredConfirmations: [], issues,
  };
  const finish = (status: RecommendationStatus, reason: string, plan: PlannedSetGroup[] = []): Recommendation => {
    result.status = status; result.reasons.push(reason); result.plan = plan;
    if (plan.length && rule) {
      const latestWeight = progressionRows.find(r => positive(r.weight))?.weight;
      const bodyWeight = options.bodyWeightKg ?? latestWeight;
      const bounds = [0, 1].map(bound => plan.map(p => calculateRecordedVolume({
        id: 'proposal', exercise, date: asOf, load: p.loadLb,
        sets: p.sets, reps: p.reps[bound], weight: bodyWeight,
      }, rule)));
      if (bounds.every(values => values.every(v => v !== null))) {
        result.proposedVolumeLb = {
          min: bounds[0].reduce<number>((sum, v) => sum + (v ?? 0), 0),
          max: bounds[1].reduce<number>((sum, v) => sum + (v ?? 0), 0),
        };
      }
    }
    return result;
  };
  if (!rule) return finish('unsupported', 'この種目の提案ルールはまだありません。');
  if (invalid) return finish('invalid-history', '記録の不備を確認してからメニューを提案します。');
  if (options.readiness === 'pain' || options.readiness === 'fatigued') {
    return finish('recovery', '今日は回復を優先し、増量やセット追加を提案しません。');
  }
  if (!progressionRows.length) {
    return finish('baseline', rows.length
      ? '軽く動いただけの記録はありますが、メニューの基準になる通常記録がありません。'
      : '最近の能力が不明です。設定回数帯で行える重量を確認してください。');
  }
  if (result.daysSinceLastProgression! >= reassessDays) {
    return finish('reassess', `通常トレーニングから${result.daysSinceLastProgression}日経っています。以前の重量を参考に、現在の状態を確認してください。`);
  }

  const recentProgression = progressionRows.filter(r => end - timeOf(r.date) < 28 * DAY);
  const referenceLoad = Math.max(...recentProgression.map(r => r.load));
  const basePlan = [planGroup(rule, referenceLoad)];
  result.referencePlan = basePlan;
  const latestRows = progressionRows.filter(r => r.date === progressionDates[0]);
  const latestReferenceRows = latestRows.filter(r => r.load === referenceLoad);
  if (!latestReferenceRows.length) {
    return finish('repeat', '直近の通常記録では基準重量を行っていません。軽く行った日なら「提案に反映しない」を選んでください。', basePlan);
  }
  if (qualityFailed(latestReferenceRows, rule)) {
    return finish('repeat', 'フォーム、左右差、息切れ・握力などが先に限界になったため、この重量を維持します。', basePlan);
  }
  const completedSets = setsAtLoad(latestRows, referenceLoad);
  if (completedSets < rule.sets) {
    const lowerLoad = Math.max(...latestRows.filter(r => r.load < referenceLoad).map(r => r.load), -1);
    if (allRepsAtLeast(latestRows, referenceLoad, rule.reps[0]) && lowerLoad >= 0) {
      const mainSets = Math.min(rule.sets, completedSets + 1);
      return finish('transition', '重い重量のセットを1つ増やし、残りを軽い重量で行います。', [
        planGroup(rule, referenceLoad, mainSets),
        ...(mainSets < rule.sets ? [planGroup(rule, lowerLoad, rule.sets - mainSets, 'backoff')] : []),
      ]);
    }
    return finish('repeat', `基準重量を${rule.sets}セット行ってから増量を判断します。`, basePlan);
  }
  if (!allRepsAtLeast(latestRows, referenceLoad, rule.reps[0])) {
    return finish('repeat', '回数帯の下限を下回ったため、重量を維持します。', basePlan);
  }
  if (!allRepsAtLeast(latestRows, referenceLoad, rule.reps[1])) {
    return finish('increase-reps', `同じ重量で、各セット${rule.reps[1]}回を目指します。回数は可能な範囲で上回って構いません。`, basePlan);
  }

  const lastTwoDates = progressionDates.slice(0, DEFAULT_POLICY.confirmationSessions);
  const twoConfirmed = lastTwoDates.length === DEFAULT_POLICY.confirmationSessions
    && lastTwoDates.every(date => {
      const session = progressionRows.filter(r => r.date === date);
      return setsAtLoad(session, referenceLoad) >= rule.sets
        && allRepsAtLeast(session, referenceLoad, rule.reps[1])
        && !qualityFailed(session.filter(r => r.load === referenceLoad), rule);
    });
  if (!twoConfirmed) {
    return finish('repeat', '上限回数を達成しました。もう1回の通常トレーニングで同じ重量を確認します。', basePlan);
  }
  if (rule.equipment === 'ab-wheel') {
    return finish('review-difficulty', '上限回数を2回達成しました。到達距離を確認して次の難度を決めます。', basePlan);
  }

  const equipment = validateLoads(rule.equipment === 'pullup'
    ? options.pullupAddedLoadsLb ?? [] : options.dumbbellLoadsLb ?? DUMBBELL_LOADS_LB);
  if (!equipment.length || !equipment.includes(referenceLoad)) {
    result.requiredConfirmations.push(rule.equipment === 'pullup'
      ? '加重用器具で選べる重量（自重の0lbを含む）' : 'ダンベルで実際に選べる重量');
    return finish('confirm-equipment', '現在使える重量を確認してから、次の重量を決めます。', basePlan);
  }
  const nextLoad = equipment.find(load => load > referenceLoad);
  if (nextLoad === undefined) return finish('equipment-limit', '器具の上限です。重量以外の進め方を検討します。', basePlan);

  const bodyWeight = options.bodyWeightKg ?? latestReferenceRows.find(r => positive(r.weight))?.weight;
  if (rule.equipment === 'pullup' && !positive(bodyWeight)) {
    result.requiredConfirmations.push('現在の体重');
    return finish('confirm-equipment', '懸垂の次の加重を決めるため、現在の体重を確認してください。', basePlan);
  }
  const denominator = referenceLoad + (rule.equipment === 'pullup' ? bodyWeight! * 2.20462 : 0);
  const largeJump = denominator <= 0 || (nextLoad - referenceLoad) / denominator > DEFAULT_POLICY.largeLoadIncreaseRatio;
  const plan = largeJump && rule.sets > 1
    ? [planGroup(rule, nextLoad, 1), planGroup(rule, referenceLoad, rule.sets - 1, 'backoff')]
    : [planGroup(rule, nextLoad)];
  return finish(largeJump ? 'transition' : 'increase-load', largeJump
    ? '重量の刻みが大きいため、新しい重量を1セットから試します。続けられそうなら重いまま行って構いません。'
    : '上限回数を2回達成したため、次に選べる重量を提案します。', plan);
}

export interface WorkoutRawRecord {
  id: number
  exercise_name: string
  weight: number
  reps: number
  sets: number
  workout_date: string
  created_at: string
}

export interface WorkoutVolumeData {
  id: number
  exercise_name: string
  total_volume: number
  workout_date: string
  created_at: string
}
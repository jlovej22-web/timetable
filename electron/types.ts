export type Semester = 1 | 2;
export type ProjectStatus = '준비 중' | '진행 중' | '완료';

export interface SchoolProject {
  id: string;
  schoolName: string;
  schoolYear: number;
  semester: Semester;
  projectName: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  schoolName: string;
  schoolYear: number;
  semester: Semester;
  projectName: string;
}

export type BaseEntity =
  | 'teachers' | 'classes' | 'subjects' | 'rooms'
  | 'assignments' | 'lesson_sets' | 'lesson_set_members'
  | 'teacher_constraints' | 'fixed_lessons' | 'joint_lessons'
  | 'weight_profiles' | 'timetable_candidates' | 'working_timetables'
  | 'timetable_locks' | 'daily_schedule_changes' | 'teacher_absences'
  | 'substitute_assignments' | 'substitute_draws' | 'operation_logs';
export type BaseRecord = Record<string, unknown>;
export type SchoolSettings = {
  schoolName: string;
  schoolYear: number;
  semester: Semester;
  operatingDays: string[];
  periodsByDay: Record<string, number>;
  lunchAfterPeriod: number;
  splitAroundLunch: boolean;
};
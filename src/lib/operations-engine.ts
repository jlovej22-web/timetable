import type { TimetableEntry } from './timetable-solver';

/** A one-day exception to the published timetable. */
export type DailyScheduleChange = {
  id: string;
  date: string;
  day?: string;
  period?: number;
  entryId?: string;
  assignmentId?: string;
  occurrence?: number;
  action: 'cancel' | 'replace_teacher' | 'move' | 'overlay';
  changeType?: '단축수업' | '시험' | '학교행사' | '기타';
  target?: string;
  originalPeriods?: string;
  replacementSchedule?: string;
  scope?: string;
  status?: '검토중' | '확정';
  notes?: string;
  substituteTeacherId?: string;
  replacementTeacherId?: string;
  newDay?: string;
  newPeriod?: number;
  reason?: string;
  createdAt?: string;
};

/** A teacher's absence. A range is inclusive; an omitted range means one date. */
export type TeacherAbsence = {
  id: string;
  teacherId: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  allDay: boolean;
  startPeriod?: number;
  endPeriod?: number;
  startTime?: string;
  endTime?: string;
  reason?: string;
};

export type SubstituteAssignment = {
  id: string;
  absenceId?: string;
  entryId?: string;
  assignmentId?: string;
  date: string;
  day: string;
  period: number;
  originalTeacherId: string;
  substituteTeacherId: string;
  subjectId?: string;
  classId?: string;
  createdAt?: string;
};

export type SubstituteDraw = {
  candidateIds: string[];
  selectedTeacherId: string;
  /** Alias retained to make display code read naturally. */
  candidateId: string;
  index: number;
};

/** An immutable audit record for operational actions such as absence and replacement. */
export type OperationLog = {
  id: string;
  type: 'absence' | 'substitute_assignment' | 'schedule_change' | string;
  occurredAt: string;
  teacherId?: string;
  originalTeacherId?: string;
  substituteTeacherId?: string;
  date?: string;
  assignmentId?: string;
  details?: Record<string, unknown>;
};

export type SubstituteCandidate = {
  teacherId: string;
  score: number;
  reasons: string[];
  dailyLoad: number;
  consecutiveImpact: number;
  monthlySubstitutions: number;
  semesterSubstitutions: number;
  recent30Substitutions: number;
  sameSubject: boolean;
  sameGrade: boolean;
};

export type DailyScheduleEntry = TimetableEntry & {
  operationalStatus?: 'scheduled' | 'cancelled';
  substituteTeacherId?: string;
  originalTeacherId?: string;
  operationChangeId?: string;
};

export type SubstituteTeacherProfile = {
  id: string;
  subjectIds?: string[];
  gradeIds?: string[];
  available?: boolean;
};

export type SubstituteHistory = {
  monthly: number;
  semester: number;
  recent30: number;
};

export type SubstituteHistorySummary = Record<string, SubstituteHistory>;

export type SubstituteRankingInput = {
  entries: TimetableEntry[];
  date: string;
  lesson: TimetableEntry;
  candidateTeacherIds: string[];
  teachers?: SubstituteTeacherProfile[];
  /** Class id to grade id mapping, when grade fairness is available. */
  classGradeIds?: Record<string, string>;
  history?: OperationLog[] | SubstituteAssignment[];
  /** Replacements already decided for this date. */
  plannedAssignments?: SubstituteAssignment[];
  semesterStart?: string;
  semesterEnd?: string;
};

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const dateOnly = (value: string | Date) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
};
const asUtcDate = (value: string | Date) => new Date(`${dateOnly(value)}T00:00:00Z`);
const addDays = (value: string, amount: number) => {
  const date = asUtcDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
};
const compareDate = (left: string, right: string) => dateOnly(left).localeCompare(dateOnly(right));
const teacherIds = (entry: TimetableEntry) => entry.teacherIds?.length ? entry.teacherIds : [entry.teacherId];
const classIds = (entry: TimetableEntry) => entry.classIds?.length ? entry.classIds : [entry.classId];
const matchesEntry = (entry: TimetableEntry, change: DailyScheduleChange) =>
  (!change.entryId || change.entryId === entry.assignmentId) &&
  (!change.assignmentId || change.assignmentId === entry.assignmentId) &&
  (!change.occurrence || change.occurrence === entry.occurrence) &&
  (!change.day || change.day === entry.day) &&
  (!change.period || change.period === entry.period);

/** Converts an ISO date (or Date) into the weekday labels used by the timetable. */
export function dateToKoreanWeekday(date: string | Date): string {
  const parsed = asUtcDate(date);
  if (Number.isNaN(parsed.getTime())) throw new Error('올바른 날짜를 입력하세요.');
  return weekdays[parsed.getUTCDay()];
}

export const getKoreanWeekday = dateToKoreanWeekday;

/** True when an absence covers the supplied timetable date and period. */
export function absenceCoversSlot(absence: TeacherAbsence, date: string, period: number): boolean {
  const start = absence.startDate ?? absence.date;
  const end = absence.endDate ?? absence.date ?? absence.startDate;
  if (!start || !end || compareDate(date, start) < 0 || compareDate(date, end) > 0) return false;
  if (absence.allDay) return true;
  const from = absence.startPeriod ?? 1;
  const until = absence.endPeriod ?? from;
  return period >= from && period <= until;
}

/** Finds every lesson affected by an absence, including co-taught lessons. */
export function findAbsenceLessons(entries: TimetableEntry[], absence: TeacherAbsence, date: string): TimetableEntry[] {
  const weekday = dateToKoreanWeekday(date);
  return entries.filter((entry) =>
    entry.day === weekday &&
    teacherIds(entry).includes(absence.teacherId) &&
    absenceCoversSlot(absence, date, entry.period));
}

export const getAbsenceLessons = findAbsenceLessons;

/**
 * Applies day-specific changes as an overlay. Timetable entries are always copied;
 * the source array and its entry objects are never changed.
 */
export function overlayDailySchedule(
  entries: TimetableEntry[],
  date: string,
  changes: DailyScheduleChange[],
): DailyScheduleEntry[] {
  const weekday = dateToKoreanWeekday(date);
  const applicable = changes.filter((change) => change.date === dateOnly(date));
  const output: DailyScheduleEntry[] = [];
  for (const source of entries) {
    let entry: DailyScheduleEntry = { ...source, teacherIds: source.teacherIds ? [...source.teacherIds] : undefined };
    for (const change of applicable) {
      if (!matchesEntry(entry, change)) continue;
      if (change.action === 'move') {
        entry = { ...entry, day: change.newDay ?? entry.day, period: change.newPeriod ?? entry.period, operationChangeId: change.id };
      } else if (entry.day === weekday) {
        if (change.action === 'cancel') entry = { ...entry, operationalStatus: 'cancelled', operationChangeId: change.id };
        if (change.action === 'replace_teacher') {
          const substituteTeacherId = change.substituteTeacherId ?? change.replacementTeacherId;
          if (substituteTeacherId) {
            entry = { ...entry, originalTeacherId: entry.teacherId, substituteTeacherId, operationChangeId: change.id };
          }
        }
      }
    }
    output.push(entry);
  }
  return output;
}

export const applyDailyScheduleChanges = overlayDailySchedule;

const historyTeacher = (item: OperationLog | SubstituteAssignment) =>
  'substituteTeacherId' in item ? item.substituteTeacherId : undefined;
const historyDate = (item: OperationLog | SubstituteAssignment) =>
  item.date ?? ('occurredAt' in item ? item.occurredAt : undefined);

/** Aggregates substitution workload for the reference month, semester and prior 30 days. */
export function aggregateSubstitutionHistory(
  history: (OperationLog | SubstituteAssignment)[],
  referenceDate: string,
  semesterStart?: string,
  semesterEnd?: string,
): SubstituteHistorySummary {
  const result: SubstituteHistorySummary = {};
  const month = dateOnly(referenceDate).slice(0, 7);
  const recentStart = addDays(dateOnly(referenceDate), -29);
  const semesterFrom = semesterStart ?? `${dateOnly(referenceDate).slice(0, 4)}-01-01`;
  const semesterTo = semesterEnd ?? `${dateOnly(referenceDate).slice(0, 4)}-12-31`;
  history.forEach((item) => {
    const teacherId = historyTeacher(item);
    const date = historyDate(item);
    if (!teacherId || !date) return;
    const current = result[teacherId] ?? { monthly: 0, semester: 0, recent30: 0 };
    const normalized = dateOnly(date);
    if (normalized.slice(0, 7) === month) current.monthly += 1;
    if (compareDate(normalized, semesterFrom) >= 0 && compareDate(normalized, semesterTo) <= 0) current.semester += 1;
    if (compareDate(normalized, recentStart) >= 0 && compareDate(normalized, referenceDate) <= 0) current.recent30 += 1;
    result[teacherId] = current;
  });
  return result;
}

const maxConsecutive = (periods: number[]) => {
  const unique = [...new Set(periods)].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  unique.forEach((period, index) => {
    run = index && period === unique[index - 1] + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
};

/** Ranks only supplied candidates after removing unavailable and already-busy teachers. */
export function rankSubstituteCandidates(input: SubstituteRankingInput): SubstituteCandidate[] {
  const day = dateToKoreanWeekday(input.date);
  const original = new Set(teacherIds(input.lesson));
  const profiles = new Map((input.teachers ?? []).map((teacher) => [teacher.id, teacher]));
  const history = aggregateSubstitutionHistory(input.history ?? [], input.date, input.semesterStart, input.semesterEnd);
  const lessonGrades = new Set(classIds(input.lesson).map((id) => input.classGradeIds?.[id]).filter((id): id is string => Boolean(id)));
  const plannedBusy = new Set((input.plannedAssignments ?? []).filter((assignment) =>
    assignment.date === dateOnly(input.date) && assignment.period === input.lesson.period).map((assignment) => assignment.substituteTeacherId));
  const uniqueIds = [...new Set(input.candidateTeacherIds)];
  return uniqueIds.filter((teacherId) => {
    const profile = profiles.get(teacherId);
    return !original.has(teacherId) && profile?.available !== false && !plannedBusy.has(teacherId) &&
      !input.entries.some((entry) => entry.day === day && entry.period === input.lesson.period && teacherIds(entry).includes(teacherId));
  }).map((teacherId) => {
    const periods = input.entries.filter((entry) => entry.day === day && teacherIds(entry).includes(teacherId)).map((entry) => entry.period);
    const dailyLoad = new Set(periods).size;
    const consecutiveImpact = Math.max(0, maxConsecutive([...periods, input.lesson.period]) - maxConsecutive(periods));
    const counts = history[teacherId] ?? { monthly: 0, semester: 0, recent30: 0 };
    const profile = profiles.get(teacherId);
    const sameSubject = Boolean(profile?.subjectIds?.includes(input.lesson.subjectId));
    const sameGrade = Boolean(profile?.gradeIds?.some((grade) => lessonGrades.has(grade)));
    const score = Math.max(0, 100 - dailyLoad * 8 - consecutiveImpact * 7 - counts.monthly * 5 - counts.semester * 2 - counts.recent30 * 4 + (sameSubject ? 12 : 0) + (sameGrade ? 8 : 0));
    const reasons = [
      `당일 수업 ${dailyLoad}시간`,
      consecutiveImpact ? `연속수업 부담 ${consecutiveImpact}단계 증가` : '연속수업 부담 증가 없음',
      `이번 달 대강 ${counts.monthly}회 · 최근 30일 ${counts.recent30}회`,
      sameSubject ? '동일 과목 담당' : '동일 과목 담당 정보 없음',
      sameGrade ? '동일 학년 담당' : '동일 학년 담당 정보 없음',
    ];
    return { teacherId, score, reasons, dailyLoad, consecutiveImpact, monthlySubstitutions: counts.monthly, semesterSubstitutions: counts.semester, recent30Substitutions: counts.recent30, sameSubject, sameGrade };
  }).sort((a, b) => b.score - a.score || a.teacherId.localeCompare(b.teacherId));
}

/** Uniformly draws from exactly the ids supplied by the caller. */
export function drawSubstitute(candidateIds: string[], random: () => number = Math.random): SubstituteDraw {
  const eligibleIds = [...new Set(candidateIds)];
  if (!eligibleIds.length) throw new Error('추첨할 대강 후보가 없습니다.');
  const value = random();
  if (!Number.isFinite(value)) throw new Error('난수 값이 올바르지 않습니다.');
  const index = Math.min(eligibleIds.length - 1, Math.max(0, Math.floor(value * eligibleIds.length)));
  const selectedTeacherId = eligibleIds[index];
  return { candidateIds: eligibleIds, selectedTeacherId, candidateId: selectedTeacherId, index };
}

export const drawSubstituteCandidate = drawSubstitute;
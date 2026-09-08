import type { BaseRecord, SchoolSettings } from './base-data-store';

export type TimetableSlot = { day: string; period: number };
export type TimetableEntry = TimetableSlot & {
  assignmentId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  occurrence: number;
  kind?: 'assignment' | 'set' | 'joint';
  groupId?: string;
  classIds?: string[];
  subjectIds?: string[];
  teacherIds?: string[];
  roomIds?: string[];
  roomId?: string;
  blockIndex?: number;
};
export type ValidationIssue = { code: string; message: string };
export type WeightProfile = BaseRecord & {
  consecutive3: number; consecutive4Plus: number; gaps: number; dailyImbalance: number;
  sameSubjectDaily: number; dayDistribution: number; firstPeriodBias: number;
  lastPeriodBias: number; preferredTimeReward: number; dislikedTime: number; teacherFairness: number;
};
export type QualityMetrics = {
  consecutive3: number; consecutive4Plus: number; gaps: number; dailyImbalance: number;
  sameSubjectDaily: number; dayDistribution: number; firstPeriodBias: number;
  lastPeriodBias: number; preferredHits: number; dislikedHits: number; teacherFairness: number;
};
export type SolverInput = {
  settings: SchoolSettings;
  teachers: BaseRecord[];
  classes: BaseRecord[];
  subjects: BaseRecord[];
  assignments: BaseRecord[];
  rooms: BaseRecord[];
  lessonSets: BaseRecord[];
  lessonSetMembers: BaseRecord[];
  teacherConstraints: BaseRecord[];
  fixedLessons: BaseRecord[];
  jointLessons: BaseRecord[];
};
export type TimetableCandidate = {
  id: string;
  status: 'VALID' | 'INVALID';
  createdAt: string;
  entries: TimetableEntry[];
  validationIssues: ValidationIssue[];
  stats: { assignments: number; occurrences: number; slots: number };
  profileId?: string;
  profileName?: string;
  profileSignature?: string;
  rawPenalty?: number;
  qualityScore?: number;
  metrics?: QualityMetrics;
  attempts?: number;
  terminationReason?: 'first_feasible' | 'optimized' | 'time_limit' | 'infeasible';
  diagnostics?: string[];
};

const key = (day: string, period: number) => `${day}-${period}`;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const rank = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
};
const values = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const entryClasses = (entry: TimetableEntry) => entry.classIds?.length ? entry.classIds : [entry.classId];
const entryTeachers = (entry: TimetableEntry) => entry.teacherIds?.length ? entry.teacherIds : [entry.teacherId];
const entryRooms = (entry: TimetableEntry) => entry.roomIds?.length ? entry.roomIds : entry.roomId ? [entry.roomId] : [];

type SolverUnit = {
  id: string;
  kind: 'assignment' | 'set' | 'joint';
  occurrence: number;
  periods: number;
  classIds: string[];
  teacherIds: string[];
  subjectIds: string[];
  roomIds: string[];
  allowedDays?: string[];
  fixedSlots?: TimetableSlot[];
};

const profileSignature = (profile: WeightProfile) => [
  profile.consecutive3, profile.consecutive4Plus, profile.gaps, profile.dailyImbalance,
  profile.sameSubjectDaily, profile.dayDistribution, profile.firstPeriodBias,
  profile.lastPeriodBias, profile.preferredTimeReward, profile.dislikedTime, profile.teacherFairness,
].join(':');

export function evaluateQuality(input: SolverInput, entries: TimetableEntry[], profile: WeightProfile) {
  const teacherDay = new Map<string, number[]>();
  const teacherTotal = new Map<string, number>();
  const classSubjectDay = new Map<string, number>();
  const classSubjectDays = new Map<string, Set<string>>();
  const preferred = new Set(input.teacherConstraints.filter((v) => v.active !== 'N' && v.constraintType === '선호').map((v) => `${v.teacherId}:${v.time}`));
  const disliked = new Set(input.teacherConstraints.filter((v) => v.active !== 'N' && v.constraintType === '비선호').map((v) => `${v.teacherId}:${v.time}`));
  let preferredHits = 0;
  let dislikedHits = 0;
  let firstPeriodBias = 0;
  let lastPeriodBias = 0;
  entries.forEach((entry) => {
    entryTeachers(entry).forEach((teacherId) => {
      const dayKey = `${teacherId}:${entry.day}`;
      teacherDay.set(dayKey, [...(teacherDay.get(dayKey) ?? []), entry.period]);
      teacherTotal.set(teacherId, (teacherTotal.get(teacherId) ?? 0) + 1);
      const conditionKey = `${teacherId}:${key(entry.day, entry.period)}`;
      if (preferred.has(conditionKey)) preferredHits += 1;
      if (disliked.has(conditionKey)) dislikedHits += 1;
      if (entry.period === 1) firstPeriodBias += 1;
      if (entry.period === Number(input.settings.periodsByDay[entry.day] ?? 0)) lastPeriodBias += 1;
    });
    if (entry.kind !== 'set' && entry.kind !== 'joint') {
      const csd = `${entry.classId}:${entry.subjectId}:${entry.day}`;
      classSubjectDay.set(csd, (classSubjectDay.get(csd) ?? 0) + 1);
      const cs = `${entry.classId}:${entry.subjectId}`;
      const days = classSubjectDays.get(cs) ?? new Set<string>();
      days.add(entry.day);
      classSubjectDays.set(cs, days);
    }
  });
  let consecutive3 = 0;
  let consecutive4Plus = 0;
  let gaps = 0;
  const loadsByTeacher = new Map<string, number[]>();
  teacherDay.forEach((periods, teacherDayKey) => {
    const unique = [...new Set(periods)].sort((a, b) => a - b);
    if (unique.length) gaps += Math.max(0, unique[unique.length - 1] - unique[0] + 1 - unique.length);
    let run = 1;
    const runs: number[] = [];
    for (let index = 1; index < unique.length; index += 1) {
      if (unique[index] === unique[index - 1] + 1) run += 1;
      else { runs.push(run); run = 1; }
    }
    if (unique.length) runs.push(run);
    consecutive3 += runs.filter((value) => value === 3).length;
    consecutive4Plus += runs.filter((value) => value >= 4).length;
  });
  input.teachers.filter((v) => v.active !== 'N').forEach((teacher) => {
    loadsByTeacher.set(teacher.id, input.settings.operatingDays.map((day) =>
      new Set(teacherDay.get(`${teacher.id}:${day}`) ?? []).size,
    ));
  });
  let dailyImbalance = 0;
  const teacherGaps = new Map<string, number>();
  teacherDay.forEach((periods, teacherDayKey) => {
    const teacherId = teacherDayKey.split(':')[0];
    const unique = [...new Set(periods)].sort((a, b) => a - b);
    teacherGaps.set(teacherId, (teacherGaps.get(teacherId) ?? 0) + Math.max(0, (unique.at(-1) ?? 0) - (unique[0] ?? 0) + 1 - unique.length));
  });
  loadsByTeacher.forEach((loads) => {
    const average = loads.reduce((a, b) => a + b, 0) / Math.max(1, input.settings.operatingDays.length);
    dailyImbalance += Math.round(loads.reduce((sum, load) => sum + Math.abs(load - average), 0));
  });
  const sameSubjectDaily = [...classSubjectDay.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  let dayDistribution = 0;
  input.assignments.forEach((assignment) => {
    const subject = input.subjects.find((v) => v.id === assignment.subjectId);
    if (subject?.preferDayDistribution === 'Y') {
      const actualDays = classSubjectDays.get(`${assignment.classId}:${assignment.subjectId}`)?.size ?? 0;
      dayDistribution += Math.max(0, Math.min(Number(assignment.weeklyHours), input.settings.operatingDays.length) - actualDays);
    }
  });
  const firstCounts = new Map<string, number>();
  const lastCounts = new Map<string, number>();
  entries.forEach((entry) => entryTeachers(entry).forEach((id) => {
    if (entry.period === 1) firstCounts.set(id, (firstCounts.get(id) ?? 0) + 1);
    if (entry.period === Number(input.settings.periodsByDay[entry.day] ?? 0)) lastCounts.set(id, (lastCounts.get(id) ?? 0) + 1);
  }));
  firstPeriodBias = [...firstCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 2), 0);
  lastPeriodBias = [...lastCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 2), 0);
  const gapValues = [...teacherGaps.values()];
  const gapAverage = gapValues.reduce((a, b) => a + b, 0) / Math.max(1, gapValues.length);
  const teacherFairness = Math.round(gapValues.reduce((sum, value) => sum + Math.abs(value - gapAverage), 0));
  const metrics: QualityMetrics = {
    consecutive3, consecutive4Plus, gaps, dailyImbalance, sameSubjectDaily,
    dayDistribution, firstPeriodBias, lastPeriodBias, preferredHits, dislikedHits, teacherFairness,
  };
  const rawPenalty =
    consecutive3 * Number(profile.consecutive3) + consecutive4Plus * Number(profile.consecutive4Plus) +
    gaps * Number(profile.gaps) + dailyImbalance * Number(profile.dailyImbalance) +
    sameSubjectDaily * Number(profile.sameSubjectDaily) + dayDistribution * Number(profile.dayDistribution) +
    firstPeriodBias * Number(profile.firstPeriodBias) + lastPeriodBias * Number(profile.lastPeriodBias) +
    preferredHits * Number(profile.preferredTimeReward) + dislikedHits * Number(profile.dislikedTime) +
    teacherFairness * Number(profile.teacherFairness);
  const qualityScore = Math.max(0, Math.min(100, 100 * Math.exp(-Math.max(0, rawPenalty) / Math.max(1, entries.length * 50))));
  return { metrics, rawPenalty: Math.round(rawPenalty * 10) / 10, qualityScore: Math.round(qualityScore * 10) / 10 };
}

export function preValidate(input: SolverInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const teacherIds = new Set(input.teachers.filter((v) => v.active !== 'N').map((v) => v.id));
  const classIds = new Set(input.classes.filter((v) => v.active !== 'N').map((v) => v.id));
  const subjectIds = new Set(input.subjects.map((v) => v.id));
  const roomIds = new Set(input.rooms.filter((v) => v.active !== 'N').map((v) => v.id));
  const slotCount = input.settings.operatingDays.reduce(
    (sum, day) => sum + Number(input.settings.periodsByDay[day] ?? 0), 0,
  );
  if (!slotCount) issues.push({ code: 'NO_SLOT', message: '학교 설정에 사용 가능한 수업 시간이 없습니다.' });
  for (const assignment of input.assignments) {
    if (!classIds.has(assignment.classId)) issues.push({ code: 'CLASS_NOT_FOUND', message: `${assignment.id}: 학급을 찾을 수 없습니다.` });
    if (!teacherIds.has(assignment.teacherId)) issues.push({ code: 'TEACHER_NOT_FOUND', message: `${assignment.id}: 교사를 찾을 수 없습니다.` });
    if (!subjectIds.has(assignment.subjectId)) issues.push({ code: 'SUBJECT_NOT_FOUND', message: `${assignment.id}: 과목을 찾을 수 없습니다.` });
    if (assignment.roomId && !roomIds.has(assignment.roomId)) issues.push({ code: 'ROOM_NOT_FOUND', message: `${assignment.id}: 특별실을 찾을 수 없습니다.` });
    if (!Number.isInteger(Number(assignment.weeklyHours)) || Number(assignment.weeklyHours) <= 0) {
      issues.push({ code: 'INVALID_HOURS', message: `${assignment.id}: 주당시수가 올바르지 않습니다.` });
    }
  }
  const classLoads = new Map<string, number>();
  const teacherLoads = new Map<string, number>();
  input.assignments.forEach((v) => {
    classLoads.set(v.classId, (classLoads.get(v.classId) ?? 0) + Number(v.weeklyHours));
    teacherLoads.set(v.teacherId, (teacherLoads.get(v.teacherId) ?? 0) + Number(v.weeklyHours));
  });
  classLoads.forEach((load, id) => {
    if (load > slotCount) issues.push({ code: 'CLASS_OVERLOAD', message: `${id}: 주당 ${load}시간이 전체 ${slotCount}시간을 초과합니다.` });
  });
  teacherLoads.forEach((load, id) => {
    if (load > slotCount) issues.push({ code: 'TEACHER_OVERLOAD', message: `${id}: 주당 ${load}시간이 전체 ${slotCount}시간을 초과합니다.` });
  });
  input.fixedLessons.filter((v) => v.active !== 'N').forEach((fixed) => {
    const assignment = input.assignments.find((v) => v.id === fixed.assignmentId);
    if (!assignment) issues.push({ code: 'FIXED_ASSIGNMENT_NOT_FOUND', message: `${fixed.id}: 고정할 수업배정을 찾을 수 없습니다.` });
    if (fixed.fixedType === '정확고정' && (!fixed.day || !fixed.period)) {
      issues.push({ code: 'INVALID_FIXED_SLOT', message: `${fixed.id}: 정확고정 요일과 교시가 필요합니다.` });
    }
  });
  input.lessonSets.forEach((set) => {
    if (values(set.classIds).some((id) => !classIds.has(id))) issues.push({ code: 'SET_CLASS_NOT_FOUND', message: `${set.id}: 대상 학급을 찾을 수 없습니다.` });
    const members = input.lessonSetMembers.filter((v) => v.setId === set.id);
    if (!members.length) issues.push({ code: 'EMPTY_SET', message: `${set.id}: 세트 구성이 없습니다.` });
  });
  return issues;
}

export function postValidate(input: SolverInput, entries: TimetableEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const validSlots = new Set<string>();
  input.settings.operatingDays.forEach((day) => {
    for (let period = 1; period <= Number(input.settings.periodsByDay[day] ?? 0); period += 1) {
      validSlots.add(key(day, period));
    }
  });
  const classSlots = new Set<string>();
  const teacherSlots = new Set<string>();
  const roomCounts = new Map<string, number>();
  const counts = new Map<string, number>();
  const teacherDayPeriods = new Map<string, number[]>();
  const teacherById = new Map(input.teachers.map((v) => [v.id, v]));
  const roomById = new Map(input.rooms.map((v) => [v.id, v]));
  const forbidden = new Set(input.teacherConstraints.filter((v) => v.active !== 'N' && v.constraintType === '불가').map((v) => `${v.teacherId}:${v.time}`));
  for (const entry of entries) {
    const slot = key(entry.day, entry.period);
    if (!validSlots.has(slot)) issues.push({ code: 'INVALID_SLOT', message: `${entry.assignmentId}: 존재하지 않는 시간입니다.` });
    entryClasses(entry).forEach((classId) => {
      const classSlot = `${classId}:${slot}`;
      if (classSlots.has(classSlot)) issues.push({ code: 'CLASS_CONFLICT', message: `${classId}: ${slot}에 수업이 중복됩니다.` });
      classSlots.add(classSlot);
    });
    entryTeachers(entry).forEach((teacherId) => {
      const teacherSlot = `${teacherId}:${slot}`;
      if (teacherSlots.has(teacherSlot)) issues.push({ code: 'TEACHER_CONFLICT', message: `${teacherId}: ${slot}에 수업이 중복됩니다.` });
      if (forbidden.has(teacherSlot)) issues.push({ code: 'TEACHER_UNAVAILABLE', message: `${teacherId}: ${slot}은 불가시간입니다.` });
      const workDays = values(teacherById.get(teacherId)?.workDays);
      if (workDays.length && !workDays.includes(entry.day)) issues.push({ code: 'TEACHER_NONWORKING_DAY', message: `${teacherId}: ${entry.day}요일은 근무일이 아닙니다.` });
      teacherSlots.add(teacherSlot);
      const dayKey = `${teacherId}:${entry.day}`;
      teacherDayPeriods.set(dayKey, [...(teacherDayPeriods.get(dayKey) ?? []), entry.period]);
    });
    entryRooms(entry).forEach((roomId) => {
      const room = roomById.get(roomId);
      const roomSlot = `${roomId}:${slot}`;
      const count = (roomCounts.get(roomSlot) ?? 0) + 1;
      roomCounts.set(roomSlot, count);
      if (count > Number(room?.capacity ?? 1)) issues.push({ code: 'ROOM_CONFLICT', message: `${roomId}: ${slot} 수용량을 초과합니다.` });
      const availableDays = values(room?.availableDays);
      if (availableDays.length && !availableDays.includes(entry.day)) issues.push({ code: 'ROOM_UNAVAILABLE_DAY', message: `${roomId}: ${entry.day}요일은 사용할 수 없습니다.` });
      if (values(room?.unavailableTimes).includes(slot)) issues.push({ code: 'ROOM_UNAVAILABLE_TIME', message: `${roomId}: ${slot}은 사용할 수 없습니다.` });
    });
    if (entry.kind !== 'set' && entry.kind !== 'joint') counts.set(entry.assignmentId, (counts.get(entry.assignmentId) ?? 0) + 1);
  }
  input.assignments.forEach((assignment) => {
    if ((counts.get(assignment.id) ?? 0) !== Number(assignment.weeklyHours)) {
      issues.push({ code: 'HOURS_MISMATCH', message: `${assignment.id}: 주당시수가 일치하지 않습니다.` });
    }
  });
  teacherDayPeriods.forEach((periods, dayKey) => {
    const teacherId = dayKey.split(':')[0];
    const teacher = teacherById.get(teacherId);
    const uniquePeriods = [...new Set(periods)].sort((a, b) => a - b);
    if (uniquePeriods.length > Number(teacher?.dailyMaxHours ?? 99)) {
      issues.push({ code: 'TEACHER_DAILY_MAX', message: `${teacherId}: 하루 최대시수를 초과합니다.` });
    }
    let consecutive = 1;
    let maximum = uniquePeriods.length ? 1 : 0;
    for (let index = 1; index < uniquePeriods.length; index += 1) {
      consecutive = uniquePeriods[index] === uniquePeriods[index - 1] + 1 ? consecutive + 1 : 1;
      maximum = Math.max(maximum, consecutive);
    }
    if (maximum > Number(teacher?.maxConsecutive ?? 99)) {
      issues.push({ code: 'TEACHER_MAX_CONSECUTIVE', message: `${teacherId}: 최대 연속수업 수를 초과합니다.` });
    }
  });
  input.fixedLessons.filter((v) => v.active !== 'N').forEach((fixed) => {
    const assignmentEntries = entries.filter((v) => v.assignmentId === fixed.assignmentId);
    const matches = assignmentEntries.some((v) =>
      fixed.fixedType === '정확고정' ? v.day === fixed.day && v.period === Number(fixed.period)
        : fixed.fixedType === '요일고정' ? v.day === fixed.day
          : fixed.fixedType === '교시고정' ? v.period === Number(fixed.period)
            : fixed.fixedType === '허용범위' ? values(fixed.allowedTimes).includes(key(v.day, v.period)) : false,
    );
    if (!matches) issues.push({ code: 'FIXED_LESSON_VIOLATION', message: `${fixed.id}: ${fixed.fixedType} 조건을 충족하지 않습니다.` });
  });
  input.assignments.filter((v) => Number(v.consecutivePeriods) > 1).forEach((assignment) => {
    const assigned = entries.filter((v) => v.assignmentId === assignment.id).sort((a, b) => a.period - b.period);
    const required = Number(assignment.consecutivePeriods);
    const consecutive = assigned.some((start) => Array.from({ length: required }, (_, i) => assigned.some((v) => v.day === start.day && v.period === start.period + i)).every(Boolean));
    if (!consecutive) issues.push({ code: 'CONSECUTIVE_VIOLATION', message: `${assignment.id}: ${required}교시 연속수업이 분리되었습니다.` });
  });
  input.lessonSets.forEach((set) => {
    const setEntries = entries.filter((v) => v.kind === 'set' && v.groupId === set.id);
    if (setEntries.length !== Number(set.weeklyCount) * Number(set.periodsPerSession)) {
      issues.push({ code: 'SET_COUNT_MISMATCH', message: `${set.id}: 세트수업 횟수가 일치하지 않습니다.` });
    }
  });
  input.jointLessons.filter((v) => !input.lessonSets.some((set) => set.id === v.linkedGroupId)).forEach((group) => {
    const groupEntries = entries.filter((v) => v.kind === 'joint' && v.groupId === group.id);
    if (groupEntries.length !== Number(group.weeklyCount) * Number(group.periodsPerSession)) {
      issues.push({ code: 'JOINT_COUNT_MISMATCH', message: `${group.id}: 공동·교차수업 횟수가 일치하지 않습니다.` });
    }
  });
  return issues;
}

export async function solveTimetable(
  input: SolverInput,
  signal: AbortSignal,
  onProgress: (progress: number, message: string) => void,
  profile?: WeightProfile,
): Promise<TimetableCandidate> {
  const preIssues = preValidate(input);
  if (preIssues.length) {
    return {
      id: crypto.randomUUID(), status: 'INVALID', createdAt: new Date().toISOString(),
      entries: [], validationIssues: preIssues,
      stats: { assignments: input.assignments.length, occurrences: 0, slots: 0 },
    };
  }
  const slots: TimetableSlot[] = input.settings.operatingDays.flatMap((day) =>
    Array.from({ length: Number(input.settings.periodsByDay[day] ?? 0) }, (_, i) => ({ day, period: i + 1 })),
  );
  const fixedByAssignment = new Map(input.fixedLessons.filter((v) => v.active !== 'N').map((v) => [v.assignmentId, v]));
  const units: SolverUnit[] = [];
  input.assignments.forEach((assignment) => {
    const periods = Math.max(1, Number(assignment.consecutivePeriods) || 1);
    const sessions = Math.ceil(Number(assignment.weeklyHours) / periods);
    for (let occurrence = 1; occurrence <= sessions; occurrence += 1) {
      const fixed = occurrence === 1 ? fixedByAssignment.get(assignment.id) : undefined;
      let fixedSlots: TimetableSlot[] | undefined;
      if (fixed?.fixedType === '정확고정') fixedSlots = [{ day: fixed.day, period: Number(fixed.period) }];
      else if (fixed?.fixedType === '요일고정') fixedSlots = slots.filter((v) => v.day === fixed.day);
      else if (fixed?.fixedType === '교시고정') fixedSlots = slots.filter((v) => v.period === Number(fixed.period));
      else if (fixed?.fixedType === '허용범위') fixedSlots = values(fixed.allowedTimes).map((v) => ({ day: v.split('-')[0], period: Number(v.split('-')[1]) }));
      units.push({
        id: assignment.id, kind: 'assignment', occurrence, periods,
        classIds: [assignment.classId], teacherIds: [assignment.teacherId],
        subjectIds: [assignment.subjectId], roomIds: assignment.roomId ? [assignment.roomId] : [],
        fixedSlots,
      });
    }
  });
  input.lessonSets.forEach((set) => {
    const members = input.lessonSetMembers.filter((v) => v.setId === set.id);
    for (let occurrence = 1; occurrence <= Number(set.weeklyCount); occurrence += 1) {
      units.push({
        id: set.id, kind: 'set', occurrence, periods: Number(set.periodsPerSession) || 1,
        classIds: values(set.classIds), teacherIds: members.map((v) => v.teacherId),
        subjectIds: members.map((v) => v.subjectId), roomIds: members.map((v) => v.roomId).filter(Boolean),
        allowedDays: values(set.allowedDays),
        fixedSlots: set.fixedTime ? values(set.fixedTime).map((v) => ({ day: v.split('-')[0], period: Number(v.split('-')[1]) })) : undefined,
      });
    }
  });
  input.jointLessons.filter((group) => !input.lessonSets.some((set) => set.id === group.linkedGroupId)).forEach((group) => {
    for (let occurrence = 1; occurrence <= Number(group.weeklyCount); occurrence += 1) {
      units.push({
        id: group.id, kind: 'joint', occurrence, periods: Number(group.periodsPerSession) || 1,
        classIds: values(group.classIds), teacherIds: values(group.teacherIds),
        subjectIds: values(group.subjectIds), roomIds: group.roomId ? [group.roomId] : [],
      });
    }
  });
  const teacherById = new Map(input.teachers.map((v) => [v.id, v]));
  const roomById = new Map(input.rooms.map((v) => [v.id, v]));
  const forbidden = new Set(input.teacherConstraints.filter((v) => v.active !== 'N' && v.constraintType === '불가').map((v) => `${v.teacherId}:${v.time}`));
  units.sort((a, b) => Number(Boolean(b.fixedSlots?.length)) - Number(Boolean(a.fixedSlots?.length)) ||
    (b.classIds.length + b.teacherIds.length + b.roomIds.length + b.periods) - (a.classIds.length + a.teacherIds.length + a.roomIds.length + a.periods));

  let best: TimetableCandidate | null = null;
  const maximumAttempts = profile ? 120 : 500;
  const startedAt = Date.now();
  const timeLimitMs = profile ? 5000 : 10000;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    if (signal.aborted) throw new DOMException('사용자가 생성을 중지했습니다.', 'AbortError');
    if (Date.now() - startedAt >= timeLimitMs && best) {
      best.terminationReason = 'time_limit';
      best.attempts = attempt;
      onProgress(100, `제한시간 종료 · 현재 최선 VALID 후보를 반환했습니다. Penalty ${best.rawPenalty}`);
      return best;
    }
    const entries: TimetableEntry[] = [];
    const classBusy = new Set<string>();
    const teacherBusy = new Set<string>();
    const roomBusy = new Map<string, number>();
    const classDayLoad = new Map<string, number>();
    const assignmentDayLoad = new Map<string, number>();
    const teacherDayLoad = new Map<string, number>();
    let failed = false;
    const rotated = slots.map((_, index) => slots[(index + attempt * 7) % slots.length]);
    for (let index = 0; index < units.length; index += 1) {
      const unit = units[index];
      const candidates = unit.fixedSlots?.length ? unit.fixedSlots : rotated;
      const available = candidates.filter((slot) => {
        if (unit.allowedDays?.length && !unit.allowedDays.includes(slot.day)) return false;
        const dayPeriods = Number(input.settings.periodsByDay[slot.day] ?? 0);
        if (slot.period + unit.periods - 1 > dayPeriods) return false;
        for (let offset = 0; offset < unit.periods; offset += 1) {
          const currentKey = key(slot.day, slot.period + offset);
          if (unit.classIds.some((id) => classBusy.has(`${id}:${currentKey}`))) return false;
          if (unit.teacherIds.some((id) => {
            const teacher = teacherById.get(id);
            const workDays = values(teacher?.workDays);
            const maxConsecutive = Number(teacher?.maxConsecutive ?? 99);
            let before = 0;
            while (teacherBusy.has(`${id}:${key(slot.day, slot.period - before - 1)}`)) before += 1;
            let after = 0;
            while (teacherBusy.has(`${id}:${key(slot.day, slot.period + unit.periods + after)}`)) after += 1;
            return teacherBusy.has(`${id}:${currentKey}`) || forbidden.has(`${id}:${currentKey}`) ||
              (workDays.length > 0 && !workDays.includes(slot.day)) ||
              (Number(teacherDayLoad.get(`${id}:${slot.day}`) ?? 0) + unit.periods > Number(teacher?.dailyMaxHours ?? 99)) ||
              (before + unit.periods + after > maxConsecutive);
          })) return false;
          if (unit.roomIds.some((id) => {
            const room = roomById.get(id);
            const availableDays = values(room?.availableDays);
            return (availableDays.length > 0 && !availableDays.includes(slot.day)) ||
              values(room?.unavailableTimes).includes(currentKey) ||
              Number(roomBusy.get(`${id}:${currentKey}`) ?? 0) >= Number(room?.capacity ?? 1);
          })) return false;
        }
        return true;
      }).sort((a, b) => {
        const duplicateA = assignmentDayLoad.get(`${unit.id}:${a.day}`) ?? 0;
        const duplicateB = assignmentDayLoad.get(`${unit.id}:${b.day}`) ?? 0;
        const loadA = Math.max(0, ...unit.classIds.map((id) => classDayLoad.get(`${id}:${a.day}`) ?? 0));
        const loadB = Math.max(0, ...unit.classIds.map((id) => classDayLoad.get(`${id}:${b.day}`) ?? 0));
        const optimizationTie = profile
          ? rank(`${attempt}:${unit.id}:${a.day}:${a.period}`) - rank(`${attempt}:${unit.id}:${b.day}:${b.period}`)
          : a.period - b.period;
        return duplicateA - duplicateB || loadA - loadB || optimizationTie;
      });
      const slot = available[0];
      if (!slot) { failed = true; break; }
      for (let offset = 0; offset < unit.periods; offset += 1) {
        const period = slot.period + offset;
        const slotKey = key(slot.day, period);
        entries.push({
          day: slot.day, period, occurrence: unit.occurrence, blockIndex: offset + 1,
          kind: unit.kind, groupId: unit.kind === 'assignment' ? undefined : unit.id,
          assignmentId: unit.kind === 'assignment' ? unit.id : '',
          classId: unit.classIds[0] ?? '', teacherId: unit.teacherIds[0] ?? '', subjectId: unit.subjectIds[0] ?? '',
          classIds: unit.classIds, teacherIds: unit.teacherIds, subjectIds: unit.subjectIds, roomIds: unit.roomIds,
          roomId: unit.roomIds[0] ?? '',
        });
        unit.classIds.forEach((id) => {
          classBusy.add(`${id}:${slotKey}`);
          classDayLoad.set(`${id}:${slot.day}`, (classDayLoad.get(`${id}:${slot.day}`) ?? 0) + 1);
        });
        unit.teacherIds.forEach((id) => {
          teacherBusy.add(`${id}:${slotKey}`);
          teacherDayLoad.set(`${id}:${slot.day}`, (teacherDayLoad.get(`${id}:${slot.day}`) ?? 0) + 1);
        });
        unit.roomIds.forEach((id) => roomBusy.set(`${id}:${slotKey}`, (roomBusy.get(`${id}:${slotKey}`) ?? 0) + 1));
      }
      assignmentDayLoad.set(`${unit.id}:${slot.day}`, (assignmentDayLoad.get(`${unit.id}:${slot.day}`) ?? 0) + unit.periods);
      if (index % 20 === 0) {
        onProgress(Math.min(99, Math.round(((attempt * units.length + index) / (maximumAttempts * units.length)) * 100)), profile ? 'VALID 후보를 비교하며 penalty를 최소화하고 있습니다.' : 'Hard Constraint를 만족하는 수업 블록을 배정하고 있습니다.');
        await pause();
      }
    }
    if (!failed) {
      const validationIssues = postValidate(input, entries);
      const quality = profile && !validationIssues.length ? evaluateQuality(input, entries, profile) : null;
      const current: TimetableCandidate = {
        id: crypto.randomUUID(), status: validationIssues.length ? 'INVALID' : 'VALID',
        createdAt: new Date().toISOString(), entries, validationIssues,
        stats: { assignments: input.assignments.length, occurrences: entries.length, slots: slots.length },
        profileId: profile?.id, profileName: profile?.name,
        profileSignature: profile ? profileSignature(profile) : undefined,
        rawPenalty: quality?.rawPenalty, qualityScore: quality?.qualityScore, metrics: quality?.metrics,
        attempts: attempt + 1,
        terminationReason: profile ? 'optimized' : 'first_feasible',
      };
      if (!profile) {
        onProgress(100, validationIssues.length ? '검증에서 오류를 발견했습니다.' : 'VALID Candidate를 생성했습니다.');
        return current;
      }
      if (!validationIssues.length && (!best || Number(current.rawPenalty) < Number(best.rawPenalty))) best = current;
      if (attempt % 5 === 0) {
        onProgress(Math.round(((attempt + 1) / maximumAttempts) * 100), `후보 ${attempt + 1}개 탐색 · 현재 최저 penalty ${best?.rawPenalty ?? '-'}`);
        await pause();
      }
    }
  }
  if (best) {
    onProgress(100, `최적 후보를 반환했습니다. Penalty ${best.rawPenalty}`);
    return best;
  }
  return {
    id: crypto.randomUUID(), status: 'INVALID', createdAt: new Date().toISOString(), entries: [],
    validationIssues: [{ code: 'NO_SOLUTION', message: '현재 조건으로 충돌 없는 시간표를 생성하지 못했습니다.' }],
    stats: { assignments: input.assignments.length, occurrences: units.reduce((sum, unit) => sum + unit.periods, 0), slots: slots.length },
    terminationReason: 'infeasible',
    diagnostics: [
      '학급·교사별 주당시수와 사용 가능한 Slot 수를 확인하세요.',
      '정확고정·허용범위 조건이 교사 불가시간 또는 특별실 불가시간과 충돌하는지 확인하세요.',
      '세트·공동·교차수업이 동시에 점유하는 학급·교사·특별실 조건을 확인하세요.',
      'Solver는 조건을 자동으로 완화하지 않습니다. 원인을 확인한 뒤 필요한 조건만 직접 조정하세요.',
    ],
  };
}
import type { BaseRecord } from './base-data-store';
import {
  evaluateQuality, postValidate, type SolverInput, type TimetableEntry,
  type ValidationIssue, type WeightProfile,
} from './timetable-solver';

export type TimetableLock = BaseRecord & {
  lockType: '수업' | '세트' | '교사' | '학급' | '요일';
  targetId: string;
  scope?: string;
  active: string;
};
export type EditImpact = {
  type: 'MOVE' | 'SWAP' | 'CHAIN' | 'REOPTIMIZE';
  description: string;
  before: TimetableEntry[];
  after: TimetableEntry[];
  teachers: string[];
  classes: string[];
  rooms: string[];
  changedEntries: number;
  hardBefore: number;
  hardAfter: number;
  newIssues: ValidationIssue[];
  scoreBefore?: number;
  scoreAfter?: number;
  scoreDelta?: number;
};
export type MoveCandidate = {
  day: string;
  period: number;
  valid: boolean;
  issues: ValidationIssue[];
  impact?: EditImpact;
  occupiedEntryId?: string;
};

const key = (day: string, period: number) => `${day}-${period}`;
const entryClasses = (entry: TimetableEntry) => entry.classIds?.length ? entry.classIds : [entry.classId];
const entryTeachers = (entry: TimetableEntry) => entry.teacherIds?.length ? entry.teacherIds : [entry.teacherId];
const entryRooms = (entry: TimetableEntry) => entry.roomIds?.length ? entry.roomIds : entry.roomId ? [entry.roomId] : [];
const entryId = (entry: TimetableEntry, index: number) =>
  String((entry as any).entryId ?? `${entry.kind ?? 'assignment'}:${entry.groupId || entry.assignmentId}:${entry.occurrence}:${index}`);

export function withEntryIds(entries: TimetableEntry[]): TimetableEntry[] {
  return entries.map((entry, index) => ({ ...entry, entryId: entryId(entry, index) } as TimetableEntry));
}

export function getEntryId(entry: TimetableEntry) {
  return String((entry as any).entryId ?? '');
}

export function isEntryLocked(entry: TimetableEntry, locks: TimetableLock[]) {
  if ((entry as any).locked) return true;
  const id = getEntryId(entry);
  return locks.some((lock) => lock.active !== 'N' && (
    (lock.lockType === '수업' && lock.targetId === id) ||
    (lock.lockType === '세트' && (lock.targetId === id || lock.targetId === entry.groupId)) ||
    (lock.lockType === '교사' && entryTeachers(entry).includes(lock.targetId)) ||
    (lock.lockType === '학급' && entryClasses(entry).includes(lock.targetId)) ||
    (lock.lockType === '요일' && entry.day === lock.targetId)
  ));
}

function blockFor(entries: TimetableEntry[], selectedId: string) {
  const selected = entries.find((entry) => getEntryId(entry) === selectedId);
  if (!selected) return [];
  if (selected.kind === 'set' || selected.kind === 'joint') {
    return entries.filter((entry) => entry.kind === selected.kind && entry.groupId === selected.groupId && entry.occurrence === selected.occurrence);
  }
  const sameOccurrence = entries.filter((entry) =>
    entry.assignmentId === selected.assignmentId && entry.occurrence === selected.occurrence,
  );
  return sameOccurrence.length ? sameOccurrence : [selected];
}

function moved(entries: TimetableEntry[], selectedId: string, day: string, period: number) {
  const block = blockFor(entries, selectedId);
  if (!block.length) return entries;
  const firstPeriod = Math.min(...block.map((entry) => entry.period));
  const blockIds = new Set(block.map(getEntryId));
  return entries.map((entry) => blockIds.has(getEntryId(entry))
    ? { ...entry, day, period: period + (entry.period - firstPeriod) }
    : entry);
}

function swapped(entries: TimetableEntry[], firstId: string, secondId: string) {
  const first = blockFor(entries, firstId);
  const second = blockFor(entries, secondId);
  if (!first.length || !second.length) return entries;
  const firstStart = Math.min(...first.map((entry) => entry.period));
  const secondStart = Math.min(...second.map((entry) => entry.period));
  const firstIds = new Set(first.map(getEntryId));
  const secondIds = new Set(second.map(getEntryId));
  return entries.map((entry) => firstIds.has(getEntryId(entry))
    ? { ...entry, day: second[0].day, period: secondStart + (entry.period - firstStart) }
    : secondIds.has(getEntryId(entry))
      ? { ...entry, day: first[0].day, period: firstStart + (entry.period - secondStart) }
      : entry);
}

const issueKey = (issue: ValidationIssue) => `${issue.code}:${issue.message}`;
const SNAPSHOT_COMPLETENESS_CODES = new Set(['HOURS_MISMATCH', 'SET_COUNT_MISMATCH', 'JOINT_COUNT_MISMATCH']);

export function editorPostValidate(input: SolverInput, entries: TimetableEntry[]) {
  return postValidate(input, entries).filter((issue) => !SNAPSHOT_COMPLETENESS_CODES.has(issue.code));
}

export function analyzeChange(
  input: SolverInput,
  before: TimetableEntry[],
  after: TimetableEntry[],
  profile: WeightProfile | undefined,
  type: EditImpact['type'],
  description: string,
): EditImpact {
  const beforeIssues = editorPostValidate(input, before);
  const afterIssues = editorPostValidate(input, after);
  const baseline = new Set(beforeIssues.map(issueKey));
  const newIssues = afterIssues.filter((issue) => !baseline.has(issueKey(issue)));
  const changed = after.filter((entry, index) => entry.day !== before[index]?.day || entry.period !== before[index]?.period);
  const qualityBefore = profile ? evaluateQuality(input, before, profile) : undefined;
  const qualityAfter = profile ? evaluateQuality(input, after, profile) : undefined;
  return {
    type, description, before, after,
    teachers: [...new Set(changed.flatMap(entryTeachers))],
    classes: [...new Set(changed.flatMap(entryClasses))],
    rooms: [...new Set(changed.flatMap(entryRooms))],
    changedEntries: changed.length,
    hardBefore: beforeIssues.length, hardAfter: afterIssues.length, newIssues,
    scoreBefore: qualityBefore?.qualityScore, scoreAfter: qualityAfter?.qualityScore,
    scoreDelta: qualityBefore && qualityAfter ? Math.round((qualityAfter.qualityScore - qualityBefore.qualityScore) * 10) / 10 : undefined,
  };
}

export function proposeMove(
  input: SolverInput,
  entries: TimetableEntry[],
  locks: TimetableLock[],
  selectedId: string,
  day: string,
  period: number,
  profile?: WeightProfile,
): EditImpact {
  const block = blockFor(entries, selectedId);
  if (!block.length) return analyzeChange(input, entries, entries, profile, 'MOVE', '수업을 찾을 수 없습니다.');
  if (block.some((entry) => isEntryLocked(entry, locks))) {
    const impact = analyzeChange(input, entries, entries, profile, 'MOVE', '잠금된 수업은 이동할 수 없습니다.');
    impact.newIssues = [{ code: 'LOCKED', message: block[0].kind === 'set' ? '잠금된 세트수업입니다.' : '잠금된 수업입니다.' }];
    return impact;
  }
  const after = moved(entries, selectedId, day, period);
  return analyzeChange(input, entries, after, profile, 'MOVE', `${block[0].day}-${Math.min(...block.map((v) => v.period))} → ${day}-${period}`);
}

export function proposeSwap(
  input: SolverInput,
  entries: TimetableEntry[],
  locks: TimetableLock[],
  firstId: string,
  secondId: string,
  profile?: WeightProfile,
): EditImpact {
  const blocks = [...blockFor(entries, firstId), ...blockFor(entries, secondId)];
  if (blocks.some((entry) => isEntryLocked(entry, locks))) {
    const impact = analyzeChange(input, entries, entries, profile, 'SWAP', '잠금된 수업은 교환할 수 없습니다.');
    impact.newIssues = [{ code: 'LOCKED', message: '교환 대상에 잠금된 수업이 포함되어 있습니다.' }];
    return impact;
  }
  return analyzeChange(input, entries, swapped(entries, firstId, secondId), profile, 'SWAP', '두 수업 1:1 교환');
}

export function findMoveCandidates(
  input: SolverInput,
  entries: TimetableEntry[],
  locks: TimetableLock[],
  selectedId: string,
  profile?: WeightProfile,
): MoveCandidate[] {
  const selected = entries.find((entry) => getEntryId(entry) === selectedId);
  if (!selected) return [];
  const classes = entryClasses(selected);
  const candidates: MoveCandidate[] = [];
  input.settings.operatingDays.forEach((day) => {
    for (let period = 1; period <= Number(input.settings.periodsByDay[day] ?? 0); period += 1) {
      if (selected.day === day && selected.period === period) continue;
      const occupied = entries.find((entry) => entry.day === day && entry.period === period && entryClasses(entry).some((id) => classes.includes(id)));
      const impact = occupied
        ? proposeSwap(input, entries, locks, selectedId, getEntryId(occupied), profile)
        : proposeMove(input, entries, locks, selectedId, day, period, profile);
      candidates.push({
        day, period, valid: impact.newIssues.length === 0, issues: impact.newIssues,
        impact, occupiedEntryId: occupied ? getEntryId(occupied) : undefined,
      });
    }
  });
  return candidates.sort((a, b) => Number(b.valid) - Number(a.valid) || Number(b.impact?.scoreDelta ?? -999) - Number(a.impact?.scoreDelta ?? -999));
}

export function findChainCandidates(
  input: SolverInput,
  entries: TimetableEntry[],
  locks: TimetableLock[],
  selectedId: string,
  profile?: WeightProfile,
) {
  const direct = findMoveCandidates(input, entries, locks, selectedId, profile);
  const results: EditImpact[] = [];
  for (const target of direct.filter((candidate) => candidate.occupiedEntryId).slice(0, 12)) {
    const occupiedId = target.occupiedEntryId!;
    const alternatives = findMoveCandidates(input, entries, locks, occupiedId, profile)
      .filter((candidate) => candidate.valid && !candidate.occupiedEntryId);
    for (const alternative of alternatives.slice(0, 2)) {
      const first = proposeMove(input, entries, locks, occupiedId, alternative.day, alternative.period, profile);
      const second = proposeMove(input, first.after, locks, selectedId, target.day, target.period, profile);
      const impact = analyzeChange(input, entries, second.after, profile, 'CHAIN',
        `${occupiedId} → ${alternative.day}-${alternative.period}, ${selectedId} → ${target.day}-${target.period}`);
      if (!impact.newIssues.length) results.push(impact);
    }
  }
  return results.sort((a, b) => Number(b.scoreDelta ?? -999) - Number(a.scoreDelta ?? -999)).slice(0, 8);
}
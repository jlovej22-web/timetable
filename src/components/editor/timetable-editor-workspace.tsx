import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Redo2, RotateCcw, Save, Search, Sparkles, Undo2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { baseDataStore, type BaseRecord } from '@/lib/base-data-store';
import {
  analyzeChange, editorPostValidate, findChainCandidates, findMoveCandidates, getEntryId, isEntryLocked,
  proposeMove, proposeSwap, withEntryIds, type EditImpact, type TimetableLock,
} from '@/lib/timetable-editor';
import { type SolverInput, type TimetableEntry, type WeightProfile } from '@/lib/timetable-solver';

const DEFAULT_PROFILE: WeightProfile = {
  id: 'EDITOR_DEFAULT', name: '편집 품질 기준', consecutive3: 8, consecutive4Plus: 30,
  gaps: 12, dailyImbalance: 8, sameSubjectDaily: 10, dayDistribution: 10,
  firstPeriodBias: 5, lastPeriodBias: 5, preferredTimeReward: -5, dislikedTime: 12, teacherFairness: 8,
};

export function TimetableEditorWorkspace({ projectId }: { projectId: string }) {
  const savedRef = useRef<TimetableEntry[]>([]);
  const savedLocksRef = useRef<TimetableLock[]>([]);
  const [input, setInput] = useState<SolverInput | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [locks, setLocks] = useState<TimetableLock[]>([]);
  const [profile, setProfile] = useState<WeightProfile>(DEFAULT_PROFILE);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [pending, setPending] = useState<EditImpact | null>(null);
  const [undoStack, setUndoStack] = useState<TimetableEntry[][]>([]);
  const [redoStack, setRedoStack] = useState<TimetableEntry[][]>([]);
  const [chains, setChains] = useState<EditImpact[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [scopeType, setScopeType] = useState<'학급' | '교사' | '요일' | '선택수업' | '전체'>('학급');
  const [scopeValue, setScopeValue] = useState('');
  const [swapTargetId, setSwapTargetId] = useState('');
  const [newLockType, setNewLockType] = useState<'교사' | '학급' | '요일'>('학급');
  const [newLockTarget, setNewLockTarget] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [settings, teachers, classes, subjects, assignments, rooms, lessonSets, lessonSetMembers,
        teacherConstraints, fixedLessons, jointLessons, profiles, workings, savedLocks] = await Promise.all([
        baseDataStore.getSettings(projectId), baseDataStore.list(projectId, 'teachers'),
        baseDataStore.list(projectId, 'classes'), baseDataStore.list(projectId, 'subjects'),
        baseDataStore.list(projectId, 'assignments'), baseDataStore.list(projectId, 'rooms'),
        baseDataStore.list(projectId, 'lesson_sets'), baseDataStore.list(projectId, 'lesson_set_members'),
        baseDataStore.list(projectId, 'teacher_constraints'), baseDataStore.list(projectId, 'fixed_lessons'),
        baseDataStore.list(projectId, 'joint_lessons'), baseDataStore.list(projectId, 'weight_profiles'),
        baseDataStore.list(projectId, 'working_timetables'), baseDataStore.list(projectId, 'timetable_locks'),
      ]);
      const solverInput = { settings, teachers, classes, subjects, assignments, rooms, lessonSets, lessonSetMembers, teacherConstraints, fixedLessons, jointLessons };
      const current: any = workings.find((value) => value.id === 'current');
      const initial = withEntryIds((current?.entries ?? []) as TimetableEntry[]);
      const mergedLocks = [...(savedLocks as TimetableLock[]), ...((current?.locks ?? []) as TimetableLock[])]
        .filter((lock, index, all) => all.findIndex((value) => value.id === lock.id) === index);
      setInput(solverInput);
      setEntries(initial);
      savedRef.current = initial;
      setLocks(mergedLocks);
      savedLocksRef.current = mergedLocks;
      setProfile((profiles[0] as WeightProfile | undefined) ?? DEFAULT_PROFILE);
      const firstClass = String(classes[0]?.id ?? '');
      setSelectedClassId(firstClass);
      setScopeValue(firstClass);
      setNewLockTarget(firstClass);
      setLoading(false);
    })();
  }, [projectId]);

  const subjectById = useMemo(() => new Map(input?.subjects.map((v) => [v.id, v]) ?? []), [input]);
  const teacherById = useMemo(() => new Map(input?.teachers.map((v) => [v.id, v]) ?? []), [input]);
  const selectedEntry = entries.find((entry) => getEntryId(entry) === selectedEntryId);
  const dirty = JSON.stringify(entries) !== JSON.stringify(savedRef.current) || JSON.stringify(locks) !== JSON.stringify(savedLocksRef.current);
  const candidates = useMemo(() =>
    input && selectedEntryId ? findMoveCandidates(input, entries, locks, selectedEntryId, profile) : [],
  [input, entries, locks, selectedEntryId, profile]);

  const proposeDrop = (day: string, period: number) => {
    if (!input || !selectedEntryId) return;
    setPending(proposeMove(input, entries, locks, selectedEntryId, day, period, profile));
  };

  const applyImpact = (impact: EditImpact) => {
    if (impact.newIssues.length) return;
    setUndoStack((previous) => [...previous, entries]);
    setRedoStack([]);
    setEntries(impact.after);
    setPending(null);
    setChains([]);
    toast.success(`${impact.type} 변경을 Working State에 적용했습니다.`);
  };

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setRedoStack((stack) => [...stack, entries]);
    setEntries(previous);
    setUndoStack((stack) => stack.slice(0, -1));
  };
  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setUndoStack((stack) => [...stack, entries]);
    setEntries(next);
    setRedoStack((stack) => stack.slice(0, -1));
  };
  const save = async () => {
    await baseDataStore.upsert(projectId, 'working_timetables', {
      id: 'current', appliedAt: new Date().toISOString(), source: 'editor', entries, locks,
    });
    savedRef.current = entries;
    savedLocksRef.current = locks;
    setUndoStack([]);
    setRedoStack([]);
    toast.success('Working Timetable을 SQLite Snapshot으로 저장했습니다.');
  };
  const discard = () => {
    setEntries(savedRef.current);
    setLocks(savedLocksRef.current);
    setUndoStack([]);
    setRedoStack([]);
    setPending(null);
    toast.info('저장하지 않은 변경을 취소했습니다.');
  };

  const toggleLock = () => {
    if (!selectedEntry) return;
    const id = getEntryId(selectedEntry);
    const localId = `LOCAL-${id}`;
    if (locks.some((lock) => lock.id === localId)) setLocks((values) => values.filter((lock) => lock.id !== localId));
    else setLocks((values) => [...values, { id: localId, lockType: selectedEntry.kind === 'set' ? '세트' : '수업', targetId: id, scope: '단일수업', active: 'Y' }]);
  };

  const addScopeLock = () => {
    if (!newLockTarget) return;
    const id = `LOCAL-${newLockType}-${newLockTarget}`;
    if (locks.some((lock) => lock.id === id || (lock.active !== 'N' && lock.lockType === newLockType && lock.targetId === newLockTarget))) {
      toast.info('이미 적용된 잠금입니다.');
      return;
    }
    setLocks((values) => [...values, {
      id, lockType: newLockType, targetId: newLockTarget, scope: '전체시간표',
      description: `${newLockType} 편집 잠금`, active: 'Y',
    } as TimetableLock]);
  };

  const searchChains = () => {
    if (!input || !selectedEntryId) return;
    const found = findChainCandidates(input, entries, locks, selectedEntryId, profile);
    setChains(found);
    if (!found.length) toast.info('현재 조건에서 안전한 2단계 연쇄교환 후보가 없습니다.');
  };

  const proposeSelectedSwap = () => {
    if (!input || !selectedEntryId || !swapTargetId) return;
    setPending(proposeSwap(input, entries, locks, selectedEntryId, swapTargetId, profile));
  };

  const reoptimize = async () => {
    if (!input) return;
    setOptimizing(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    let working = entries;
    const eligible = entries.filter((entry) => {
      if (isEntryLocked(entry, locks)) return false;
      if (scopeType === '학급') return (entry.classIds?.length ? entry.classIds : [entry.classId]).includes(scopeValue);
      if (scopeType === '교사') return (entry.teacherIds?.length ? entry.teacherIds : [entry.teacherId]).includes(scopeValue);
      if (scopeType === '요일') return entry.day === scopeValue;
      if (scopeType === '선택수업') return getEntryId(entry) === selectedEntryId;
      return true;
    });
    const handled = new Set<string>();
    for (const entry of eligible.slice(0, 40)) {
      const id = getEntryId(entry);
      if (handled.has(id)) continue;
      handled.add(id);
      const options = findMoveCandidates(input, working, locks, id, profile)
        .filter((value) => value.valid && !value.occupiedEntryId && Number(value.impact?.scoreDelta ?? 0) > 0);
      if (options[0]?.impact) working = options[0].impact.after;
    }
    const impact = analyzeChange(input, entries, working, profile, 'REOPTIMIZE', `${scopeType} 범위 부분 재최적화`);
    setOptimizing(false);
    if (!impact.changedEntries) toast.info('현재보다 품질점수가 높은 부분 재배치 후보가 없습니다.');
    else setPending(impact);
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">편집용 Snapshot을 불러오는 중...</div>;
  if (!input || !entries.length) return <div className="rounded-xl border bg-card p-10 text-center"><h2 className="font-semibold">편집할 Working Timetable이 없습니다.</h2><p className="mt-2 text-sm text-muted-foreground">Candidate를 적용하거나 8단계 Excel의 현재시간표를 Import하세요.</p></div>;

  const maxPeriods = Math.max(...input.settings.operatingDays.map((day) => Number(input.settings.periodsByDay[day] ?? 0)));
  const classEntries = entries.filter((entry) => (entry.classIds?.length ? entry.classIds : [entry.classId]).includes(selectedClassId));
  const selectedLocked = selectedEntry ? isEntryLocked(selectedEntry, locks) : false;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold">Working Timetable 편집</h2><p className="mt-1 text-sm text-muted-foreground">변경은 메모리에만 적용됩니다. 저장 버튼을 눌러야 SQLite Snapshot이 변경됩니다.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!undoStack.length} onClick={undo}><Undo2 className="mr-2 h-4 w-4" />Undo</Button>
              <Button variant="outline" disabled={!redoStack.length} onClick={redo}><Redo2 className="mr-2 h-4 w-4" />Redo</Button>
              <Button variant="outline" disabled={!dirty} onClick={discard}><RotateCcw className="mr-2 h-4 w-4" />변경 취소</Button>
              <Button disabled={!dirty} onClick={save}><Save className="mr-2 h-4 w-4" />명시적 저장</Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setScopeValue(e.target.value); }}>
              {input.classes.map((value) => <option key={value.id} value={value.id}>{value.displayName || value.id}</option>)}
            </select>
            <span className={dirty ? 'rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800' : 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800'}>{dirty ? '저장되지 않은 변경' : '저장본과 동일'}</span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs">Hard 위반 {editorPostValidate(input, entries).length}건</span>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[850px] table-fixed text-sm">
              <thead className="bg-muted/60"><tr><th className="w-14 p-2">교시</th>{input.settings.operatingDays.map((day) => <th key={day} className="p-2">{day}</th>)}</tr></thead>
              <tbody>{Array.from({ length: maxPeriods }, (_, index) => index + 1).map((period) => <tr key={period} className="border-t">
                <th className="bg-muted/30 p-2">{period}</th>
                {input.settings.operatingDays.map((day) => {
                  if (period > Number(input.settings.periodsByDay[day] ?? 0)) return <td key={day} className="bg-muted/40" />;
                  const entry = classEntries.find((value) => value.day === day && value.period === period);
                  const id = entry ? getEntryId(entry) : '';
                  const locked = entry ? isEntryLocked(entry, locks) : false;
                  return <td key={day} className="h-16 border-l p-1" onDragOver={(event) => event.preventDefault()} onDrop={() => proposeDrop(day, period)}>
                    {entry && <button
                      draggable={!locked}
                      onDragStart={() => setSelectedEntryId(id)}
                      onClick={() => setSelectedEntryId(id)}
                      className={`h-full w-full rounded-md p-2 text-center transition ${selectedEntryId === id ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' : locked ? 'bg-amber-100 text-amber-900' : 'bg-primary/10 hover:bg-primary/20'}`}
                    >
                      <span className="block font-medium">{entry.kind === 'set' ? `[SET] ${entry.groupId}` : subjectById.get(entry.subjectId)?.name ?? entry.subjectId}</span>
                      <span className="block text-xs opacity-75">{(entry.teacherIds?.length ? entry.teacherIds : [entry.teacherId]).map((teacherId) => teacherById.get(teacherId)?.name ?? teacherId).join(', ')}</span>
                      {locked && <Lock className="mx-auto mt-1 h-3 w-3" />}
                    </button>}
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between"><h3 className="font-semibold">이동 가능한 시간</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!selectedEntry} onClick={toggleLock}>{selectedLocked ? <Unlock className="mr-1 h-4 w-4" /> : <Lock className="mr-1 h-4 w-4" />}잠금 전환</Button>
                <Button size="sm" variant="outline" disabled={!selectedEntry} onClick={searchChains}><Search className="mr-1 h-4 w-4" />2단계 연쇄교환</Button>
              </div>
            </div>
            {!selectedEntry ? <p className="mt-4 text-sm text-muted-foreground">시간표에서 수업을 선택하세요.</p> :
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {candidates.slice(0, 20).map((candidate) => <button key={`${candidate.day}-${candidate.period}`} disabled={!candidate.valid} onClick={() => candidate.impact && setPending(candidate.impact)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm ${candidate.valid ? 'hover:bg-muted' : 'cursor-not-allowed opacity-45'}`}>
                  <span>{candidate.day}-{candidate.period} {candidate.occupiedEntryId ? '· 1:1 교환' : '· 이동'}</span>
                  <span className={candidate.valid ? 'text-emerald-700' : 'text-destructive'}>{candidate.valid ? `VALID · Δ ${candidate.impact?.scoreDelta ?? 0}` : candidate.issues[0]?.message}</span>
                </button>)}
              </div>}
            {chains.length > 0 && <div className="mt-4 border-t pt-4"><p className="mb-2 text-sm font-medium">2단계 연쇄교환 후보</p>{chains.map((impact, index) => <button key={index} onClick={() => setPending(impact)} className="mb-2 w-full rounded-lg bg-emerald-50 p-3 text-left text-sm text-emerald-900">{impact.description} · Score Δ {impact.scoreDelta}</button>)}</div>}
            {selectedEntry && <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">1:1 교환 대상 직접 선택</p>
              <div className="flex gap-2">
                <select className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm" value={swapTargetId} onChange={(event) => setSwapTargetId(event.target.value)}>
                  <option value="">교환할 수업 선택</option>
                  {entries.filter((entry) => getEntryId(entry) !== selectedEntryId).map((entry) => <option key={getEntryId(entry)} value={getEntryId(entry)}>{getEntryId(entry)} · {entry.day}-{entry.period}</option>)}
                </select>
                <Button size="sm" variant="outline" disabled={!swapTargetId} onClick={proposeSelectedSwap}>교환 분석</Button>
              </div>
            </div>}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h3 className="font-semibold">부분 재최적화</h3>
            <p className="mt-1 text-sm text-muted-foreground">선택 범위의 잠금되지 않은 수업만 재배치합니다.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={scopeType} onChange={(e) => {
                const value = e.target.value as typeof scopeType;
                setScopeType(value);
                if (value === '학급') setScopeValue(String(input.classes[0]?.id ?? ''));
                else if (value === '교사') setScopeValue(String(input.teachers[0]?.id ?? ''));
                else if (value === '요일') setScopeValue(input.settings.operatingDays[0] ?? '');
              }}>
                {['학급', '교사', '요일', '선택수업', '전체'].map((value) => <option key={value}>{value}</option>)}
              </select>
              {scopeType === '학급' && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>{input.classes.map((v) => <option key={v.id} value={v.id}>{v.displayName || v.id}</option>)}</select>}
              {scopeType === '교사' && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>{input.teachers.map((v) => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}</select>}
              {scopeType === '요일' && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={scopeValue} onChange={(e) => setScopeValue(e.target.value)}>{input.settings.operatingDays.map((v) => <option key={v}>{v}</option>)}</select>}
            </div>
            <Button className="mt-4" disabled={optimizing || (scopeType === '선택수업' && !selectedEntry)} onClick={reoptimize}><Sparkles className="mr-2 h-4 w-4" />{optimizing ? '재최적화 중...' : '범위 재최적화'}</Button>
            <div className="mt-5 border-t pt-4">
              <h4 className="text-sm font-semibold">교사·학급·요일 잠금</h4>
              <div className="mt-3 grid grid-cols-[110px_1fr_auto] gap-2">
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={newLockType} onChange={(event) => {
                  const type = event.target.value as typeof newLockType;
                  setNewLockType(type);
                  setNewLockTarget(type === '교사' ? String(input.teachers[0]?.id ?? '') : type === '학급' ? String(input.classes[0]?.id ?? '') : input.settings.operatingDays[0] ?? '');
                }}>
                  <option>교사</option><option>학급</option><option>요일</option>
                </select>
                <select className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm" value={newLockTarget} onChange={(event) => setNewLockTarget(event.target.value)}>
                  {newLockType === '교사' && input.teachers.map((value) => <option key={value.id} value={value.id}>{value.name || value.id}</option>)}
                  {newLockType === '학급' && input.classes.map((value) => <option key={value.id} value={value.id}>{value.displayName || value.id}</option>)}
                  {newLockType === '요일' && input.settings.operatingDays.map((value) => <option key={value}>{value}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={addScopeLock}>잠금</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {locks.filter((lock) => lock.active !== 'N').map((lock) => <span key={lock.id} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
                  {lock.lockType} · {lock.targetId}
                  <button className="ml-1 font-bold" onClick={() => setLocks((values) => values.filter((value) => value.id !== lock.id))}>×</button>
                </span>)}
              </div>
            </div>
          </section>
        </div>

        {pending && <ImpactPanel impact={pending} onApply={() => applyImpact(pending)} onCancel={() => setPending(null)} />}
      </div>
    </div>
  );
}

function ImpactPanel({ impact, onApply, onCancel }: { impact: EditImpact; onApply: () => void; onCancel: () => void }) {
  const valid = impact.newIssues.length === 0;
  return <section className={`rounded-xl border p-5 shadow-sm ${valid ? 'border-emerald-300 bg-emerald-50' : 'border-destructive/30 bg-destructive/5'}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-semibold">적용 전 영향분석 · {impact.type}</h3><p className="mt-1 text-sm">{impact.description}</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={onCancel}>취소</Button><Button disabled={!valid} onClick={onApply}>Working State에 적용</Button></div>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Info label="변경 수업" value={`${impact.changedEntries}개`} /><Info label="Hard 위반" value={`${impact.hardBefore} → ${impact.hardAfter}`} />
      <Info label="품질점수" value={`${impact.scoreBefore ?? '-'} → ${impact.scoreAfter ?? '-'}`} /><Info label="Score Δ" value={String(impact.scoreDelta ?? '-')} />
      <Info label="영향 교사" value={impact.teachers.join(', ') || '-'} /><Info label="영향 학급" value={impact.classes.join(', ') || '-'} />
      <Info label="영향 특별실" value={impact.rooms.join(', ') || '-'} /><Info label="판정" value={valid ? 'VALID' : 'INVALID'} />
    </div>
    {!valid && <div className="mt-3 space-y-2">{impact.newIssues.map((issue) => <p key={`${issue.code}-${issue.message}`} className="rounded-md bg-background p-2 text-sm text-destructive">{issue.message}</p>)}</div>}
  </section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-background/80 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}
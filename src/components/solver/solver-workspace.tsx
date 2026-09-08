import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Play, ShieldCheck, Square, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { baseDataStore } from '@/lib/base-data-store';
import {
  postValidate, preValidate, solveTimetable, type SolverInput, type TimetableCandidate, type WeightProfile,
} from '@/lib/timetable-solver';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
type DesktopSolver = {
  available: () => Promise<boolean>;
  solve: (input: SolverInput, profile?: WeightProfile) => Promise<unknown>;
  cancel: () => Promise<boolean>;
  onProgress: (listener: (progress: { progress: number; message: string }) => void) => () => void;
};

const desktopSolver = () => (window as Window & {
  schoolTimetable?: { solver?: DesktopSolver };
}).schoolTimetable?.solver;

export function SolverWorkspace({ projectId }: { projectId: string }) {
  const controllerRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState<SolverInput | null>(null);
  const [candidate, setCandidate] = useState<TimetableCandidate | null>(null);
  const [candidates, setCandidates] = useState<TimetableCandidate[]>([]);
  const [profiles, setProfiles] = useState<WeightProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [working, setWorking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [manualIssues, setManualIssues] = useState<any[] | null>(null);

  const load = async () => {
    setLoading(true);
    const [settings, teachers, classes, subjects, assignments, rooms, lessonSets, lessonSetMembers, teacherConstraints, fixedLessons, jointLessons, weightProfiles, savedCandidates, workings] = await Promise.all([
      baseDataStore.getSettings(projectId),
      baseDataStore.list(projectId, 'teachers'),
      baseDataStore.list(projectId, 'classes'),
      baseDataStore.list(projectId, 'subjects'),
      baseDataStore.list(projectId, 'assignments'),
      baseDataStore.list(projectId, 'rooms'),
      baseDataStore.list(projectId, 'lesson_sets'),
      baseDataStore.list(projectId, 'lesson_set_members'),
      baseDataStore.list(projectId, 'teacher_constraints'),
      baseDataStore.list(projectId, 'fixed_lessons'),
      baseDataStore.list(projectId, 'joint_lessons'),
      baseDataStore.list(projectId, 'weight_profiles'),
      baseDataStore.list(projectId, 'timetable_candidates'),
      baseDataStore.list(projectId, 'working_timetables'),
    ]);
    setInput({ settings, teachers, classes, subjects, assignments, rooms, lessonSets, lessonSetMembers, teacherConstraints, fixedLessons, jointLessons });
    const orderedCandidates = (savedCandidates as TimetableCandidate[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setCandidates(orderedCandidates);
    setCandidate(orderedCandidates[0] ?? null);
    setProfiles(weightProfiles as WeightProfile[]);
    setSelectedProfileId((current) => current || String(weightProfiles[0]?.id ?? ''));
    setWorking(workings.find((v) => v.id === 'current') ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [projectId]);

  const preIssues = useMemo(() => input ? preValidate(input) : [], [input]);
  const classById = useMemo(() => new Map(input?.classes.map((v) => [v.id, v]) ?? []), [input]);
  const subjectById = useMemo(() => new Map(input?.subjects.map((v) => [v.id, v]) ?? []), [input]);
  const teacherById = useMemo(() => new Map(input?.teachers.map((v) => [v.id, v]) ?? []), [input]);
  const selectedProfile = profiles.find((v) => v.id === selectedProfileId);

  const generate = async () => {
    if (!input || preIssues.length) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setProgress(0);
    setProgressMessage('Solver를 준비하고 있습니다.');
    const engine = desktopSolver();
    let removeProgressListener: (() => void) | undefined;
    const cancelEngine = () => { if (engine) void engine.cancel(); };
    controller.signal.addEventListener('abort', cancelEngine, { once: true });
    try {
      let result: TimetableCandidate;
      if (engine && await engine.available()) {
        removeProgressListener = engine.onProgress(({ progress: value, message }) => {
          setProgress(value);
          setProgressMessage(message);
        });
        const response = await engine.solve(input, selectedProfile);
        if (!isTimetableCandidate(response)) throw new Error('패키지 Solver 엔진이 호환되지 않는 Candidate를 반환했습니다.');
        result = response;
      } else {
        result = await solveTimetable(input, controller.signal, (value, message) => {
          setProgress(value);
          setProgressMessage(message);
        }, selectedProfile);
      }
      setCandidate(result);
      setCandidates((previous) => [result, ...previous]);
      setManualIssues(null);
      await baseDataStore.upsert(projectId, 'timetable_candidates', result);
      if (result.status === 'VALID') toast.success('VALID Candidate를 생성했습니다.');
      else toast.error('시간표를 생성하지 못했습니다. 검증 결과를 확인하세요.');
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        toast.info('시간표 생성을 안전하게 중지했습니다.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Solver 실행에 실패했습니다.');
      }
    } finally {
      removeProgressListener?.();
      controller.signal.removeEventListener('abort', cancelEngine);
      controllerRef.current = null;
      setRunning(false);
    }
  };

  const applyCandidate = async () => {
    if (!candidate || candidate.status !== 'VALID') return;
    const value = {
      id: 'current',
      candidateId: candidate.id,
      appliedAt: new Date().toISOString(),
      entries: candidate.entries,
    };
    await baseDataStore.upsert(projectId, 'working_timetables', value);
    setWorking(value);
    toast.success('Candidate를 작업 시간표에 적용했습니다.');
  };

  const validateAll = () => {
    if (!candidate || !input) return;
    const issues = postValidate(input, candidate.entries);
    setManualIssues(issues);
    if (issues.length === 0) toast.success('전체 Hard Constraint 위반이 0건입니다.');
    else toast.error(`Hard Constraint 위반 ${issues.length}건을 발견했습니다.`);
  };

  const updateProfile = (field: string, value: number) => {
    setProfiles((previous) => previous.map((profile) => profile.id === selectedProfileId ? { ...profile, [field]: value } : profile));
  };

  const saveCustomProfile = async () => {
    if (!selectedProfile) return;
    await baseDataStore.upsert(projectId, 'weight_profiles', selectedProfile);
    toast.success('사용자 가중치 프로필을 저장했습니다. 기존 Candidate 점수는 자동 비교하지 않습니다.');
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">Solver 데이터를 불러오는 중...</div>;
  if (!input) return null;

  const groupedClasses = input.classes.filter((v) => v.active !== 'N');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /><h2 className="text-lg font-semibold">시간표 자동생성 Solver</h2></div>
              <p className="mt-2 text-sm text-muted-foreground">Pre Validation 후 충돌 없는 Candidate를 생성합니다. 작업 시간표는 사용자가 적용하기 전까지 변경되지 않습니다.</p>
            </div>
            <div className="flex gap-2">
              {running ? (
                <Button variant="destructive" onClick={() => controllerRef.current?.abort()}><Square className="mr-2 h-4 w-4" />생성 중지</Button>
              ) : (
                <Button disabled={preIssues.length > 0 || input.assignments.length === 0} onClick={generate}><Play className="mr-2 h-4 w-4" />Candidate 생성</Button>
              )}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="학급" value={input.classes.length} />
            <Stat label="교사" value={input.teachers.length} />
            <Stat label="수업배정" value={input.assignments.length} />
            <Stat label="전체 주당수업" value={input.assignments.reduce((sum, v) => sum + Number(v.weeklyHours), 0)} />
          </div>
          {profiles.length > 0 && (
            <div className="mt-5 rounded-lg border bg-background p-4">
              <label className="mb-2 block text-sm font-medium">가중치 프로필</label>
              <select className="h-10 w-full max-w-sm rounded-md border bg-background px-3 text-sm" value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
              <p className="mt-2 text-xs text-muted-foreground">같은 프로젝트와 동일한 가중치 프로필로 생성한 Candidate끼리만 점수를 직접 비교할 수 있습니다.</p>
              {selectedProfile?.id === 'W004' && (
                <div className="mt-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {PROFILE_FIELDS.map(([field, label]) => (
                      <label key={field} className="text-xs text-muted-foreground">{label}
                        <input type="number" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground" value={Number(selectedProfile[field] ?? 0)} onChange={(event) => updateProfile(field, Number(event.target.value))} />
                      </label>
                    ))}
                  </div>
                  <Button className="mt-3" size="sm" variant="outline" onClick={saveCustomProfile}>사용자설정 저장</Button>
                </div>
              )}
            </div>
          )}
          {running && (
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-sm"><span>{progressMessage}</span><span>{progress}%</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(progress, 2)}%` }} /></div>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Pre Validator</h3>
            <StatusBadge valid={preIssues.length === 0} validText="PASS" invalidText={`${preIssues.length}건 오류`} />
          </div>
          {preIssues.length === 0 ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />명백한 불가능 조건이 없습니다.</p>
          ) : preIssues.map((issue) => (
            <p key={`${issue.code}-${issue.message}`} className="mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><TriangleAlert className="h-4 w-4" />{issue.message}</p>
          ))}
        </section>

        {candidate && (
          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2"><h3 className="font-semibold">Candidate 미리보기</h3><StatusBadge valid={candidate.status === 'VALID'} validText="VALID" invalidText="INVALID" /></div>
                <p className="mt-1 text-sm text-muted-foreground">배정 {candidate.stats.assignments}건 · 수업 {candidate.entries.length}개 · 생성 {new Date(candidate.createdAt).toLocaleString('ko-KR')}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={running} onClick={validateAll}>전체 시간표 검증</Button>
                <Button disabled={candidate.status !== 'VALID' || running} onClick={applyCandidate}>이 시간표 적용</Button>
              </div>
            </div>
            {manualIssues && (
              <div className={manualIssues.length ? 'mb-4 rounded-lg bg-destructive/10 p-4 text-sm text-destructive' : 'mb-4 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800'}>
                {manualIssues.length ? `Hard Constraint 위반 ${manualIssues.length}건` : '전체 Hard Constraint 위반 0건 · VALID'}
              </div>
            )}
            {candidate.metrics && (
              <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="품질점수" value={candidate.qualityScore ?? 0} />
                <Stat label="Raw Penalty" value={candidate.rawPenalty ?? 0} />
                <Stat label="중간공강" value={candidate.metrics.gaps} />
                <Stat label="3연속 / 4연속+" value={`${candidate.metrics.consecutive3} / ${candidate.metrics.consecutive4Plus}`} />
                <Stat label="선호시간 충족" value={candidate.metrics.preferredHits} />
                <Stat label="비선호시간 배정" value={candidate.metrics.dislikedHits} />
                <Stat label="요일분산 위반" value={candidate.metrics.dayDistribution} />
                <Stat label="프로필" value={candidate.profileName ?? '-'} />
              </div>
            )}
            {candidate.validationIssues.length > 0 ? (
              <div className="space-y-2">
                {candidate.validationIssues.map((v) => <p key={`${v.code}-${v.message}`} className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{v.message}</p>)}
                {candidate.diagnostics?.map((message) => <p key={message} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>)}
              </div>
            ) : (
              <div className="space-y-6">
                {groupedClasses.map((schoolClass) => (
                  <ClassTimetable
                    key={schoolClass.id}
                    schoolClass={schoolClass}
                    entries={candidate.entries.filter((v) => (v.classIds?.length ? v.classIds : [v.classId]).includes(schoolClass.id))}
                    settings={input.settings}
                    subjectById={subjectById}
                    teacherById={teacherById}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {candidates.some((v) => v.metrics) && (
          <CandidateComparison candidates={candidates.filter((v) => v.metrics).slice(0, 8)} onSelect={setCandidate} />
        )}

        <section className="rounded-xl border bg-card px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div><p className="font-medium">현재 작업 시간표</p><p className="text-sm text-muted-foreground">{working ? `${working.entries.length}개 수업 · ${new Date(working.appliedAt).toLocaleString('ko-KR')} 적용` : '아직 적용된 시간표가 없습니다.'}</p></div>
            <StatusBadge valid={Boolean(working)} validText="적용됨" invalidText="미적용" />
          </div>
        </section>
      </div>
    </div>
  );
}

function isTimetableCandidate(value: unknown): value is TimetableCandidate {
  const candidate = value as Partial<TimetableCandidate> | null;
  return Boolean(candidate && (candidate.status === 'VALID' || candidate.status === 'INVALID')
    && Array.isArray(candidate.entries) && Array.isArray(candidate.validationIssues)
    && candidate.stats && typeof candidate.id === 'string' && typeof candidate.createdAt === 'string');
}

const PROFILE_FIELDS: [string, string][] = [
  ['consecutive3', '3연속'], ['consecutive4Plus', '4연속 이상'], ['gaps', '중간공강'],
  ['dailyImbalance', '일일수업 불균형'], ['sameSubjectDaily', '동일과목 하루중복'],
  ['dayDistribution', '요일분산'], ['firstPeriodBias', '1교시 편중'], ['lastPeriodBias', '마지막교시 편중'],
  ['preferredTimeReward', '선호시간 보상'], ['dislikedTime', '비선호시간'], ['teacherFairness', '교사 형평성'],
];

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg border bg-background p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function CandidateComparison({ candidates, onSelect }: { candidates: TimetableCandidate[]; onSelect: (candidate: TimetableCandidate) => void }) {
  const signatures = new Set(candidates.map((v) => v.profileSignature));
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <h3 className="font-semibold">Candidate A/B/C 비교</h3>
      {signatures.size > 1 && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">가중치 프로필이 다른 Candidate의 품질점수는 직접 비교할 수 없습니다.</p>}
      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="bg-muted/60"><tr>{['후보', '프로필', '점수', 'Penalty', '공강', '3연속', '4연속+', '선호', '비선호', ''].map((v) => <th key={v} className="p-3 text-left">{v}</th>)}</tr></thead>
          <tbody>{candidates.map((value, index) => <tr key={value.id} className="border-t">
            <td className="p-3 font-medium">{String.fromCharCode(65 + index)}안</td><td className="p-3">{value.profileName}</td>
            <td className="p-3 font-semibold text-primary">{value.qualityScore}</td><td className="p-3">{value.rawPenalty}</td>
            <td className="p-3">{value.metrics?.gaps}</td><td className="p-3">{value.metrics?.consecutive3}</td>
            <td className="p-3">{value.metrics?.consecutive4Plus}</td><td className="p-3">{value.metrics?.preferredHits}</td>
            <td className="p-3">{value.metrics?.dislikedHits}</td><td className="p-3"><Button size="sm" variant="ghost" onClick={() => onSelect(value)}>미리보기</Button></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ valid, validText, invalidText }: { valid: boolean; validText: string; invalidText: string }) {
  return <span className={valid ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800' : 'rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive'}>{valid ? validText : invalidText}</span>;
}

function ClassTimetable({ schoolClass, entries, settings, subjectById, teacherById }: any) {
  const bySlot = new Map(entries.map((v: any) => [`${v.day}-${v.period}`, v]));
  const maxPeriods = Math.max(...settings.operatingDays.map((day: string) => Number(settings.periodsByDay[day] ?? 0)));
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{schoolClass.displayName || `${schoolClass.grade}-${schoolClass.classNumber}`}</h4>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <thead className="bg-muted/60"><tr><th className="w-14 p-2">교시</th>{settings.operatingDays.map((day: string) => <th key={day} className="p-2">{day}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((period) => (
              <tr key={period} className="border-t">
                <th className="bg-muted/30 p-2">{period}</th>
                {settings.operatingDays.map((day: string) => {
                  if (period > Number(settings.periodsByDay[day] ?? 0)) return <td key={day} className="bg-muted/40 p-2 text-center text-muted-foreground">—</td>;
                  const entry: any = bySlot.get(`${day}-${period}`);
                  return <td key={day} className="h-14 border-l p-2 text-center">{entry ? <><p className="font-medium">{entry.kind === 'set' ? `세트 · ${entry.groupId}` : entry.kind === 'joint' ? `${entry.groupId}` : subjectById.get(entry.subjectId)?.name ?? entry.subjectId}</p><p className="text-xs text-muted-foreground">{(entry.teacherIds?.length ? entry.teacherIds : [entry.teacherId]).map((id: string) => teacherById.get(id)?.name ?? id).join(', ')}</p></> : null}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
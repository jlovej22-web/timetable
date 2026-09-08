import { useState, useMemo } from 'react';
import { Plus, ShieldCheck, UserCheck, RefreshCw, BarChart3 } from 'lucide-react';
import { useBaseData, useBaseDataUpsert, useBaseDataRemove } from '@/hooks/use-operations';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  getAbsenceLessons, 
  rankSubstituteCandidates, 
  drawSubstituteCandidate,
  aggregateSubstitutionHistory,
  type TeacherAbsence,
  type SubstituteAssignment,
  type OperationLog,
  type SubstituteCandidate
} from '@/lib/operations-engine';
import { toast } from 'sonner';

export function SubstitutionWorkspace({ projectId }: { projectId: string }) {
  const [activeTab, setActiveTab] = useState<'absences' | 'assignments' | 'logs'>('absences');
  
  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex space-x-1 rounded-lg bg-muted/50 p-1 w-fit">
        <button
          onClick={() => setActiveTab('absences')}
          className={cn("px-4 py-2 text-sm font-medium rounded-md transition-colors", activeTab === 'absences' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50")}
        >
          결강 등록
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={cn("px-4 py-2 text-sm font-medium rounded-md transition-colors", activeTab === 'assignments' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50")}
        >
          보강 배정
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={cn("px-4 py-2 text-sm font-medium rounded-md transition-colors", activeTab === 'logs' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50")}
        >
          이력 및 통계
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'absences' && <AbsenceManager projectId={projectId} />}
        {activeTab === 'assignments' && <AssignmentManager projectId={projectId} />}
        {activeTab === 'logs' && <LogsManager projectId={projectId} />}
      </div>
    </div>
  );
}

function AbsenceManager({ projectId }: { projectId: string }) {
  const { data: absences = [] } = useBaseData<any>(projectId, 'teacher_absences');
  const { data: teachers = [] } = useBaseData<any>(projectId, 'teachers');
  const upsertAbsence = useBaseDataUpsert(projectId, 'teacher_absences');
  const removeAbsence = useBaseDataRemove(projectId, 'teacher_absences');
  const logOp = useBaseDataUpsert(projectId, 'operation_logs');

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [teacherId, setTeacherId] = useState('');
  const [reason, setReason] = useState('');
  const [allDay, setAllDay] = useState(true);
  const [startPeriod, setStartPeriod] = useState(1);
  const [endPeriod, setEndPeriod] = useState(8);

  const handleAdd = () => {
    if (!teacherId || !date) return;
    const newAbsence: any = {
      id: crypto.randomUUID(),
      teacherId,
      date,
      allDay,
      startPeriod: allDay ? undefined : startPeriod,
      endPeriod: allDay ? undefined : endPeriod,
      reason,
      status: 'registered',
    };
    upsertAbsence.mutate(newAbsence);
    logOp.mutate({
      id: crypto.randomUUID(),
      type: 'absence',
      occurredAt: new Date().toISOString(),
      teacherId,
      date,
      details: { action: 'created', reason, allDay }
    });
    setTeacherId('');
    setReason('');
    toast.success('결강이 등록되었습니다.');
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">교사</label>
          <select 
            value={teacherId} onChange={e => setTeacherId(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">선택...</option>
            {teachers.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">일자</label>
          <input 
            type="date" value={date} onChange={e => setDate(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex items-center gap-2 h-9 pb-1">
           <input type="checkbox" id="allday" checked={allDay} onChange={e => setAllDay(e.target.checked)} />
           <label htmlFor="allday" className="text-sm">종일</label>
        </div>
        {!allDay && (
           <>
              <div>
                 <label className="block text-xs font-medium text-muted-foreground mb-1">시작 교시</label>
                 <input type="number" min={1} max={10} value={startPeriod} onChange={e => setStartPeriod(Number(e.target.value))} className="flex h-9 w-20 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div>
                 <label className="block text-xs font-medium text-muted-foreground mb-1">종료 교시</label>
                 <input type="number" min={1} max={10} value={endPeriod} onChange={e => setEndPeriod(Number(e.target.value))} className="flex h-9 w-20 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
           </>
        )}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1">사유</label>
          <input 
            type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="예: 병가, 출장"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Button onClick={handleAdd} disabled={!teacherId || !date}><Plus className="w-4 h-4 mr-2" /> 등록</Button>
      </div>

      <div className="flex-1 overflow-y-auto bg-card rounded-xl border border-border shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border sticky top-0">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">교사</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">일자</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">시간</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">사유</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">상태</th>
              <th className="px-4 py-3 font-medium text-muted-foreground text-right">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {absences.map((ab: any) => (
              <tr key={ab.id} className="hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-foreground">{teachers.find((t: any) => t.id === ab.teacherId)?.name || ab.teacherId}</td>
                <td className="px-4 py-3 text-muted-foreground">{ab.date || ab.startDate}</td>
                <td className="px-4 py-3 text-muted-foreground">{ab.allDay ? '종일' : `${ab.startPeriod}~${ab.endPeriod}교시`}</td>
                <td className="px-4 py-3 text-muted-foreground">{ab.reason || '-'}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded text-xs">{ab.status === 'registered' ? '등록됨' : ab.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm" className="text-destructive h-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => removeAbsence.mutate(ab.id)}>삭제</Button>
                </td>
              </tr>
            ))}
            {absences.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground border-t border-dashed">등록된 결강이 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentManager({ projectId }: { projectId: string }) {
  const { data: absences = [] } = useBaseData<any>(projectId, 'teacher_absences');
  const { data: assignments = [] } = useBaseData<any>(projectId, 'substitute_assignments');
  const { data: timetables = [] } = useBaseData<any>(projectId, 'working_timetables');
  const { data: teachers = [] } = useBaseData<any>(projectId, 'teachers');
  const { data: subjects = [] } = useBaseData<any>(projectId, 'subjects');
  const { data: classes = [] } = useBaseData<any>(projectId, 'classes');
  const { data: logs = [] } = useBaseData<OperationLog>(projectId, 'operation_logs');
  
  const upsertAssign = useBaseDataUpsert(projectId, 'substitute_assignments');
  const upsertDraw = useBaseDataUpsert(projectId, 'substitute_draws');
  const logOp = useBaseDataUpsert(projectId, 'operation_logs');

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeItem, setActiveItem] = useState<{ absence: any, lesson: any } | null>(null);
  const [checkedCandidates, setCheckedCandidates] = useState<string[]>([]);
  const [drawResult, setDrawResult] = useState<any>(null);

  const activeTimetable = timetables.find((value: any) => value.id === 'current')?.entries || [];
  const todaysAbsences = absences;
  
  const affectedLessons = todaysAbsences.flatMap((absence: any) => 
    getAbsenceLessons(activeTimetable, absence, selectedDate).map(lesson => ({ absence, lesson }))
  ).sort((a,b) => a.lesson.period - b.lesson.period);

  const getSub = (lessonId: string, period: number) => assignments.find((a: any) => a.entryId === lessonId && a.date === selectedDate && a.period === period);
  const getSubjectName = (id: string) => subjects.find((s: any) => s.id === id)?.name || id;
  const getClassName = (id: string) => classes.find((c: any) => c.id === id)?.name || id;
  const getTeacherName = (id: string) => teachers.find((t: any) => t.id === id)?.name || id;

  const teacherProfiles = useMemo(() => {
     const classGradeIds = classes.reduce((acc: any, c: any) => ({...acc, [c.id]: String(c.grade)}), {});
     const teacherGrades = new Map<string, Set<string>>();
     activeTimetable.forEach((entry: any) => {
        const grade = classGradeIds[entry.classId];
        if (grade) {
           entry.teacherIds?.forEach((tid: string) => {
              if (!teacherGrades.has(tid)) teacherGrades.set(tid, new Set());
              teacherGrades.get(tid)!.add(grade);
           });
           if (entry.teacherId) {
              if (!teacherGrades.has(entry.teacherId)) teacherGrades.set(entry.teacherId, new Set());
              teacherGrades.get(entry.teacherId)!.add(grade);
           }
        }
     });
     return teachers.map((t: any) => ({
        id: t.id,
        subjectIds: [t.subjectId].filter(Boolean),
        gradeIds: Array.from(teacherGrades.get(t.id) || []),
        available: t.active !== 'N'
     }));
  }, [teachers, classes, activeTimetable]);

  const candidates = useMemo(() => {
     if (!activeItem) return [];
     const classGradeIds = classes.reduce((acc: any, c: any) => ({...acc, [c.id]: String(c.grade)}), {});
     return rankSubstituteCandidates({
        entries: activeTimetable,
        date: selectedDate,
        lesson: activeItem.lesson,
        candidateTeacherIds: teachers.map((t: any) => t.id),
        teachers: teacherProfiles,
        classGradeIds,
         history: assignments,
        plannedAssignments: assignments.filter((a: any) => a.date === selectedDate)
     });
  }, [activeItem, selectedDate, activeTimetable, teachers, teacherProfiles, classes, logs, assignments]);

  const handleDraw = () => {
    if (checkedCandidates.length === 0) {
      toast.error('추첨할 후보를 선택하세요.');
      return;
    }
    const draw = drawSubstituteCandidate(checkedCandidates);
     const drawId = crypto.randomUUID();
     const savedDraw = {
        id: drawId,
       candidateIds: checkedCandidates,
       selectedTeacherId: draw.selectedTeacherId,
       timestamp: new Date().toISOString(),
        status: 'awaiting_confirmation',
       lessonId: activeItem?.lesson.assignmentId
     };
     upsertDraw.mutate(savedDraw);
     setDrawResult({ ...draw, ...savedDraw });
    toast.success('추첨이 완료되었습니다. 확정 버튼을 눌러주세요.');
  };

  const handleConfirm = (teacherId: string, method: string) => {
    if (!activeItem) return;
    const id = crypto.randomUUID();
    upsertAssign.mutate({
      id,
      absenceId: activeItem.absence.id,
      selectionMethod: method,
      confirmedAt: new Date().toISOString(),
      status: 'confirmed',
      date: selectedDate,
      day: activeItem.lesson.day,
      period: activeItem.lesson.period,
      entryId: activeItem.lesson.assignmentId,
      originalTeacherId: activeItem.lesson.teacherId,
      substituteTeacherId: teacherId,
      subjectId: activeItem.lesson.subjectId,
      classId: activeItem.lesson.classId,
      createdAt: new Date().toISOString()
    });
    logOp.mutate({
      id: crypto.randomUUID(),
      type: 'substitute_assignment',
      occurredAt: new Date().toISOString(),
      date: selectedDate,
      originalTeacherId: activeItem.lesson.teacherId,
      substituteTeacherId: teacherId,
      assignmentId: activeItem.lesson.assignmentId,
      details: { selectionMethod: method }
    });
    if (method === 'draw' && drawResult?.id) {
      upsertDraw.mutate({ ...drawResult, status: 'confirmed', confirmedAt: new Date().toISOString() });
    }
    setActiveItem(null);
    toast.success('보강이 확정되었습니다.');
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
        <label className="text-sm font-medium text-muted-foreground">조회 일자</label>
        <input 
          type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setActiveItem(null); }}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex-1 overflow-y-auto bg-card rounded-xl border border-border shadow-sm p-4">
        <h3 className="font-medium mb-4 text-foreground">결강 및 보강 필요 목록 ({affectedLessons.length}건)</h3>
        {affectedLessons.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border border-dashed rounded-lg">
            해당 일자에 보강이 필요한 결강이 없습니다.
          </div>
        ) : (
          <div className="space-y-4">
            {affectedLessons.map(({ absence, lesson }, idx) => {
              const sub = getSub(lesson.assignmentId, lesson.period);
              const isActive = activeItem?.lesson.assignmentId === lesson.assignmentId;
              
              return (
                <div key={`${lesson.assignmentId}-${idx}`} className={`p-4 rounded-lg border bg-background transition-colors ${isActive ? 'ring-1 ring-primary border-primary' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-primary mb-1">{lesson.period}교시</div>
                      <div className="font-medium text-foreground">{getClassName(lesson.classId)} · {getSubjectName(lesson.subjectId)}</div>
                      <div className="text-sm text-muted-foreground mt-1">원담당: <span className="line-through">{getTeacherName(lesson.teacherId)}</span></div>
                    </div>
                    
                    <div>
                      {sub ? (
                        <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-md flex items-center gap-2 border border-emerald-200">
                          <UserCheck className="w-4 h-4" />
                          <span className="font-medium">보강 확정: {getTeacherName(sub.substituteTeacherId)} <span className="opacity-70 font-normal text-xs ml-1">({sub.selectionMethod === 'draw' ? '추첨' : '수동'})</span></span>
                        </div>
                      ) : (
                        <Button 
                          variant={isActive ? "secondary" : "default"} 
                          onClick={() => {
                            if (isActive) setActiveItem(null);
                            else {
                               setActiveItem({ absence, lesson });
                               setCheckedCandidates([]);
                               setDrawResult(null);
                            }
                          }}
                        >
                          {isActive ? '패널 닫기' : '후보 조회 및 배정'}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isActive && !sub && (
                    <div className="mt-5 p-4 bg-muted/30 border border-border rounded-lg animate-in slide-in-from-top-2">
                      <h4 className="font-medium mb-3 text-sm flex items-center gap-2">배정 가능 후보 순위 (가용 교사)</h4>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                        {candidates.length === 0 ? (
                           <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">가용 교사가 없습니다.</div>
                        ) : candidates.map((c: any) => (
                          <div key={c.teacherId} className="flex items-center justify-between bg-background p-3 rounded-md border border-border text-sm hover:border-primary/50 transition-colors">
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                checked={checkedCandidates.includes(c.teacherId)}
                                onChange={(e) => {
                                  if (e.target.checked) setCheckedCandidates(prev => [...prev, c.teacherId]);
                                  else setCheckedCandidates(prev => prev.filter(id => id !== c.teacherId));
                                }}
                              />
                              <span className="font-semibold text-foreground w-16">{getTeacherName(c.teacherId)}</span>
                              <span className="text-muted-foreground text-xs bg-muted px-2 py-0.5 rounded-full">Score: {c.score}</span>
                            </div>
                            <div className="text-xs text-muted-foreground hidden md:flex gap-1.5 truncate flex-1 px-4 opacity-80">
                              {c.reasons.map((r: string, i: number) => <span key={i} className="bg-muted/50 px-1.5 py-0.5 rounded">{r}</span>)}
                            </div>
                            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => handleConfirm(c.teacherId, 'manual')}>
                              수동 확정
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between border-t border-border pt-4 gap-4">
                        <Button onClick={handleDraw} disabled={checkedCandidates.length === 0} variant="secondary" className="gap-2">
                          <RefreshCw className="w-4 h-4" /> 선택된 {checkedCandidates.length}명 중 균등 추첨
                        </Button>
                        {drawResult && (
                          <div className="flex items-center gap-3 bg-primary/5 px-4 py-2 rounded-md border border-primary/20">
                            <span className="text-sm font-medium text-primary">추첨 결과: <span className="font-bold text-base">{getTeacherName(drawResult.selectedTeacherId)}</span> 교사</span>
                            <Button size="sm" onClick={() => handleConfirm(drawResult.selectedTeacherId, 'draw')}>
                              추첨 결과로 배정
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function LogsManager({ projectId }: { projectId: string }) {
  const { data: logs = [] } = useBaseData<OperationLog>(projectId, 'operation_logs');
  const { data: teachers = [] } = useBaseData<any>(projectId, 'teachers');
  const { data: assignments = [] } = useBaseData<SubstituteAssignment>(projectId, 'substitute_assignments');
  const getTeacherName = (id: string) => teachers.find((t: any) => t.id === id)?.name || id;

  const [view, setView] = useState<'logs'|'stats'>('stats');

  const sortedLogs = [...logs].sort((a,b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  
  const stats = useMemo(() => {
     return aggregateSubstitutionHistory(assignments, format(new Date(), 'yyyy-MM-dd'));
   }, [assignments]);

  return (
    <div className="h-full bg-card rounded-xl border border-border shadow-sm flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30 flex justify-between items-center">
        <h3 className="font-medium flex items-center gap-2 text-foreground">
           <ShieldCheck className="w-5 h-5 text-muted-foreground" /> 보강 운영 기록
        </h3>
        <div className="flex bg-background rounded-md border border-border overflow-hidden">
           <button onClick={() => setView('stats')} className={cn("px-4 py-1.5 text-sm font-medium", view === 'stats' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50")}>공정성 통계</button>
           <button onClick={() => setView('logs')} className={cn("px-4 py-1.5 text-sm font-medium border-l border-border", view === 'logs' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50")}>감사 로그</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {view === 'logs' ? (
           <table className="w-full text-sm text-left">
             <thead className="bg-muted/50 border-b border-border sticky top-0">
               <tr>
                 <th className="px-4 py-3 font-medium text-muted-foreground">발생 일시</th>
                 <th className="px-4 py-3 font-medium text-muted-foreground">유형</th>
                 <th className="px-4 py-3 font-medium text-muted-foreground">대상 일자</th>
                 <th className="px-4 py-3 font-medium text-muted-foreground">내용</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-border">
               {sortedLogs.map(log => (
                 <tr key={log.id} className="hover:bg-muted/20">
                   <td className="px-4 py-3 text-muted-foreground">{format(new Date(log.occurredAt), 'yyyy-MM-dd HH:mm')}</td>
                   <td className="px-4 py-3 font-medium text-foreground">
                     {log.type === 'absence' ? '결강 등록' : log.type === 'substitute_assignment' ? '보강 배정' : log.type === 'schedule_change' ? '일과 변경' : log.type}
                   </td>
                   <td className="px-4 py-3 text-muted-foreground">{log.date || '-'}</td>
                   <td className="px-4 py-3 text-foreground">
                     {log.type === 'absence' ? (
                       `${getTeacherName(log.teacherId || '')} 교사 결강`
                     ) : log.type === 'substitute_assignment' ? (
                       `${getTeacherName(log.originalTeacherId || '')} → ${getTeacherName(log.substituteTeacherId || '')} (보강)`
                     ) : log.type === 'schedule_change' ? (
                       `시간표 변경 처리 (취소/이동)`
                     ) : '-'}
                   </td>
                 </tr>
               ))}
               {sortedLogs.length === 0 && (
                 <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground border-t border-dashed">기록된 로그가 없습니다.</td></tr>
               )}
             </tbody>
           </table>
        ) : (
           <table className="w-full text-sm text-left">
             <thead className="bg-muted/50 border-b border-border sticky top-0">
               <tr>
                 <th className="px-4 py-3 font-medium text-muted-foreground">교사</th>
                 <th className="px-4 py-3 font-medium text-muted-foreground">최근 30일 누적</th>
                 <th className="px-4 py-3 font-medium text-muted-foreground">이번 달 누적</th>
                 <th className="px-4 py-3 font-medium text-muted-foreground">학기 누적</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-border">
               {teachers.map((t: any) => {
                 const s = stats[t.id] || { monthly: 0, semester: 0, recent30: 0 };
                 return (
                    <tr key={t.id} className="hover:bg-muted/20">
                       <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                       <td className="px-4 py-3 text-foreground">{s.recent30}회</td>
                       <td className="px-4 py-3 text-foreground">{s.monthly}회</td>
                       <td className="px-4 py-3 text-foreground">{s.semester}회</td>
                    </tr>
                 );
               })}
             </tbody>
           </table>
        )}
      </div>
    </div>
  );
}

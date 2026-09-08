import { useState } from 'react';
import { CalendarClock, Trash2, Megaphone, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { useBaseData, useBaseDataUpsert, useBaseDataRemove } from '@/hooks/use-operations';
import { getKoreanWeekday, applyDailyScheduleChanges, type DailyScheduleChange, type DailyScheduleEntry } from '@/lib/operations-engine';

export function DailyChangeWorkspace({ projectId }: { projectId: string }) {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const { data: changes = [] } = useBaseData<any>(projectId, 'daily_schedule_changes');
  const { data: timetables = [] } = useBaseData<any>(projectId, 'working_timetables');
  const { data: subjects = [] } = useBaseData<any>(projectId, 'subjects');
  const { data: teachers = [] } = useBaseData<any>(projectId, 'teachers');
  const { data: classes = [] } = useBaseData<any>(projectId, 'classes');
  
  const upsertChange = useBaseDataUpsert(projectId, 'daily_schedule_changes');
  const removeChange = useBaseDataRemove(projectId, 'daily_schedule_changes');
  const logOp = useBaseDataUpsert(projectId, 'operation_logs');

  const activeTimetable = timetables[0]?.entries || [];
  const overlaidSchedule = applyDailyScheduleChanges(activeTimetable, selectedDate, changes);
  const todaysSchedule = overlaidSchedule.filter(e => {
    try {
      return e.day === getKoreanWeekday(new Date(selectedDate));
    } catch {
      return false;
    }
  });

  const [overlayTarget, setOverlayTarget] = useState('');
  const [overlayType, setOverlayType] = useState<'단축수업' | '시험' | '학교행사' | '기타'>('단축수업');
  const [overlayPeriods, setOverlayPeriods] = useState('');
  const [overlayReplacement, setOverlayReplacement] = useState('');
  const [overlayScope, setOverlayScope] = useState('전학년');
  const [overlayStatus, setOverlayStatus] = useState('예정');
  const [overlayNotes, setOverlayNotes] = useState('');

  const handleAddOverlay = () => {
    if (!overlayTarget || !overlayPeriods) return;
    const newId = crypto.randomUUID();
    upsertChange.mutate({
      id: newId,
      date: selectedDate,
      action: 'overlay',
      changeType: overlayType,
      target: overlayTarget,
      originalPeriods: overlayPeriods,
      replacementSchedule: overlayReplacement,
      scope: overlayScope,
      status: overlayStatus,
      notes: overlayNotes,
      createdAt: new Date().toISOString()
    });
    setOverlayTarget('');
    setOverlayPeriods('');
    setOverlayReplacement('');
    setOverlayNotes('');
  };

  const generalOverlays = changes.filter(c => c.date === selectedDate && c.action === 'overlay');

  const handleAddCancel = (entry: DailyScheduleEntry) => {
    const changeId = crypto.randomUUID();
    upsertChange.mutate({
      id: changeId,
      date: selectedDate,
      day: entry.day,
      period: entry.period,
      entryId: entry.assignmentId,
      action: 'cancel',
      createdAt: new Date().toISOString()
    });
    logOp.mutate({
      id: crypto.randomUUID(),
      type: 'schedule_change',
      occurredAt: new Date().toISOString(),
      date: selectedDate,
      details: { action: 'cancel', entryId: entry.assignmentId }
    });
  };

  const getSubjectName = (id: string) => subjects.find((s: any) => s.id === id)?.name || id;
  const getTeacherName = (id: string) => teachers.find((t: any) => t.id === id)?.name || id;
  const getClassName = (id: string) => classes.find((c: any) => c.id === id)?.name || id;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="mb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">일과 변경 관리</h2>
        </div>
        <input 
          type="date" 
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pb-6">
        
        <section className="bg-card rounded-xl border border-border shadow-sm p-4">
          <h3 className="font-medium flex items-center gap-2 text-foreground mb-4">
            <Megaphone className="w-4 h-4 text-primary" /> 일정 오버레이 (행사/단축/시험)
          </h3>
          
          <div className="flex flex-wrap items-end gap-3 mb-6 p-4 bg-muted/20 border border-border rounded-lg">
            <div>
               <label className="block text-xs text-muted-foreground mb-1">변경 유형</label>
               <select value={overlayType} onChange={e => setOverlayType(e.target.value as typeof overlayType)} className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-24">
                 <option>단축수업</option><option>시험</option><option>학교행사</option><option>기타</option>
               </select>
            </div>
            <div>
               <label className="block text-xs text-muted-foreground mb-1">대상 (학년/반)</label>
               <input type="text" value={overlayTarget} onChange={e => setOverlayTarget(e.target.value)} placeholder="예: 1학년" className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-28" />
            </div>
            <div>
               <label className="block text-xs text-muted-foreground mb-1">기존 교시</label>
               <input type="text" value={overlayPeriods} onChange={e => setOverlayPeriods(e.target.value)} placeholder="예: 5-7교시" className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-28" />
            </div>
            <div>
               <label className="block text-xs text-muted-foreground mb-1">변경 일정</label>
               <input type="text" value={overlayReplacement} onChange={e => setOverlayReplacement(e.target.value)} placeholder="예: 체육대회" className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-32" />
            </div>
            <div>
               <label className="block text-xs text-muted-foreground mb-1">적용 범위</label>
               <select value={overlayScope} onChange={e => setOverlayScope(e.target.value)} className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-24">
                 <option>전학년</option>
                 <option>해당 학년</option>
                 <option>기타</option>
               </select>
            </div>
            <div>
               <label className="block text-xs text-muted-foreground mb-1">상태</label>
               <select value={overlayStatus} onChange={e => setOverlayStatus(e.target.value)} className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm w-24">
                 <option>예정</option>
                 <option>확정</option>
               </select>
            </div>
            <div className="flex-1 min-w-[150px]">
               <label className="block text-xs text-muted-foreground mb-1">비고</label>
               <input type="text" value={overlayNotes} onChange={e => setOverlayNotes(e.target.value)} placeholder="메모..." className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" />
            </div>
            <Button size="sm" className="h-8" onClick={handleAddOverlay} disabled={!overlayTarget || !overlayPeriods}><Plus className="w-3 h-3 mr-1"/> 등록</Button>
          </div>

          <div className="space-y-2">
            {generalOverlays.map((ov: any) => (
               <div key={ov.id} className="flex items-center justify-between p-3 border border-border bg-background rounded-md text-sm">
                  <div className="flex items-center gap-4">
                     <span className="font-semibold text-primary">{ov.changeType} · {ov.target}</span>
                     <span className="text-muted-foreground">{ov.originalPeriods}</span>
                     <span className="font-medium">{ov.replacementSchedule}</span>
                     <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">{ov.scope}</span>
                     <span className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary">{ov.status}</span>
                     {ov.notes && <span className="text-xs text-muted-foreground border-l border-border pl-3">{ov.notes}</span>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeChange.mutate(ov.id)}>
                     <Trash2 className="w-4 h-4" />
                  </Button>
               </div>
            ))}
            {generalOverlays.length === 0 && (
               <div className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                 등록된 일정 오버레이가 없습니다.
               </div>
            )}
          </div>
        </section>

        <section className="bg-card rounded-xl border border-border shadow-sm p-4">
          {todaysSchedule.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
              해당 일자에 편성된 수업이 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-medium flex items-center gap-2 text-foreground">
                 {selectedDate} ({getKoreanWeekday(selectedDate)}요일) 학급별 일과
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {todaysSchedule.sort((a,b) => a.period - b.period).map((entry, idx) => {
                  const isCancelled = entry.operationalStatus === 'cancelled';
                  const hasReplacement = !!entry.substituteTeacherId;
                  
                  return (
                    <div key={`${entry.assignmentId}-${entry.period}-${idx}`} className={`p-4 rounded-lg border ${isCancelled ? 'bg-destructive/5 border-destructive/20' : 'bg-background border-border'} relative group transition-colors`}>
                      <div className="text-sm font-semibold text-primary mb-1">{entry.period}교시</div>
                      <div className={`font-medium ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {getClassName(entry.classId)} · {getSubjectName(entry.subjectId)}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {isCancelled ? (
                          <span className="text-destructive font-medium">결강 (취소됨)</span>
                        ) : hasReplacement ? (
                          <span>
                            <span className="line-through opacity-70 mr-1">{getTeacherName(entry.originalTeacherId || '')}</span>
                            <span className="text-emerald-600 font-medium">→ {getTeacherName(entry.substituteTeacherId!)} (대강)</span>
                          </span>
                        ) : (
                          getTeacherName(entry.teacherId)
                        )}
                      </div>
                      
                      {!isCancelled && !hasReplacement && (
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAddCancel(entry)}>
                            결강처리
                          </Button>
                        </div>
                      )}
                      {(isCancelled || hasReplacement) && entry.operationChangeId && (
                        <div className="absolute top-3 right-3 flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeChange.mutate(entry.operationChangeId!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

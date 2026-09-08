import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { baseDataStore, type BaseEntity } from '@/lib/base-data-store';
import { parseExcelImport, type ImportEntity, type ImportPreview } from '@/lib/excel-import';

const LABELS: Record<ImportEntity, string> = {
  teachers: '교사', classes: '학급', subjects: '과목', rooms: '특별실',
  assignments: '수업배정', lesson_sets: '세트수업', lesson_set_members: '세트구성',
  teacher_constraints: '교사조건', fixed_lessons: '고정수업', joint_lessons: '공동·교차수업',
  weight_profiles: '가중치 프로필',
  timetable_locks: '시간표 잠금',
};

export function ExcelImportWorkspace({ projectId }: { projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const chooseFile = async (file?: File) => {
    if (!file) return;
    if (!/\\.xlsx$/i.test(file.name)) {
      toast.error('현재는 .xlsx 파일만 지원합니다.');
      return;
    }
    setReading(true);
    try {
      const parsed = await parseExcelImport(file);
      for (const entity of Object.keys(LABELS) as ImportEntity[]) {
        const existingIds = new Set((await baseDataStore.list(projectId, entity)).map((record) => String(record.id)));
        parsed.records[entity].forEach((record, index) => {
          if (existingIds.has(String(record.id))) {
            parsed.issues.push({
              severity: 'warning',
              sheet: LABELS[entity],
              row: index + 2,
              message: `ID ${record.id}는 현재 프로젝트에 있어 Excel 값으로 덮어씁니다.`,
            });
          }
        });
      }
      setPreview(parsed);
    } catch (error) {
      console.error(error);
      setPreview(null);
      toast.error('Excel 파일을 읽지 못했습니다. 파일 형식을 확인하세요.');
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const runImport = async () => {
    if (!preview || preview.issues.some((issue) => issue.severity === 'critical')) return;
    setImporting(true);
    try {
      await baseDataStore.saveSettings(projectId, preview.settings);
      const order: ImportEntity[] = [
        'subjects', 'teachers', 'classes', 'rooms', 'lesson_sets', 'assignments',
        'lesson_set_members', 'teacher_constraints', 'fixed_lessons', 'joint_lessons', 'weight_profiles',
        'timetable_locks',
      ];
      for (const entity of order) {
        for (const record of preview.records[entity]) {
          await baseDataStore.upsert(projectId, entity, record);
        }
      }
      if (preview.initialWorkingTimetable) {
        await baseDataStore.upsert(projectId, 'working_timetables', preview.initialWorkingTimetable);
      }
      await Promise.all([
        ...order.map((entity) => queryClient.invalidateQueries({ queryKey: ['base-data', projectId, entity] })),
        queryClient.invalidateQueries({ queryKey: ['base-data', projectId, 'settings'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
      ]);
      toast.success('Excel 기초자료를 현재 프로젝트에 가져왔습니다.');
      setPreview(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가져오기에 실패했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const criticalCount = preview?.issues.filter((issue) => issue.severity === 'critical').length ?? 0;
  const warningCount = preview?.issues.filter((issue) => issue.severity === 'warning').length ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 pb-8">
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5"><FileSpreadsheet className="h-6 w-6 text-primary" /></div>
            <div>
              <h2 className="text-lg font-semibold">Excel 기초자료 가져오기</h2>
              <p className="mt-1 text-sm text-muted-foreground">3단계 기초자료와 4단계 수업배정·세트·조건·고정·공동수업 양식을 현재 프로젝트로 가져옵니다.</p>
            </div>
          </div>
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0])} />
          <button
            type="button"
            disabled={reading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0]); }}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12 transition hover:border-primary/60 hover:bg-primary/[0.03] disabled:opacity-60"
          >
            <Upload className="mb-3 h-8 w-8 text-primary" />
            <span className="font-medium">{reading ? 'Excel 파일 분석 중...' : 'Excel 파일 선택'}</span>
            <span className="mt-1 text-sm text-muted-foreground">클릭하거나 .xlsx 파일을 여기에 끌어 놓으세요.</span>
          </button>
        </section>

        {preview && (
          <>
            <section className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div><p className="font-medium">{preview.fileName}</p><p className="text-sm text-muted-foreground">{preview.settings.schoolName} · {preview.settings.schoolYear}학년도 {preview.settings.semester}학기</p></div>
                <Button variant="ghost" size="icon" onClick={() => setPreview(null)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                {(Object.keys(LABELS) as ImportEntity[]).map((entity) => (
                  <div key={entity} className="rounded-lg border bg-background p-4">
                    <p className="text-sm text-muted-foreground">{LABELS[entity]}</p>
                    <p className="mt-1 text-2xl font-semibold">{preview.records[entity].length}<span className="ml-1 text-sm font-normal">건</span></p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">검증 결과</h3>
                <div className="flex gap-2 text-sm">
                  <span className="rounded-full bg-destructive/10 px-3 py-1 text-destructive">Critical {criticalCount}</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">Warning {warningCount}</span>
                </div>
              </div>
              {preview.issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-5 w-5" />오류 없이 가져올 수 있습니다.</div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {preview.issues.map((issue, index) => (
                    <div key={`${issue.sheet}-${issue.row}-${index}`} className="flex gap-3 rounded-lg border p-3 text-sm">
                      <AlertCircle className={issue.severity === 'critical' ? 'h-5 w-5 shrink-0 text-destructive' : 'h-5 w-5 shrink-0 text-amber-600'} />
                      <div><span className="font-medium">{issue.sheet}{issue.row ? ` ${issue.row}행` : ''}</span><p className="text-muted-foreground">{issue.message}</p></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-5 flex items-center justify-between border-t pt-5">
                <p className="text-sm text-muted-foreground">같은 ID가 이미 있으면 Excel 값으로 덮어씁니다.</p>
                <Button disabled={criticalCount > 0 || importing} onClick={runImport}>{importing ? '가져오는 중...' : '현재 프로젝트로 가져오기'}</Button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
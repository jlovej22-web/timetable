import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { baseDataStore } from '@/lib/base-data-store';
import { exportTimetableExcel } from '@/lib/timetable-excel-export';
import { useBaseData } from '@/hooks/use-operations';

export function ExcelExportWorkspace({ projectId }: { projectId: string }) {
  const [isExporting, setIsExporting] = useState(false);
  const [mode, setMode] = useState<'all-classes' | 'grade' | 'class' | 'all-teachers' | 'teacher' | 'rooms'>('all-classes');
  const [targetId, setTargetId] = useState('');

  const { data: settings } = useQuery({ 
    queryKey: ['base-data', projectId, 'settings'], 
    queryFn: () => baseDataStore.getSettings(projectId) 
  });
  const { data: teachers = [] } = useBaseData(projectId, 'teachers');
  const { data: classes = [] } = useBaseData(projectId, 'classes');
  const { data: subjects = [] } = useBaseData(projectId, 'subjects');
  const { data: rooms = [] } = useBaseData(projectId, 'rooms');
  const { data: timetables = [] } = useBaseData<any>(projectId, 'working_timetables');

  const handleExport = async () => {
    if (!settings) return;
    setIsExporting(true);
    try {
      const activeTimetable = timetables.find((value: any) => value.id === 'current') || { entries: [] };
      await exportTimetableExcel({
        timetable: activeTimetable,
        settings,
        teachers,
        classes,
        subjects,
        rooms,
        mode,
        targetId,
      });
      toast.success('시간표를 Excel로 내보냈습니다.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '내보내기 실패');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 pb-8">
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">현재 시간표 내보내기</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                현재 편성된 시간표를 Excel 인쇄용 양식으로 내보냅니다.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-6 py-12">
            <Download className="mb-3 h-8 w-8 text-primary" />
            <span className="font-medium">Excel 파일로 다운로드</span>
            <span className="mt-1 text-sm text-muted-foreground mb-4">
              확정된 현재 시간표를 선택한 대상 기준으로 인쇄용 Excel에 저장합니다.
            </span>
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setTargetId(''); }}>
                <option value="all-classes">전체 학급</option><option value="grade">학년</option><option value="class">단일 학급</option>
                <option value="all-teachers">전체 교사</option><option value="teacher">단일 교사</option><option value="rooms">특별실</option>
              </select>
              {mode === 'grade' && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">학년 선택</option>{[...new Set(classes.map((v: any) => String(v.grade)).filter(Boolean))].map((v) => <option key={v} value={v}>{v}학년</option>)}</select>}
              {mode === 'class' && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">학급 선택</option>{classes.map((v: any) => <option key={v.id} value={v.id}>{v.displayName || v.name || v.id}</option>)}</select>}
              {mode === 'teacher' && <select className="h-10 rounded-md border bg-background px-3 text-sm" value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">교사 선택</option>{teachers.map((v: any) => <option key={v.id} value={v.id}>{v.name || v.id}</option>)}</select>}
            </div>
            
            <Button onClick={handleExport} disabled={isExporting || !settings || ((mode === 'grade' || mode === 'class' || mode === 'teacher') && !targetId)} size="lg">
              {isExporting ? '생성 중...' : 'Excel 내보내기'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

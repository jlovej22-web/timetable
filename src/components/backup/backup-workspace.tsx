import { useState, useRef } from 'react';
import { Archive, Upload, Download, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createFullBackup, restoreFullBackup, chooseBackupFile } from '@/lib/backup-store';

export function BackupWorkspace() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      await createFullBackup();
      toast.success('백업 파일이 성공적으로 생성되었습니다.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '백업 생성에 실패했습니다.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreClick = async () => {
    try {
      const isElectron = !!(window as any).schoolTimetable?.files?.choose;
      if (isElectron) {
        const content = await chooseBackupFile();
        if (content) await processRestore(content);
      } else {
        fileInputRef.current?.click();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '파일 선택에 실패했습니다.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await processRestore(text);
    } catch (error) {
      toast.error('파일을 읽는 중 오류가 발생했습니다.');
    } finally {
      e.target.value = '';
    }
  };

  const processRestore = async (content: string) => {
    if (!confirm('경고: 현재 기기의 모든 프로젝트 데이터가 백업 파일의 내용으로 완전히 덮어씌워집니다. 계속하시겠습니까?')) {
      return;
    }
    
    setIsRestoring(true);
    try {
      await restoreFullBackup(content);
      toast.success('복원이 완료되었습니다. 변경사항을 적용하기 위해 페이지를 새로고침합니다.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '복원에 실패했습니다.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 pb-8">
        
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">데이터 백업</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                현재 시스템의 모든 프로젝트와 시간표 데이터를 안전하게 파일로 저장합니다.
              </p>
            </div>
          </div>
          
          <div className="rounded-lg border bg-muted/20 p-6 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-foreground">전체 데이터 백업 생성</h3>
              <p className="text-sm text-muted-foreground mt-1">.schoolttbackup 파일 포맷으로 저장됩니다.</p>
            </div>
            <Button onClick={handleBackup} disabled={isBackingUp} className="gap-2">
              <Download className="w-4 h-4" />
              {isBackingUp ? '생성 중...' : '백업 다운로드'}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-destructive/20 bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-lg bg-destructive/10 p-2.5">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-destructive">데이터 복원</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                이전에 생성된 백업 파일에서 시스템 전체 데이터를 복원합니다.
              </p>
            </div>
          </div>
          
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-destructive-foreground">백업 파일로 시스템 덮어쓰기</h3>
              <p className="text-sm text-destructive/80 mt-1">
                주의: 복원 시 현재 시스템의 모든 데이터가 삭제되고 백업 시점의 데이터로 완전히 교체됩니다.
              </p>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".schoolttbackup" 
              onChange={handleFileChange}
            />
            <Button 
              variant="destructive" 
              onClick={handleRestoreClick} 
              disabled={isRestoring}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              {isRestoring ? '복원 중...' : '백업 파일 선택'}
            </Button>
          </div>
        </section>
        
      </div>
    </div>
  );
}

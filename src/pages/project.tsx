import { useRoute, Link, useLocation } from 'wouter';
import { useProject } from '@/hooks/use-projects';
import { ArrowLeft, Database, BookOpen, Layers, SlidersHorizontal, Cpu, Edit3, CheckCircle, Archive, CalendarClock, UserRoundCog, FileSpreadsheet, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BaseDataWorkspace } from '@/components/base-data/base-data-workspace';
import { ExcelWorkspace } from '@/components/excel/excel-workspace';
import { SolverWorkspace } from '@/components/solver/solver-workspace';
import { TimetableEditorWorkspace } from '@/components/editor/timetable-editor-workspace';
import { DailyChangeWorkspace } from '@/components/operations/daily-change-workspace';
import { SubstitutionWorkspace } from '@/components/operations/substitution-workspace';
import { BackupWorkspace } from '@/components/backup/backup-workspace';
import { Toaster } from 'sonner';

const MENUS = [
  { id: 'base-data', label: '① 기초자료', icon: Database },
  { id: 'assignments', label: '② 수업배정', icon: BookOpen },
  { id: 'lesson-sets', label: '③ 세트수업', icon: Layers },
  { id: 'constraints', label: '④ 편성조건', icon: SlidersHorizontal },
  { id: 'auto-generate', label: '⑤ 자동생성', icon: Cpu },
  { id: 'edit', label: '⑥ 시간표 편집', icon: Edit3 },
  { id: 'analysis', label: '⑦ 분석·검증', icon: CheckCircle },
  { id: 'saved', label: '⑧ 저장된 시간표', icon: Archive },
  { id: 'daily-change', label: '⑨ 일과변경', icon: CalendarClock },
  { id: 'substitution', label: '⑩ 결강·보강', icon: UserRoundCog },
  { id: 'excel', label: '⑪ Excel 입출력', icon: FileSpreadsheet },
  { id: 'backup', label: '⑫ 백업·복원', icon: Archive },
  { id: 'settings', label: '⑬ 환경설정', icon: Settings }
];

export default function ProjectWorkspace() {
  const [matchId, paramsId] = useRoute('/project/:id');
  const [matchMenu, paramsMenu] = useRoute('/project/:id/:menu');
  const [, setLocation] = useLocation();
  
  const projectId = paramsMenu?.id || paramsId?.id;
  const currentMenuId = paramsMenu?.menu || 'base-data';
  
  const { data: project, isLoading, error } = useProject(projectId || '');

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">프로젝트 불러오는 중...</div>;
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">프로젝트를 찾을 수 없습니다.</p>
        <button className="text-primary hover:underline" onClick={() => setLocation('/')}>홈으로 돌아가기</button>
      </div>
    );
  }

  const currentMenu = MENUS.find(m => m.id === currentMenuId) || MENUS[0];

  return (
    <div className="min-h-screen flex bg-background">
      <Toaster position="top-center" richColors />
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border shrink-0">
          <button 
            onClick={() => setLocation('/')}
            className="p-2 -ml-2 mr-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
            title="홈으로"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold truncate">{project.projectName}</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">{project.schoolName} ({project.schoolYear})</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {MENUS.map((menu) => {
            const Icon = menu.icon;
            const isActive = currentMenuId === menu.id;
            return (
              <Link 
                key={menu.id} 
                href={`/project/${project.id}/${menu.id}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className={cn("w-4 h-4", isActive ? "opacity-100" : "opacity-70")} />
                {menu.label}
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border text-xs text-sidebar-foreground/50 shrink-0">
          상태: {project.status}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center px-8 border-b border-border bg-card shadow-sm z-10 shrink-0">
          <h1 className="text-lg font-medium text-card-foreground flex items-center gap-2">
            <currentMenu.icon className="w-5 h-5 text-muted-foreground" />
            {currentMenu.label}
          </h1>
        </header>
        <div className="flex-1 p-6 bg-muted/30 overflow-hidden flex flex-col">
          {currentMenuId === 'base-data' ? (
            <BaseDataWorkspace projectId={project.id} />
          ) : currentMenuId === 'excel' ? (
            <ExcelWorkspace projectId={project.id} />
          ) : currentMenuId === 'auto-generate' ? (
            <SolverWorkspace projectId={project.id} />
          ) : currentMenuId === 'edit' ? (
            <TimetableEditorWorkspace projectId={project.id} />
          ) : currentMenuId === 'daily-change' ? (
            <DailyChangeWorkspace projectId={project.id} />
          ) : currentMenuId === 'substitution' ? (
            <SubstitutionWorkspace projectId={project.id} />
          ) : currentMenuId === 'backup' ? (
            <BackupWorkspace />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-border rounded-xl bg-card shadow-sm">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
                <currentMenu.icon className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-medium text-foreground mb-2">{currentMenu.label} 화면입니다</h2>
              <p className="text-muted-foreground max-w-md">
                이 기능은 다음 구현 단계에서 실제 데이터와 연결됩니다.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
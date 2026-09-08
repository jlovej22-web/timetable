import { useState } from 'react';
import { useLocation } from 'wouter';
import { useProjects, useCreateProject, useUpdateProject, useDeleteProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { MoreVertical, FolderOpen, Plus, Copy, Edit2, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function Home() {
  const [, setLocation] = useLocation();
  const { data: projects = [], isLoading } = useProjects();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ projectName: '', schoolName: '', schoolYear: new Date().getFullYear(), semester: 1 as 1|2 });

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.projectName.trim() || !createForm.schoolName.trim()) return;
    createProject.mutate(createForm, {
      onSuccess: (newProject) => {
        setIsCreateOpen(false);
        setCreateForm({ projectName: '', schoolName: '', schoolYear: new Date().getFullYear(), semester: 1 });
        setLocation(`/project/${newProject.id}`);
      }
    });
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId || !editName.trim()) return;
    updateProject.mutate({ id: editId, data: { projectName: editName.trim() } }, {
      onSuccess: () => {
        setEditId(null);
        setEditName('');
      }
    });
  };

  const handleDuplicate = (project: any) => {
    createProject.mutate({
      projectName: `${project.projectName} (복사본)`,
      schoolName: project.schoolName,
      schoolYear: project.schoolYear,
      semester: project.semester,
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteProject.mutate(deleteId, {
      onSuccess: () => setDeleteId(null)
    });
  };

  const sortedProjects = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const recentProjects = sortedProjects.slice(0, 3);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">불러오는 중...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
              <Calendar className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">학교 시간표 자동편성 시스템</h1>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            새 프로젝트
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section>
            <h2 className="text-lg font-medium mb-4 text-foreground">최근 작업한 프로젝트</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentProjects.map(project => (
                <div key={project.id} className="group relative bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all cursor-pointer flex flex-col" onClick={() => setLocation(`/project/${project.id}`)}>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-medium text-lg text-card-foreground line-clamp-1">{project.projectName}</h3>
                    <div onClick={e => e.stopPropagation()}>
                      <ProjectMenu 
                        project={project} 
                        onRename={() => { setEditId(project.id); setEditName(project.projectName); }}
                        onDuplicate={() => handleDuplicate(project)}
                        onDelete={() => setDeleteId(project.id)}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{project.schoolName} · {project.schoolYear}학년도 {project.semester}학기</p>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium">
                      {project.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(project.updatedAt), 'M월 d일', { locale: ko })} 수정
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All Projects */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-foreground">모든 프로젝트</h2>
            <span className="text-sm text-muted-foreground">총 {projects.length}개</span>
          </div>
          
          {projects.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl bg-card/50">
              <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground mb-4">생성된 프로젝트가 없습니다.</p>
              <Button variant="outline" onClick={() => setIsCreateOpen(true)}>첫 프로젝트 만들기</Button>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-secondary/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium">프로젝트명</th>
                    <th className="px-6 py-3 font-medium">학교 / 학기</th>
                    <th className="px-6 py-3 font-medium">상태</th>
                    <th className="px-6 py-3 font-medium">최종 수정일</th>
                    <th className="px-6 py-3 font-medium text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedProjects.map(project => (
                    <tr key={project.id} className="hover:bg-muted/50 transition-colors group cursor-pointer" onClick={() => setLocation(`/project/${project.id}`)}>
                      <td className="px-6 py-4 font-medium text-foreground">{project.projectName}</td>
                      <td className="px-6 py-4 text-muted-foreground">{project.schoolName} ({project.schoolYear}-{project.semester})</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground text-xs">
                          {project.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {format(new Date(project.updatedAt), 'yyyy-MM-dd HH:mm')}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <ProjectMenu 
                          project={project} 
                          onRename={() => { setEditId(project.id); setEditName(project.projectName); }}
                          onDuplicate={() => handleDuplicate(project)}
                          onDelete={() => setDeleteId(project.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Create Project Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 프로젝트 생성</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">프로젝트명</label>
              <Input 
                autoFocus
                value={createForm.projectName} 
                onChange={e => setCreateForm(prev => ({ ...prev, projectName: e.target.value }))}
                placeholder="예: 2024년 1학기 본시간표"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">학교명</label>
              <Input 
                value={createForm.schoolName} 
                onChange={e => setCreateForm(prev => ({ ...prev, schoolName: e.target.value }))}
                placeholder="예: 한국고등학교"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">학년도</label>
                <Input 
                  type="number" 
                  value={createForm.schoolYear} 
                  onChange={e => setCreateForm(prev => ({ ...prev, schoolYear: parseInt(e.target.value) || new Date().getFullYear() }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">학기</label>
                <select 
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={createForm.semester}
                  onChange={e => setCreateForm(prev => ({ ...prev, semester: parseInt(e.target.value) as 1|2 }))}
                >
                  <option value={1}>1학기</option>
                  <option value={2}>2학기</option>
                </select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>취소</Button>
              <Button type="submit" disabled={createProject.isPending}>생성하기</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트 이름 변경</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleRename} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">새 프로젝트명</label>
              <Input 
                autoFocus
                value={editName} 
                onChange={e => setEditName(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setEditId(null)}>취소</Button>
              <Button type="submit" disabled={updateProject.isPending}>변경하기</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트 삭제</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              정말로 이 프로젝트를 삭제하시겠습니까? 삭제된 프로젝트는 복구할 수 없습니다.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>취소</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteProject.isPending}>삭제하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectMenu({ project, onRename, onDuplicate, onDelete }: { project: any, onRename: () => void, onDuplicate: () => void, onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onRename}><Edit2 className="w-4 h-4 mr-2" /> 이름 변경</DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}><Copy className="w-4 h-4 mr-2" /> 복제</DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive"><Trash2 className="w-4 h-4 mr-2" /> 삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

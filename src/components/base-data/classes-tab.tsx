import { useState } from 'react';
import { useBaseData, useCreateBaseData, useUpdateBaseData, useDeleteBaseData } from '@/hooks/use-base-data';
import { DataTable } from './data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function ClassesTab({ projectId }: { projectId: string }) {
  const { data: classes = [], isLoading } = useBaseData(projectId, 'classes');
  const { data: teachers = [] } = useBaseData(projectId, 'teachers');
  const createMutation = useCreateBaseData(projectId, 'classes');
  const updateMutation = useUpdateBaseData(projectId, 'classes');
  const deleteMutation = useDeleteBaseData(projectId, 'classes');

  const [editItem, setEditItem] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData);
    
    try {
      if (editItem?._isEdit) {
        await updateMutation.mutateAsync({ ...data, id: editItem.id });
        toast.success('저장되었습니다.');
      } else {
        await createMutation.mutateAsync(data);
        toast.success('추가되었습니다.');
      }
      setIsDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (item: any) => {
    if (confirm(`'${item.grade}학년 ${item.classNumber}반'을 삭제하시겠습니까?`)) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast.success('삭제되었습니다.');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const openAdd = () => {
    setEditItem({ id: '', grade: 1, classNumber: 1, displayName: '', teacherId: '', studentCount: 30, defaultRoom: '', active: 'Y', _isEdit: false });
    setIsDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem({ ...item, _isEdit: true });
    setIsDialogOpen(true);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">로딩 중...</div>;

  return (
    <>
      <DataTable
        title="학급 목록"
        addLabel="학급 추가"
        data={classes}
        searchFields={['id', 'grade', 'classNumber']}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        columns={[
          { key: 'id', label: 'ID', sortable: true },
          { key: 'grade', label: '학년', sortable: true },
          { key: 'classNumber', label: '반', sortable: true },
          { key: 'teacherId', label: '담임 교사', sortable: true, render: (item) => teachers.find((t:any) => t.id === item.teacherId)?.name || '-' },
          { key: 'studentCount', label: '학생수', sortable: true },
          { key: 'defaultRoom', label: '기본교실' },
          { key: 'active', label: '사용' },
        ]}
      />
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem?._isEdit ? '학급 수정' : '학급 추가'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="id" className="text-right">ID</Label>
              <Input id="id" name="id" defaultValue={editItem?.id} readOnly={editItem?._isEdit} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">학급표시명</Label><Input name="displayName" defaultValue={editItem?.displayName} className="col-span-3" placeholder="예: 2-1" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">학생수</Label><Input name="studentCount" type="number" defaultValue={editItem?.studentCount} className="col-span-3" min="0" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">기본교실</Label><Input name="defaultRoom" defaultValue={editItem?.defaultRoom} className="col-span-3" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">사용여부</Label><select name="active" defaultValue={editItem?.active} className="col-span-3 h-9 rounded-md border bg-background px-3"><option>Y</option><option>N</option></select></div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="grade" className="text-right">학년</Label>
              <Input id="grade" name="grade" type="number" defaultValue={editItem?.grade} className="col-span-3" required min="1" max="6" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="classNumber" className="text-right">반</Label>
              <Input id="classNumber" name="classNumber" type="number" defaultValue={editItem?.classNumber} className="col-span-3" required min="1" max="30" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="teacherId" className="text-right">담임 교사</Label>
              <select id="teacherId" name="teacherId" defaultValue={editItem?.teacherId} className="col-span-3 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">선택 안함</option>
                {teachers.map((t:any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>취소</Button>
              <Button type="submit">저장</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
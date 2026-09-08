import { useState } from 'react';
import { useBaseData, useCreateBaseData, useUpdateBaseData, useDeleteBaseData } from '@/hooks/use-base-data';
import { DataTable } from './data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function TeachersTab({ projectId }: { projectId: string }) {
  const { data: teachers = [], isLoading } = useBaseData(projectId, 'teachers');
  const { data: subjects = [] } = useBaseData(projectId, 'subjects');
  const createMutation = useCreateBaseData(projectId, 'teachers');
  const updateMutation = useUpdateBaseData(projectId, 'teachers');
  const deleteMutation = useDeleteBaseData(projectId, 'teachers');

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
    if (confirm(`'${item.name}' 교사를 삭제하시겠습니까?`)) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast.success('삭제되었습니다.');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const openAdd = () => {
    setEditItem({ id: '', name: '', subjectId: '', maxHours: 18, teacherType: '일반교사', workDays: '월,화,수,목,금', dailyMaxHours: 6, maxConsecutive: 3, active: 'Y', notes: '', _isEdit: false });
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
        title="교사 목록"
        addLabel="교사 추가"
        data={teachers}
        searchFields={['id', 'name']}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        columns={[
          { key: 'id', label: 'ID', sortable: true },
          { key: 'name', label: '이름', sortable: true },
          { key: 'subjectId', label: '담당 과목', sortable: true, render: (item) => subjects.find((s:any) => s.id === item.subjectId)?.name || '-' },
          { key: 'maxHours', label: '주당 최대 시수', sortable: true },
          { key: 'teacherType', label: '교사유형', sortable: true },
          { key: 'workDays', label: '근무요일' },
          { key: 'active', label: '사용' },
        ]}
      />
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem?._isEdit ? '교사 수정' : '교사 추가'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="id" className="text-right">ID</Label>
              <Input id="id" name="id" defaultValue={editItem?.id} readOnly={editItem?._isEdit} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">교사유형</Label>
              <select name="teacherType" defaultValue={editItem?.teacherType} className="col-span-3 h-9 rounded-md border bg-background px-3 text-sm">
                {['일반교사','순회교사','시간강사','기타'].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">근무요일</Label><Input name="workDays" defaultValue={editItem?.workDays} className="col-span-3" placeholder="월,화,수,목,금" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">하루 최대시수</Label><Input name="dailyMaxHours" type="number" defaultValue={editItem?.dailyMaxHours} className="col-span-3" min="1" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">최대 연속수업</Label><Input name="maxConsecutive" type="number" defaultValue={editItem?.maxConsecutive} className="col-span-3" min="1" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">사용여부</Label><select name="active" defaultValue={editItem?.active} className="col-span-3 h-9 rounded-md border bg-background px-3"><option>Y</option><option>N</option></select></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">비고</Label><Input name="notes" defaultValue={editItem?.notes} className="col-span-3" /></div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">이름</Label>
              <Input id="name" name="name" defaultValue={editItem?.name} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subjectId" className="text-right">담당 과목</Label>
              <select id="subjectId" name="subjectId" defaultValue={editItem?.subjectId} className="col-span-3 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">선택 안함</option>
                {subjects.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="maxHours" className="text-right">주당 시수</Label>
              <Input id="maxHours" name="maxHours" type="number" defaultValue={editItem?.maxHours} className="col-span-3" required min="0" max="40" />
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
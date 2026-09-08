import { useState } from 'react';
import { useBaseData, useCreateBaseData, useUpdateBaseData, useDeleteBaseData } from '@/hooks/use-base-data';
import { DataTable } from './data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function SubjectsTab({ projectId }: { projectId: string }) {
  const { data: subjects = [], isLoading } = useBaseData(projectId, 'subjects');
  const createMutation = useCreateBaseData(projectId, 'subjects');
  const updateMutation = useUpdateBaseData(projectId, 'subjects');
  const deleteMutation = useDeleteBaseData(projectId, 'subjects');

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
    if (confirm(`'${item.name}' 과목을 삭제하시겠습니까?`)) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast.success('삭제되었습니다.');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const openAdd = () => {
    setEditItem({ id: '', name: '', shortName: '', grade: 1, weeklyHours: 3, lessonType: '일반', requiresSpecialRoom: 'N', consecutiveRequired: 'N', consecutivePeriods: 1, allowDailyDuplicate: 'N', preferDayDistribution: 'Y', _isEdit: false });
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
        title="과목 목록"
        addLabel="과목 추가"
        data={subjects}
        searchFields={['id', 'name', 'shortName']}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        columns={[
          { key: 'id', label: 'ID', sortable: true },
          { key: 'name', label: '과목명', sortable: true },
          { key: 'shortName', label: '단축명', sortable: true },
          { key: 'grade', label: '학년', sortable: true },
          { key: 'weeklyHours', label: '기본주당시수', sortable: true },
          { key: 'lessonType', label: '수업유형' },
        ]}
      />
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem?._isEdit ? '과목 수정' : '과목 추가'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="id" className="text-right">ID</Label>
              <Input id="id" name="id" defaultValue={editItem?.id} readOnly={editItem?._isEdit} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">학년</Label><Input name="grade" type="number" defaultValue={editItem?.grade} className="col-span-3" min="1" max="6" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">기본주당시수</Label><Input name="weeklyHours" type="number" defaultValue={editItem?.weeklyHours} className="col-span-3" min="0" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">수업유형</Label><Input name="lessonType" defaultValue={editItem?.lessonType} className="col-span-3" /></div>
            {[
              ['requiresSpecialRoom','특별실 필요'],['consecutiveRequired','연속수업 필수'],
              ['allowDailyDuplicate','하루중복 허용'],['preferDayDistribution','요일분산 선호'],
            ].map(([name,label]) => <div key={name} className="grid grid-cols-4 items-center gap-4"><Label className="text-right">{label}</Label><select name={name} defaultValue={editItem?.[name]} className="col-span-3 h-9 rounded-md border bg-background px-3"><option>Y</option><option>N</option></select></div>)}
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">연속교시수</Label><Input name="consecutivePeriods" type="number" defaultValue={editItem?.consecutivePeriods} className="col-span-3" min="1" max="3" /></div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">과목명</Label>
              <Input id="name" name="name" defaultValue={editItem?.name} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="shortName" className="text-right">단축명</Label>
              <Input id="shortName" name="shortName" defaultValue={editItem?.shortName} className="col-span-3" required />
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
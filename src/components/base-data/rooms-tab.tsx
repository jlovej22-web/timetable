import { useState } from 'react';
import { useBaseData, useCreateBaseData, useUpdateBaseData, useDeleteBaseData } from '@/hooks/use-base-data';
import { DataTable } from './data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export function RoomsTab({ projectId }: { projectId: string }) {
  const { data: rooms = [], isLoading } = useBaseData(projectId, 'rooms');
  const createMutation = useCreateBaseData(projectId, 'rooms');
  const updateMutation = useUpdateBaseData(projectId, 'rooms');
  const deleteMutation = useDeleteBaseData(projectId, 'rooms');

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
    if (confirm(`'${item.name}' 특별실을 삭제하시겠습니까?`)) {
      try {
        await deleteMutation.mutateAsync(item.id);
        toast.success('삭제되었습니다.');
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  };

  const openAdd = () => {
    setEditItem({ id: '', name: '', roomType: '특별실', capacity: 1, availableDays: '월,화,수,목,금', unavailableTimes: '', active: 'Y', notes: '', _isEdit: false });
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
        title="특별실 목록"
        addLabel="특별실 추가"
        data={rooms}
        searchFields={['id', 'name']}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        columns={[
          { key: 'id', label: 'ID', sortable: true },
          { key: 'name', label: '특별실명', sortable: true },
          { key: 'capacity', label: '수용 인원', sortable: true },
          { key: 'roomType', label: '유형', sortable: true },
          { key: 'availableDays', label: '사용가능요일' },
          { key: 'active', label: '사용' },
        ]}
      />
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem?._isEdit ? '특별실 수정' : '특별실 추가'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="id" className="text-right">ID</Label>
              <Input id="id" name="id" defaultValue={editItem?.id} readOnly={editItem?._isEdit} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">유형</Label><Input name="roomType" defaultValue={editItem?.roomType} className="col-span-3" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">사용가능요일</Label><Input name="availableDays" defaultValue={editItem?.availableDays} className="col-span-3" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">사용불가시간</Label><Input name="unavailableTimes" defaultValue={editItem?.unavailableTimes} className="col-span-3" placeholder="예: 월-1,화-7" /></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">사용여부</Label><select name="active" defaultValue={editItem?.active} className="col-span-3 h-9 rounded-md border bg-background px-3"><option>Y</option><option>N</option></select></div>
            <div className="grid grid-cols-4 items-center gap-4"><Label className="text-right">비고</Label><Input name="notes" defaultValue={editItem?.notes} className="col-span-3" /></div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">특별실명</Label>
              <Input id="name" name="name" defaultValue={editItem?.name} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="capacity" className="text-right">수용 인원</Label>
              <Input id="capacity" name="capacity" type="number" defaultValue={editItem?.capacity} className="col-span-3" required min="1" />
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
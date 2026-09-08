import { useState, useEffect } from 'react';
import { useSettings, useSaveSettings } from '@/hooks/use-base-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

export function SettingsTab({ projectId }: { projectId: string }) {
  const { data: settings, isLoading } = useSettings(projectId);
  const saveMutation = useSaveSettings(projectId);
  
  const [dayPeriods, setDayPeriods] = useState<Record<string, number>>({});
  const [lunchAfterPeriod, setLunchAfterPeriod] = useState<number>(4);

  useEffect(() => {
    if (settings) {
      setDayPeriods(settings.periodsByDay || {});
      setLunchAfterPeriod(settings.lunchAfterPeriod || 4);
    }
  }, [settings]);

  if (isLoading) return <div>로딩 중...</div>;

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        ...settings,
        operatingDays: DAYS.filter(day => dayPeriods[day] > 0),
        periodsByDay: dayPeriods,
        lunchAfterPeriod,
      });
      toast.success('학교 설정이 저장되었습니다.');
    } catch (e: any) {
      toast.error('저장에 실패했습니다.');
    }
  };

  return (
    <div className="max-w-2xl bg-card rounded-lg border shadow-sm p-6 space-y-8 mx-auto mt-8">
      <div>
        <h3 className="text-lg font-medium mb-4 border-b pb-2">운영 요일 및 교시 수</h3>
        <div className="grid grid-cols-2 gap-4">
          {DAYS.map(day => {
            const isActive = dayPeriods[day] > 0;
            return (
              <div key={day} className="flex items-center gap-3 p-3 border rounded-md bg-background">
                <input 
                  type="checkbox" 
                  checked={isActive} 
                  onChange={(e) => {
                    setDayPeriods(prev => ({
                      ...prev,
                      [day]: e.target.checked ? 7 : 0
                    }));
                  }}
                  className="w-4 h-4 accent-primary"
                  id={`chk-${day}`}
                />
                <Label htmlFor={`chk-${day}`} className="font-medium w-8 cursor-pointer">{day}요일</Label>
                <Input 
                  type="number" 
                  min="1" max="10" 
                  disabled={!isActive}
                  value={isActive ? dayPeriods[day] : ''}
                  onChange={(e) => setDayPeriods(prev => ({ ...prev, [day]: Number(e.target.value) }))}
                  className="w-20 h-8 text-center"
                />
                <span className="text-sm text-muted-foreground">교시</span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-4 border-b pb-2">일과 시간 설정</h3>
        <div className="flex items-center gap-4 bg-background p-4 border rounded-md">
          <Label className="text-base">점심 시간은</Label>
          <Input 
            type="number" 
            min="1" max="10" 
            value={lunchAfterPeriod}
            onChange={(e) => setLunchAfterPeriod(Number(e.target.value))}
            className="w-20 text-center"
          />
          <Label className="text-base">교시 이후입니다.</Label>
        </div>
      </div>

      <div className="pt-4 flex justify-end">
        <Button onClick={handleSave} size="lg">설정 저장</Button>
      </div>
    </div>
  );
}
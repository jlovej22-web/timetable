import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { baseDataStore, type BaseEntity } from '@/lib/base-data-store';

export function useBaseData(projectId: string, entity: BaseEntity) {
  return useQuery({
    queryKey: ['base-data', projectId, entity],
    queryFn: () => baseDataStore.list(projectId, entity),
  });
}

export function useCreateBaseData(projectId: string, entity: BaseEntity) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: any) => {
      const existing = await baseDataStore.list(projectId, entity);
      if (existing.some(e => e.id === record.id)) {
        throw new Error('이미 존재하는 ID입니다.');
      }
      await baseDataStore.upsert(projectId, entity, record);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-data', projectId, entity] });
    }
  });
}

export function useUpdateBaseData(projectId: string, entity: BaseEntity) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (record: any) => {
      await baseDataStore.upsert(projectId, entity, record);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-data', projectId, entity] });
    }
  });
}

export function useDeleteBaseData(projectId: string, entity: BaseEntity) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (entity === 'subjects') {
        const teachers = await baseDataStore.list(projectId, 'teachers');
        if (teachers.some((t: any) => t.subjectId === id)) {
          throw new Error('이 과목을 담당하는 교사가 있어 삭제할 수 없습니다.');
        }
      }
      if (entity === 'teachers') {
        const classes = await baseDataStore.list(projectId, 'classes');
        if (classes.some((c: any) => c.teacherId === id)) {
          throw new Error('이 교사가 담임인 학급이 있어 삭제할 수 없습니다.');
        }
      }
      await baseDataStore.remove(projectId, entity, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-data', projectId, entity] });
    }
  });
}

export function useSettings(projectId: string) {
  return useQuery({
    queryKey: ['base-data', projectId, 'settings'],
    queryFn: () => baseDataStore.getSettings(projectId),
  });
}

export function useSaveSettings(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: any) => {
      await baseDataStore.saveSettings(projectId, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-data', projectId, 'settings'] });
    }
  });
}
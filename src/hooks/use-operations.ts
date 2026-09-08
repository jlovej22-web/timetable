import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { baseDataStore, type BaseEntity, type BaseRecord } from '@/lib/base-data-store';

export function useBaseData<T extends BaseRecord>(projectId: string, entity: BaseEntity) {
  return useQuery({
    queryKey: ['base-data', projectId, entity],
    queryFn: () => baseDataStore.list(projectId, entity) as Promise<T[]>,
    enabled: !!projectId,
  });
}

export function useBaseDataUpsert(projectId: string, entity: BaseEntity) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (record: BaseRecord) => baseDataStore.upsert(projectId, entity, record),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-data', projectId, entity] });
    },
  });
}

export function useBaseDataRemove(projectId: string, entity: BaseEntity) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => baseDataStore.remove(projectId, entity, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['base-data', projectId, entity] });
    },
  });
}

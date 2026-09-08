import { contextBridge, ipcRenderer } from 'electron';
import type {
  BaseEntity,
  BaseRecord,
  ProjectInput,
  SchoolProject,
  SchoolSettings,
} from './types.js';

export type SolverProgress = { progress: number; message: string };

export interface SchoolTimetableApi {
  projects: {
    getProjects: () => Promise<SchoolProject[]>;
    createProject: (input: ProjectInput) => Promise<SchoolProject>;
    updateProject: (id: string, updates: Partial<SchoolProject>) => Promise<SchoolProject>;
    deleteProject: (id: string) => Promise<void>;
  };
  baseData: {
    list: (projectId: string, entity: BaseEntity) => Promise<BaseRecord[]>;
    upsert: (projectId: string, entity: BaseEntity, record: BaseRecord) => Promise<BaseRecord>;
    delete: (projectId: string, entity: BaseEntity, id: string) => Promise<void>;
    getSettings: (projectId: string) => Promise<SchoolSettings>;
    saveSettings: (projectId: string, settings: SchoolSettings) => Promise<SchoolSettings>;
  };
  files: {
    save: (requestOrName: unknown, binary?: Uint8Array) => Promise<unknown>;
    choose: () => Promise<{ path: string; content: string } | undefined>;
    read: (path: string) => Promise<string>;
  };
  backup: {
    restoreAtomic: (backup: unknown) => Promise<void>;
  };
  solver: {
    available: () => Promise<boolean>;
    solve: (input: unknown, profile?: unknown) => Promise<unknown>;
    cancel: () => Promise<boolean>;
    onProgress: (listener: (progress: SolverProgress) => void) => () => void;
  };
}

const api: SchoolTimetableApi = {
  projects: {
    getProjects: () => ipcRenderer.invoke('projects:list'),
    createProject: (input) => ipcRenderer.invoke('projects:create', input),
    updateProject: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
    deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  },
  baseData: {
    list: (projectId, entity) => ipcRenderer.invoke('base-data:list', projectId, entity),
    upsert: (projectId, entity, record) =>
      ipcRenderer.invoke('base-data:upsert', projectId, entity, record),
    delete: (projectId, entity, id) =>
      ipcRenderer.invoke('base-data:delete', projectId, entity, id),
    getSettings: (projectId) => ipcRenderer.invoke('settings:get', projectId),
    saveSettings: (projectId, settings) =>
      ipcRenderer.invoke('settings:save', projectId, settings),
  },
  files: {
    save: (requestOrName, binary) => ipcRenderer.invoke('files:save', requestOrName, binary),
    choose: () => ipcRenderer.invoke('files:choose-backup'),
    read: (path) => ipcRenderer.invoke('files:read', path),
  },
  backup: {
    restoreAtomic: (backup) => ipcRenderer.invoke('backup:restore-atomic', backup),
  },
  solver: {
    available: () => ipcRenderer.invoke('solver:available'),
    solve: (input, profile) => ipcRenderer.invoke('solver:solve', input, profile),
    cancel: () => ipcRenderer.invoke('solver:cancel'),
    onProgress: (listener) => {
      const callback = (_event: Electron.IpcRendererEvent, progress: SolverProgress) => listener(progress);
      ipcRenderer.on('solver:progress', callback);
      return () => ipcRenderer.removeListener('solver:progress', callback);
    },
  },
};

contextBridge.exposeInMainWorld('schoolTimetable', api);
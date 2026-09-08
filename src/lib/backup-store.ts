import { baseDataStore, type BaseEntity, type BaseRecord, type SchoolSettings } from './base-data-store';
import { projectStore, type SchoolProject } from './store';

/**
 * Keep this list explicit rather than deriving it from the UI.  In particular,
 * operational data is just as important as the master data when a timetable is
 * restored.  New BaseEntity values should be added here when they are added to
 * the data store.
 */
export const BACKUP_ENTITIES = [
  'teachers', 'classes', 'subjects', 'rooms',
  'assignments', 'lesson_sets', 'lesson_set_members',
  'teacher_constraints', 'fixed_lessons', 'joint_lessons',
  'weight_profiles', 'timetable_candidates', 'working_timetables', 'timetable_locks',
  // Stage 10 operational entities.
  'daily_schedule_changes', 'teacher_absences', 'substitute_assignments',
  'substitute_draws', 'operation_logs',
] as const;

export interface BackupProject {
  project: SchoolProject;
  settings: SchoolSettings;
  records: Record<string, BaseRecord[]>;
}

export interface SchoolTimetableBackup {
  format: 'school-timetable-backup';
  schemaVersion: 1;
  appVersion: string;
  createdAt: string;
  projects: BackupProject[];
  checksum: string;
}

type DesktopFiles = {
  save?: (file: { filename: string; content: string; mimeType?: string }) => Promise<unknown>;
  choose?: () => Promise<string | { path?: string; content?: string } | undefined>;
  read?: (path: string) => Promise<string>;
  readFile?: (path: string) => Promise<string>;
};

type DesktopBackup = {
  restoreAtomic?: (backup: SchoolTimetableBackup) => Promise<void>;
};

const APP_VERSION = '0.0.0';
const PROJECTS_KEY = 'school_timetable_projects';
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const api = () => (window as Window & {
  schoolTimetable?: { files?: DesktopFiles; backup?: DesktopBackup };
}).schoolTimetable;

/** Produces stable JSON so a checksum does not depend on object insertion order. */
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
};

const digest = async (payload: unknown): Promise<string> => {
  if (!globalThis.crypto?.subtle) throw new Error('이 브라우저에서는 안전한 백업 검사를 지원하지 않습니다.');
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const payloadOf = (backup: Omit<SchoolTimetableBackup, 'checksum'>) => ({
  format: backup.format,
  schemaVersion: backup.schemaVersion,
  appVersion: backup.appVersion,
  createdAt: backup.createdAt,
  projects: backup.projects,
});

const unsupportedEntity = (error: unknown) =>
  error instanceof Error && /허용되지 않는 데이터 항목|unsupported entity|unknown entity/i.test(error.message);

async function projectBackup(project: SchoolProject): Promise<BackupProject> {
  const records: Record<string, BaseRecord[]> = {};
  for (const entity of BACKUP_ENTITIES) {
    try {
      records[entity] = await baseDataStore.list(project.id, entity as BaseEntity);
    } catch (error) {
      // Allows an older desktop main process to open this module before its
      // Stage 10 tables have been migrated. Other read failures must be shown.
      if (unsupportedEntity(error)) continue;
      throw error;
    }
  }
  return { project, settings: await baseDataStore.getSettings(project.id), records };
}

export async function buildFullBackup(): Promise<SchoolTimetableBackup> {
  const projects = await projectStore.getProjects();
  const payload: Omit<SchoolTimetableBackup, 'checksum'> = {
    format: 'school-timetable-backup',
    schemaVersion: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    projects: await Promise.all(projects.map(projectBackup)),
  };
  return { ...payload, checksum: await digest(payloadOf(payload)) };
}

const fileName = (createdAt: string) =>
  `school-timetable-${createdAt.replace(/[:.]/g, '-')}.schoolttbackup`;

/** Creates and persists a complete backup, returning its serialized contents. */
export async function createFullBackup(): Promise<string> {
  const backup = await buildFullBackup();
  const content = JSON.stringify(backup, null, 2);
  const files = api()?.files;
  if (files?.save) {
    await files.save({ filename: fileName(backup.createdAt), content, mimeType: 'application/json' });
    return content;
  }

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName(backup.createdAt);
  anchor.click();
  URL.revokeObjectURL(url);
  return content;
}

export async function chooseBackupFile(): Promise<string | undefined> {
  const files = api()?.files;
  if (!files?.choose) throw new Error('데스크톱 파일 선택 기능을 사용할 수 없습니다.');
  const selected = await files.choose();
  if (!selected) return undefined;
  if (typeof selected === 'object' && typeof selected.content === 'string') return selected.content;
  const path = typeof selected === 'string' ? selected : selected.path;
  if (!path) return undefined;
  return readBackupFile(path);
}

export async function readBackupFile(path: string): Promise<string> {
  const files = api()?.files;
  const reader = files?.read ?? files?.readFile;
  if (!reader) throw new Error('데스크톱 파일 읽기 기능을 사용할 수 없습니다.');
  try {
    return await reader(path);
  } catch {
    throw new Error('백업 파일을 읽을 수 없습니다.');
  }
}

async function validate(text: string): Promise<SchoolTimetableBackup> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('백업 파일이 올바른 JSON 형식이 아닙니다.');
  }
  if (!isObject(value) || value.format !== 'school-timetable-backup' || value.schemaVersion !== 1 ||
    typeof value.appVersion !== 'string' || typeof value.createdAt !== 'string' ||
    !Array.isArray(value.projects) || typeof value.checksum !== 'string') {
    throw new Error('지원하지 않거나 손상된 백업 파일입니다.');
  }
  for (const item of value.projects) {
    if (!isObject(item) || !isObject(item.project) || typeof item.project.id !== 'string' ||
      !isObject(item.settings) || !isObject(item.records) ||
      Object.values(item.records).some((records) => !Array.isArray(records))) {
      throw new Error('백업 파일의 프로젝트 데이터 형식이 올바르지 않습니다.');
    }
  }
  const backup = value as unknown as SchoolTimetableBackup;
  const expected = await digest(payloadOf(backup));
  if (expected !== backup.checksum) throw new Error('백업 파일의 무결성 검사에 실패했습니다.');
  return backup;
}

const relevantStorageKeys = () => Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  .filter((key): key is string => key === PROJECTS_KEY || !!key?.startsWith('base_data_'));

async function restoreInBrowser(backup: SchoolTimetableBackup): Promise<void> {
  const snapshot = new Map(relevantStorageKeys().map((key) => [key, localStorage.getItem(key)]));
  try {
    relevantStorageKeys().forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(backup.projects.map(({ project }) => project)));
    for (const { project, settings, records } of backup.projects) {
      localStorage.setItem(`base_data_${project.id}_settings`, JSON.stringify(settings));
      for (const [entity, entries] of Object.entries(records)) {
        localStorage.setItem(`base_data_${project.id}_${entity}`, JSON.stringify(entries));
      }
    }
  } catch (error) {
    try {
      relevantStorageKeys().forEach((key) => localStorage.removeItem(key));
      snapshot.forEach((value, key) => {
        if (value !== null) localStorage.setItem(key, value);
      });
    } catch {
      throw new Error('복원에 실패했고 이전 데이터를 되돌리지 못했습니다.');
    }
    throw new Error(`복원에 실패하여 이전 데이터로 되돌렸습니다.${error instanceof Error ? ` (${error.message})` : ''}`);
  }
}

/** Validates before changing anything, then makes a safety backup and restores atomically. */
export async function restoreFullBackup(text: string): Promise<void> {
  const backup = await validate(text);
  const atomicRestore = api()?.backup?.restoreAtomic;
  if (atomicRestore) {
    try {
      await atomicRestore(backup);
      return;
    } catch (error) {
      throw new Error(`백업 복원에 실패했습니다.${error instanceof Error ? ` (${error.message})` : ''}`);
    }
  }
  // Browsers cannot write a silent automatic backup, so download it before
  // replacing localStorage. Desktop creates its safety copy in the main process.
  await createFullBackup();
  await restoreInBrowser(backup);
}
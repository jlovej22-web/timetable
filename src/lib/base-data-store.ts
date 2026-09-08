import { projectStore } from './store';

export type BaseEntity =
  | 'teachers' | 'classes' | 'subjects' | 'rooms'
  | 'assignments' | 'lesson_sets' | 'lesson_set_members'
  | 'teacher_constraints' | 'fixed_lessons' | 'joint_lessons'
  | 'weight_profiles' | 'timetable_candidates' | 'working_timetables' | 'timetable_locks'
  | 'daily_schedule_changes' | 'teacher_absences' | 'substitute_assignments'
  | 'substitute_draws' | 'operation_logs';
export type BaseRecord = Record<string, any>;
export type SchoolSettings = {
  schoolName?: string;
  schoolYear?: number;
  semester?: 1 | 2;
  operatingDays: string[];
  periodsByDay: Record<string, number>;
  lunchAfterPeriod: number;
  splitAroundLunch: boolean;
};

type BaseDataApi = {
  list(projectId: string, entity: BaseEntity): Promise<BaseRecord[]>;
  upsert(projectId: string, entity: BaseEntity, record: BaseRecord): Promise<BaseRecord | void>;
  delete(projectId: string, entity: BaseEntity, id: string): Promise<void>;
  getSettings(projectId: string): Promise<SchoolSettings>;
  saveSettings(projectId: string, settings: SchoolSettings): Promise<SchoolSettings | void>;
};

const storageKey = (projectId: string, entity: string) =>
  `base_data_${projectId}_${entity}`;

const localApi: BaseDataApi = {
  async list(projectId, entity) {
    const data = localStorage.getItem(storageKey(projectId, entity));
    return data ? JSON.parse(data) as BaseRecord[] : [];
  },
  async upsert(projectId, entity, record) {
    const data = await this.list(projectId, entity);
    const index = data.findIndex((item) => item.id === record.id);
    if (index >= 0) data[index] = record;
    else data.push(record);
    localStorage.setItem(storageKey(projectId, entity), JSON.stringify(data));
    return record;
  },
  async delete(projectId, entity, id) {
    const classes = await this.list(projectId, 'classes');
    const teachers = await this.list(projectId, 'teachers');
    const assignments = await this.list(projectId, 'assignments');
    const lessonSets = await this.list(projectId, 'lesson_sets');
    const lessonSetMembers = await this.list(projectId, 'lesson_set_members');
    const teacherConstraints = await this.list(projectId, 'teacher_constraints');
    const fixedLessons = await this.list(projectId, 'fixed_lessons');
    const jointLessons = await this.list(projectId, 'joint_lessons');
    const referenced =
      (entity === 'teachers' && (classes.some((v) => v.teacherId === id) || assignments.some((v) => v.teacherId === id) || lessonSetMembers.some((v) => v.teacherId === id) || teacherConstraints.some((v) => v.teacherId === id) || jointLessons.some((v) => v.teacherIds?.includes(id)))) ||
      (entity === 'classes' && (assignments.some((v) => v.classId === id) || lessonSets.some((v) => v.classIds?.includes(id)) || jointLessons.some((v) => v.classIds?.includes(id)))) ||
      (entity === 'subjects' && (teachers.some((v) => v.subjectId === id) || assignments.some((v) => v.subjectId === id) || lessonSetMembers.some((v) => v.subjectId === id) || jointLessons.some((v) => v.subjectIds?.includes(id)))) ||
      (entity === 'rooms' && (assignments.some((v) => v.roomId === id) || lessonSetMembers.some((v) => v.roomId === id) || jointLessons.some((v) => v.roomId === id))) ||
      (entity === 'assignments' && fixedLessons.some((v) => v.assignmentId === id)) ||
      (entity === 'lesson_sets' && (assignments.some((v) => v.setId === id) || lessonSetMembers.some((v) => v.setId === id) || jointLessons.some((v) => v.linkedGroupId === id)));
    if (referenced) throw new Error('다른 자료에서 사용 중이므로 삭제할 수 없습니다.');
    const data = await this.list(projectId, entity);
    localStorage.setItem(
      storageKey(projectId, entity),
      JSON.stringify(data.filter((item) => item.id !== id)),
    );
  },
  async getSettings(projectId) {
    const data = localStorage.getItem(storageKey(projectId, 'settings'));
    return data ? JSON.parse(data) as SchoolSettings : {
      operatingDays: ['월', '화', '수', '목', '금'],
      periodsByDay: { 월: 7, 화: 7, 수: 6, 목: 7, 금: 7 },
      lunchAfterPeriod: 4,
      splitAroundLunch: true,
    };
  },
  async saveSettings(projectId, settings) {
    localStorage.setItem(storageKey(projectId, 'settings'), JSON.stringify(settings));
    await projectStore.updateProject(projectId, {
      schoolName: settings.schoolName,
      schoolYear: settings.schoolYear,
      semester: settings.semester,
    });
    return settings;
  },
};

const desktopApi = (window as Window & {
  schoolTimetable?: { baseData?: BaseDataApi };
}).schoolTimetable?.baseData;

export const baseDataStore = {
  ...(desktopApi ?? localApi),
  remove(projectId: string, entity: BaseEntity, id: string) {
    return (desktopApi ?? localApi).delete(projectId, entity, id);
  },
};
import { DatabaseSync } from 'node:sqlite';
import type {
  BaseEntity,
  BaseRecord,
  ProjectInput,
  SchoolProject,
  SchoolSettings,
} from './types.js';

type ProjectRow = {
  id: string;
  school_name: string;
  school_year: number;
  semester: number;
  project_name: string;
  status: '준비 중' | '진행 중' | '완료';
  created_at: string;
  updated_at: string;
};

const toProject = (row: ProjectRow): SchoolProject => ({
  id: row.id,
  schoolName: row.school_name,
  schoolYear: row.school_year,
  semester: row.semester as 1 | 2,
  projectName: row.project_name,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class ProjectDatabase {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS school_projects (
        id TEXT PRIMARY KEY,
        school_name TEXT NOT NULL,
        school_year INTEGER NOT NULL CHECK(school_year BETWEEN 2000 AND 2200),
        semester INTEGER NOT NULL CHECK(semester IN (1, 2)),
        project_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '준비 중' CHECK(status IN ('준비 중', '진행 중', '완료')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_school_projects_updated_at
        ON school_projects(updated_at DESC);
      CREATE TABLE IF NOT EXISTS school_settings (
        project_id TEXT PRIMARY KEY REFERENCES school_projects(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS teachers (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS classes (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS subjects (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS rooms (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS assignments (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS lesson_sets (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS lesson_set_members (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS teacher_constraints (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS fixed_lessons (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS joint_lessons (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS timetable_candidates (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS weight_profiles (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS timetable_locks (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS working_timetables (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS daily_schedule_changes (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS teacher_absences (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS substitute_assignments (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS substitute_draws (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE TABLE IF NOT EXISTS operation_logs (
        project_id TEXT NOT NULL REFERENCES school_projects(id) ON DELETE CASCADE,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, entity_id)
      );
      CREATE INDEX IF NOT EXISTS idx_teachers_project ON teachers(project_id);
      CREATE INDEX IF NOT EXISTS idx_classes_project ON classes(project_id);
      CREATE INDEX IF NOT EXISTS idx_subjects_project ON subjects(project_id);
      CREATE INDEX IF NOT EXISTS idx_rooms_project ON rooms(project_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_project ON assignments(project_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_sets_project ON lesson_sets(project_id);
      CREATE INDEX IF NOT EXISTS idx_lesson_set_members_project ON lesson_set_members(project_id);
      CREATE INDEX IF NOT EXISTS idx_teacher_constraints_project ON teacher_constraints(project_id);
      CREATE INDEX IF NOT EXISTS idx_fixed_lessons_project ON fixed_lessons(project_id);
      CREATE INDEX IF NOT EXISTS idx_joint_lessons_project ON joint_lessons(project_id);
      CREATE INDEX IF NOT EXISTS idx_timetable_candidates_project ON timetable_candidates(project_id);
      CREATE INDEX IF NOT EXISTS idx_weight_profiles_project ON weight_profiles(project_id);
      CREATE INDEX IF NOT EXISTS idx_timetable_locks_project ON timetable_locks(project_id);
      CREATE INDEX IF NOT EXISTS idx_working_timetables_project ON working_timetables(project_id);
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (1, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (2, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (3, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (4, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (5, datetime('now'));
      INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (6, datetime('now'));
    `);
  }

  restoreAtomic(backup: any): void {
    const entities: BaseEntity[] = [
      'teachers', 'classes', 'subjects', 'rooms', 'assignments', 'lesson_sets',
      'lesson_set_members', 'teacher_constraints', 'fixed_lessons', 'joint_lessons',
      'weight_profiles', 'timetable_candidates', 'working_timetables', 'timetable_locks',
      'daily_schedule_changes', 'teacher_absences', 'substitute_assignments',
      'substitute_draws', 'operation_logs',
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM school_projects');
      for (const item of backup.projects) {
        const project = item.project;
        this.db.prepare(`
          INSERT INTO school_projects(id, school_name, school_year, semester, project_name, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(project.id, project.schoolName, project.schoolYear, project.semester, project.projectName,
          project.status, project.createdAt, project.updatedAt);
        this.saveSettings(project.id, {
          schoolName: project.schoolName,
          schoolYear: project.schoolYear,
          semester: project.semester,
          operatingDays: ['월', '화', '수', '목', '금'],
          periodsByDay: { 월: 7, 화: 7, 수: 7, 목: 7, 금: 7 },
          lunchAfterPeriod: 4,
          splitAroundLunch: true,
          ...item.settings,
        });
        for (const entity of entities) {
          for (const record of item.records?.[entity] ?? []) this.upsertBaseData(project.id, entity, record);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  backupDatabase(destinationPath: string): void {
    const escaped = destinationPath.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
  }

  list(): SchoolProject[] {
    const rows = this.db
      .prepare('SELECT * FROM school_projects ORDER BY updated_at DESC')
      .all() as ProjectRow[];
    return rows.map(toProject);
  }

  create(input: ProjectInput): SchoolProject {
    const project: SchoolProject = {
      id: crypto.randomUUID(),
      ...input,
      status: '준비 중',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO school_projects
        (id, school_name, school_year, semester, project_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project.id, project.schoolName, project.schoolYear, project.semester,
      project.projectName, project.status, project.createdAt, project.updatedAt);
    return project;
  }

  rename(id: string, projectName: string): SchoolProject {
    this.db.prepare(
      'UPDATE school_projects SET project_name = ?, updated_at = ? WHERE id = ?',
    ).run(projectName, new Date().toISOString(), id);
    return this.getRequired(id);
  }

  update(id: string, updates: Partial<SchoolProject>): SchoolProject {
    const current = this.getRequired(id);
    const next = { ...current, ...updates, id, updatedAt: new Date().toISOString() };
    this.db.prepare(`
      UPDATE school_projects
      SET school_name = ?, school_year = ?, semester = ?, project_name = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(next.schoolName, next.schoolYear, next.semester, next.projectName,
      next.status, next.updatedAt, id);
    return this.getRequired(id);
  }

  duplicate(id: string): SchoolProject {
    const source = this.getRequired(id);
    return this.create({
      schoolName: source.schoolName,
      schoolYear: source.schoolYear,
      semester: source.semester,
      projectName: `${source.projectName} 복사본`,
    });
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM school_projects WHERE id = ?').run(id);
  }

  touch(id: string): SchoolProject {
    this.db.prepare(
      'UPDATE school_projects SET updated_at = ? WHERE id = ?',
    ).run(new Date().toISOString(), id);
    return this.getRequired(id);
  }

  listBaseData(projectId: string, entity: BaseEntity): BaseRecord[] {
    this.assertEntity(entity);
    return (this.db.prepare(
      `SELECT data_json FROM ${entity} WHERE project_id = ? ORDER BY entity_id`,
    ).all(projectId) as { data_json: string }[]).map((row) =>
      JSON.parse(row.data_json) as BaseRecord);
  }

  upsertBaseData(projectId: string, entity: BaseEntity, record: BaseRecord): BaseRecord {
    this.assertEntity(entity);
    const id = String(record.id ?? '').trim();
    if (!id) throw new Error('ID는 필수입니다.');
    const now = new Date().toISOString();
    const exists = this.db.prepare(
      `SELECT 1 FROM ${entity} WHERE project_id = ? AND entity_id = ?`,
    ).get(projectId, id);
    if (exists) {
      this.db.prepare(
        `UPDATE ${entity} SET data_json = ?, updated_at = ? WHERE project_id = ? AND entity_id = ?`,
      ).run(JSON.stringify(record), now, projectId, id);
    } else {
      this.db.prepare(
        `INSERT INTO ${entity}(project_id, entity_id, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(projectId, id, JSON.stringify(record), now, now);
    }
    return record;
  }

  removeBaseData(projectId: string, entity: BaseEntity, id: string): void {
    this.assertEntity(entity);
    const classes = this.listBaseData(projectId, 'classes');
    const teachers = this.listBaseData(projectId, 'teachers');
    const assignments = this.listBaseData(projectId, 'assignments');
    const lessonSets = this.listBaseData(projectId, 'lesson_sets');
    const lessonSetMembers = this.listBaseData(projectId, 'lesson_set_members');
    const teacherConstraints = this.listBaseData(projectId, 'teacher_constraints');
    const fixedLessons = this.listBaseData(projectId, 'fixed_lessons');
    const jointLessons = this.listBaseData(projectId, 'joint_lessons');
    const referenced =
      (entity === 'teachers' && (
        classes.some((item) => item.teacherId === id) ||
        assignments.some((item) => item.teacherId === id) ||
        lessonSetMembers.some((item) => item.teacherId === id) ||
        teacherConstraints.some((item) => item.teacherId === id) ||
        jointLessons.some((item) => Array.isArray(item.teacherIds) && item.teacherIds.includes(id))
      )) ||
      (entity === 'classes' && (
        assignments.some((item) => item.classId === id) ||
        lessonSets.some((item) => Array.isArray(item.classIds) && item.classIds.includes(id)) ||
        jointLessons.some((item) => Array.isArray(item.classIds) && item.classIds.includes(id))
      )) ||
      (entity === 'subjects' && (
        teachers.some((item) => item.subjectId === id) ||
        assignments.some((item) => item.subjectId === id) ||
        lessonSetMembers.some((item) => item.subjectId === id) ||
        jointLessons.some((item) => Array.isArray(item.subjectIds) && item.subjectIds.includes(id))
      )) ||
      (entity === 'rooms' && (
        assignments.some((item) => item.roomId === id) ||
        lessonSetMembers.some((item) => item.roomId === id) ||
        jointLessons.some((item) => item.roomId === id)
      )) ||
      (entity === 'assignments' && fixedLessons.some((item) => item.assignmentId === id)) ||
      (entity === 'lesson_sets' && (
        assignments.some((item) => item.setId === id) ||
        lessonSetMembers.some((item) => item.setId === id) ||
        jointLessons.some((item) => item.linkedGroupId === id)
      ));
    if (referenced) throw new Error('다른 자료에서 사용 중이므로 삭제할 수 없습니다.');
    this.db.prepare(
      `DELETE FROM ${entity} WHERE project_id = ? AND entity_id = ?`,
    ).run(projectId, id);
  }

  getSettings(projectId: string): SchoolSettings {
    const row = this.db.prepare(
      'SELECT data_json FROM school_settings WHERE project_id = ?',
    ).get(projectId) as { data_json: string } | undefined;
    if (row) return JSON.parse(row.data_json) as SchoolSettings;
    const project = this.getRequired(projectId);
    return {
      schoolName: project.schoolName,
      schoolYear: project.schoolYear,
      semester: project.semester,
      operatingDays: ['월', '화', '수', '목', '금'],
      periodsByDay: { 월: 7, 화: 7, 수: 6, 목: 7, 금: 7 },
      lunchAfterPeriod: 4,
      splitAroundLunch: true,
    };
  }

  saveSettings(projectId: string, settings: SchoolSettings): SchoolSettings {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO school_settings(project_id, data_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
    `).run(projectId, JSON.stringify(settings), now);
    this.update(projectId, {
      schoolName: settings.schoolName,
      schoolYear: settings.schoolYear,
      semester: settings.semester,
    });
    return settings;
  }

  private assertEntity(entity: string): asserts entity is BaseEntity {
    if (![
      'teachers', 'classes', 'subjects', 'rooms', 'assignments', 'lesson_sets',
      'lesson_set_members', 'teacher_constraints', 'fixed_lessons', 'joint_lessons',
      'timetable_candidates', 'working_timetables',
      'weight_profiles',
      'timetable_locks',
      'daily_schedule_changes', 'teacher_absences', 'substitute_assignments',
      'substitute_draws', 'operation_logs',
    ].includes(entity)) {
      throw new Error('지원하지 않는 기초자료 유형입니다.');
    }
  }

  private getRequired(id: string): SchoolProject {
    const row = this.db.prepare(
      'SELECT * FROM school_projects WHERE id = ?',
    ).get(id) as ProjectRow | undefined;
    if (!row) throw new Error('프로젝트를 찾을 수 없습니다.');
    return toProject(row);
  }
}
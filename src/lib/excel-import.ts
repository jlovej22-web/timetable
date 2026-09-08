import type { BaseEntity, BaseRecord, SchoolSettings } from './base-data-store';

export type ImportSeverity = 'critical' | 'warning';
export type ImportEntity = Exclude<BaseEntity,
  'timetable_candidates' | 'working_timetables' |
  'daily_schedule_changes' | 'teacher_absences' | 'substitute_assignments' |
  'substitute_draws' | 'operation_logs'>;
export type ImportIssue = {
  severity: ImportSeverity;
  sheet: string;
  row: number;
  message: string;
};
export type ImportPreview = {
  fileName: string;
  settings: SchoolSettings;
  records: Record<ImportEntity, BaseRecord[]>;
  initialWorkingTimetable?: BaseRecord;
  issues: ImportIssue[];
};

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const BASE_SHEETS = ['01_학교설정', '02_교사', '03_학급', '04_과목', '08_특별실'];
const ADVANCED_SHEETS = [
  '05_수업배정', '06_세트수업', '07_세트구성',
  '09_교사조건', '10_고정수업', '11_공동교차수업',
];
const OPTIONAL_SHEETS = ['12_가중치프로필', '12_현재시간표', '13_잠금목록'];
const text = (value: unknown) => String(value ?? '').trim();
const number = (value: unknown) => Number(value);
const list = (value: unknown) => text(value).split(',').map((v) => v.trim()).filter(Boolean);

function rowsFromSheet(rows: unknown[][] = []) {
  const headers = (rows[0] ?? []).map(text);
  return rows.slice(1)
    .filter((values) => values.some((value) => text(value) !== ''))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
}

function validateIds(
  sheet: string,
  rows: BaseRecord[],
  issues: ImportIssue[],
) {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const id = text(row.id);
    if (!id) issues.push({ severity: 'critical', sheet, row: index + 2, message: 'ID는 필수입니다.' });
    else if (seen.has(id)) issues.push({ severity: 'critical', sheet, row: index + 2, message: `중복 ID: ${id}` });
    seen.add(id);
  });
}

function validateYesNo(sheet: string, rows: BaseRecord[], fields: string[], issues: ImportIssue[]) {
  rows.forEach((row, index) => fields.forEach((field) => {
    if (!['Y', 'N'].includes(text(row[field]))) {
      issues.push({ severity: 'critical', sheet, row: index + 2, message: `${field} 값은 Y 또는 N이어야 합니다.` });
    }
  }));
}

export async function parseExcelImport(file: File): Promise<ImportPreview> {
  const XLSX = await import('@e965/xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetNames = workbook.SheetNames;
  const issues: ImportIssue[] = [];

  for (const name of BASE_SHEETS) {
    if (!sheetNames.includes(name)) {
      issues.push({ severity: 'critical', sheet: name, row: 0, message: '필수 시트가 없습니다.' });
    }
  }
  const hasAdvancedSheets = ADVANCED_SHEETS.some((name) => sheetNames.includes(name));
  if (hasAdvancedSheets) {
    for (const name of ADVANCED_SHEETS) {
      if (!sheetNames.includes(name)) {
        issues.push({ severity: 'critical', sheet: name, row: 0, message: '4단계 전체 Import 필수 시트가 없습니다.' });
      }
    }
  }
  if (issues.length) {
    return {
      fileName: file.name,
      settings: { operatingDays: [], periodsByDay: {}, lunchAfterPeriod: 4, splitAroundLunch: true },
      records: {
        teachers: [], classes: [], subjects: [], rooms: [], assignments: [],
        lesson_sets: [], lesson_set_members: [], teacher_constraints: [],
        fixed_lessons: [], joint_lessons: [], weight_profiles: [], timetable_locks: [],
      },
      issues,
    };
  }

  const sheets = Object.fromEntries([...BASE_SHEETS, ...ADVANCED_SHEETS, ...OPTIONAL_SHEETS].map((name) => [
    name,
    workbook.Sheets[name] ? XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
    }) : [],
  ]));
  const settingRow = rowsFromSheet(sheets['01_학교설정'])[0] ?? {};
  const operatingDays = list(settingRow['운영요일']);
  const settings: SchoolSettings = {
    schoolName: text(settingRow['학교명']),
    schoolYear: number(settingRow['학년도']),
    semester: number(settingRow['학기']) as 1 | 2,
    operatingDays,
    periodsByDay: Object.fromEntries(DAYS.map((day) => [day, number(settingRow[`${day}교시`]) || 0])),
    lunchAfterPeriod: Math.max(0, number(settingRow['점심시작교시']) - 1),
    splitAroundLunch: true,
  };
  if (!settings.schoolName || !Number.isInteger(settings.schoolYear) || ![1, 2].includes(settings.semester ?? 0)) {
    issues.push({ severity: 'critical', sheet: '01_학교설정', row: 2, message: '학교명·학년도·학기를 확인하세요.' });
  }
  if (operatingDays.some((day) => !DAYS.includes(day))) {
    issues.push({ severity: 'critical', sheet: '01_학교설정', row: 2, message: '운영요일 형식이 올바르지 않습니다.' });
  }

  const subjectRows = rowsFromSheet(sheets['04_과목']).map((row) => ({
    id: text(row['과목ID']), name: text(row['과목명']), grade: number(row['학년']),
    weeklyHours: number(row['기본주당시수']), lessonType: text(row['수업유형']),
    requiresSpecialRoom: text(row['특별실필요']), consecutiveRequired: text(row['연속수업필수']),
    consecutivePeriods: number(row['연속교시수']), allowDailyDuplicate: text(row['하루중복허용']),
    preferDayDistribution: text(row['요일분산선호']), notes: text(row['비고']),
  }));
  const subjectIdByName = new Map(subjectRows.map((row) => [row.name, row.id]));
  const teacherRows = rowsFromSheet(sheets['02_교사']).map((row) => ({
    id: text(row['교사ID']), name: text(row['교사명']), department: text(row['소속/교과']),
    subjectName: text(row['담당과목']), subjectId: subjectIdByName.get(text(row['담당과목'])) ?? '',
    maxHours: number(row['주당기준시수']), teacherType: text(row['교사유형']),
    workDays: text(row['근무요일']), dailyMaxHours: number(row['하루최대시수']),
    maxConsecutive: number(row['최대연속수업']), active: text(row['사용여부']), notes: text(row['비고']),
  }));
  const classRows = rowsFromSheet(sheets['03_학급']).map((row) => ({
    id: text(row['학급ID']), grade: number(row['학년']), classNumber: number(row['반']),
    displayName: text(row['학급표시명']), teacherId: text(row['담임교사ID']),
    studentCount: number(row['학생수']), defaultRoom: text(row['기본교실']),
    active: text(row['사용여부']), notes: text(row['비고']),
  }));
  const roomRows = rowsFromSheet(sheets['08_특별실']).map((row) => ({
    id: text(row['특별실ID']), name: text(row['특별실명']), roomType: text(row['유형']),
    capacity: number(row['동시수용수']), availableDays: text(row['사용가능요일']),
    unavailableTimes: text(row['사용불가시간']), active: text(row['사용여부']), notes: text(row['비고']),
  }));
  const assignmentRows = rowsFromSheet(sheets['05_수업배정']).map((row) => ({
    id: text(row['배정ID']), classId: text(row['학급ID']), subjectId: text(row['과목ID']),
    teacherId: text(row['교사ID']), weeklyHours: number(row['주당시수']),
    lessonType: text(row['수업유형']), roomId: text(row['특별실ID']), setId: text(row['세트ID']),
    consecutivePeriods: number(row['연속교시수']), priority: number(row['우선순위']), notes: text(row['비고']),
  }));
  const lessonSetRows = rowsFromSheet(sheets['06_세트수업']).map((row) => ({
    id: text(row['세트ID']), name: text(row['세트명']), classIds: list(row['대상학급ID']),
    weeklyCount: number(row['주당횟수']), periodsPerSession: number(row['회당교시수']),
    consecutiveRequired: text(row['연속필수']), allowedDays: list(row['허용요일']),
    fixedTime: text(row['고정시간']), locked: text(row['잠금']), notes: text(row['비고']),
  }));
  const lessonSetMemberRows = rowsFromSheet(sheets['07_세트구성']).map((row) => ({
    id: text(row['구성ID']), setId: text(row['세트ID']), subjectId: text(row['과목ID']),
    teacherId: text(row['교사ID']), groupName: text(row['수업그룹명']), roomId: text(row['특별실ID']),
    classroom: text(row['사용교실']), targetDescription: text(row['대상학생/학급설명']), notes: text(row['비고']),
  }));
  const teacherConstraintRows = rowsFromSheet(sheets['09_교사조건']).map((row) => ({
    id: text(row['조건ID']), teacherId: text(row['교사ID']), constraintType: text(row['조건종류']),
    time: text(row['시간']), weight: number(row['가중치']), reason: text(row['사유']), active: text(row['사용여부']),
  }));
  const fixedLessonRows = rowsFromSheet(sheets['10_고정수업']).map((row) => ({
    id: text(row['고정ID']), assignmentId: text(row['배정ID']), fixedType: text(row['고정유형']),
    day: text(row['요일']), period: number(row['교시']) || null, allowedTimes: list(row['허용시간목록']),
    active: text(row['사용여부']), notes: text(row['비고']),
  }));
  const jointLessonRows = rowsFromSheet(sheets['11_공동교차수업']).map((row) => ({
    id: text(row['그룹ID']), type: text(row['유형']), name: text(row['그룹명']),
    classIds: list(row['대상학급ID']), subjectIds: list(row['과목ID']),
    teacherIds: list(row['교사ID목록']), linkedGroupId: text(row['연결그룹ID']),
    weeklyCount: number(row['주당횟수']), periodsPerSession: number(row['회당교시수']),
    roomId: text(row['특별실ID']), notes: text(row['비고']),
  }));
  const weightProfileRows = rowsFromSheet(sheets['12_가중치프로필']).map((row) => ({
    id: text(row['프로필ID']), name: text(row['프로필명']),
    consecutive3: number(row['3연속']), consecutive4Plus: number(row['4연속이상']),
    gaps: number(row['중간공강']), dailyImbalance: number(row['일일수업불균형']),
    sameSubjectDaily: number(row['동일과목하루중복']), dayDistribution: number(row['요일분산']),
    firstPeriodBias: number(row['1교시편중']), lastPeriodBias: number(row['마지막교시편중']),
    preferredTimeReward: number(row['선호시간보상']), dislikedTime: number(row['비선호시간']),
    teacherFairness: number(row['교사형평성']), notes: text(row['비고']),
  }));
  const lockRows = rowsFromSheet(sheets['13_잠금목록']).map((row) => ({
    id: text(row['LockID']), lockType: text(row['잠금유형']), targetId: text(row['대상ID/값']),
    scope: text(row['잠금범위']), description: text(row['설명']), active: text(row['사용여부']),
  }));
  const currentEntries = rowsFromSheet(sheets['12_현재시간표']).map((row, index) => {
    const sourceId = text(row['배정ID/세트ID']);
    const assignment = assignmentRows.find((value) => value.id === sourceId);
    const set = lessonSetRows.find((value) => value.id === sourceId);
    const members = set ? lessonSetMemberRows.filter((value) => value.setId === set.id) : [];
    return {
      entryId: text(row['EntryID']) || `E${index + 1}`,
      day: text(row['요일']), period: number(row['교시']), occurrence: index + 1,
      kind: set ? 'set' : 'assignment', groupId: set?.id,
      assignmentId: assignment?.id ?? '', classId: assignment?.classId ?? list(row['학급ID'])[0] ?? '',
      subjectId: assignment?.subjectId ?? members[0]?.subjectId ?? '',
      teacherId: assignment?.teacherId ?? list(row['교사ID'])[0] ?? '',
      roomId: assignment?.roomId ?? list(row['특별실ID'])[0] ?? '',
      classIds: set?.classIds ?? list(row['학급ID']),
      subjectIds: members.length ? members.map((value) => value.subjectId) : assignment ? [assignment.subjectId] : [],
      teacherIds: members.length ? members.map((value) => value.teacherId) : list(row['교사ID']),
      roomIds: members.length ? members.map((value) => value.roomId).filter(Boolean) : list(row['특별실ID']),
      sourceStatus: text(row['상태']), locked: text(row['잠금여부']) === 'Y', notes: text(row['비고']),
    };
  });

  const records = {
    teachers: teacherRows, classes: classRows, subjects: subjectRows, rooms: roomRows,
    assignments: assignmentRows, lesson_sets: lessonSetRows,
    lesson_set_members: lessonSetMemberRows, teacher_constraints: teacherConstraintRows,
    fixed_lessons: fixedLessonRows, joint_lessons: jointLessonRows,
    weight_profiles: weightProfileRows,
    timetable_locks: lockRows,
  };
  validateIds('02_교사', teacherRows, issues);
  validateIds('03_학급', classRows, issues);
  validateIds('04_과목', subjectRows, issues);
  validateIds('08_특별실', roomRows, issues);
  validateIds('05_수업배정', assignmentRows, issues);
  validateIds('06_세트수업', lessonSetRows, issues);
  validateIds('07_세트구성', lessonSetMemberRows, issues);
  validateIds('09_교사조건', teacherConstraintRows, issues);
  validateIds('10_고정수업', fixedLessonRows, issues);
  validateIds('11_공동교차수업', jointLessonRows, issues);
  validateIds('12_가중치프로필', weightProfileRows, issues);
  validateIds('13_잠금목록', lockRows, issues);
  validateYesNo('02_교사', teacherRows, ['active'], issues);
  validateYesNo('03_학급', classRows, ['active'], issues);
  validateYesNo('04_과목', subjectRows, ['requiresSpecialRoom', 'consecutiveRequired', 'allowDailyDuplicate', 'preferDayDistribution'], issues);
  validateYesNo('08_특별실', roomRows, ['active'], issues);
  validateYesNo('06_세트수업', lessonSetRows, ['consecutiveRequired', 'locked'], issues);
  validateYesNo('09_교사조건', teacherConstraintRows, ['active'], issues);
  validateYesNo('10_고정수업', fixedLessonRows, ['active'], issues);

  const teacherIds = new Set(teacherRows.map((row) => row.id));
  const classIds = new Set(classRows.map((row) => row.id));
  const subjectIds = new Set(subjectRows.map((row) => row.id));
  const roomIds = new Set(roomRows.map((row) => row.id));
  const assignmentIds = new Set(assignmentRows.map((row) => row.id));
  const lessonSetIds = new Set(lessonSetRows.map((row) => row.id));
  classRows.forEach((row, index) => {
    if (row.teacherId && !teacherIds.has(row.teacherId)) {
      issues.push({ severity: 'critical', sheet: '03_학급', row: index + 2, message: `담임교사ID ${row.teacherId}가 교사 시트에 없습니다.` });
    }
  });
  teacherRows.forEach((row, index) => {
    const namedSubjects = row.subjectName.split(/[\/,]/).map((value) => value.trim()).filter(Boolean);
    if (row.subjectName && !row.subjectId && !namedSubjects.every((name) => subjectIdByName.has(name))) {
      issues.push({ severity: 'warning', sheet: '02_교사', row: index + 2, message: `담당과목 '${row.subjectName}'을 과목 시트에서 찾지 못했습니다.` });
    }
    if (list(row.workDays).some((day) => !DAYS.includes(day))) {
      issues.push({ severity: 'critical', sheet: '02_교사', row: index + 2, message: '근무요일 형식이 올바르지 않습니다.' });
    }
  });
  roomRows.forEach((row, index) => {
    if (list(row.availableDays).some((day) => !DAYS.includes(day))) {
      issues.push({ severity: 'critical', sheet: '08_특별실', row: index + 2, message: '사용가능요일 형식이 올바르지 않습니다.' });
    }
    if (row.unavailableTimes && !list(row.unavailableTimes).every((v) => /^[월화수목금토일]-\d+$/.test(v))) {
      issues.push({ severity: 'critical', sheet: '08_특별실', row: index + 2, message: '사용불가시간은 월-1,수-6 형식이어야 합니다.' });
    }
  });
  const checkReference = (
    sheet: string, row: number, value: string, values: Set<string>, label: string, optional = false,
  ) => {
    if ((!value && optional) || values.has(value)) return;
    issues.push({ severity: 'critical', sheet, row, message: `${label} '${value}'을(를) 찾을 수 없습니다.` });
  };
  assignmentRows.forEach((row, index) => {
    checkReference('05_수업배정', index + 2, row.classId, classIds, '학급ID');
    checkReference('05_수업배정', index + 2, row.subjectId, subjectIds, '과목ID');
    checkReference('05_수업배정', index + 2, row.teacherId, teacherIds, '교사ID');
    checkReference('05_수업배정', index + 2, row.roomId, roomIds, '특별실ID', true);
    checkReference('05_수업배정', index + 2, row.setId, lessonSetIds, '세트ID', true);
  });
  lessonSetRows.forEach((row, index) => {
    row.classIds.forEach((id: string) => checkReference('06_세트수업', index + 2, id, classIds, '대상학급ID'));
    if (row.allowedDays.some((day: string) => !DAYS.includes(day))) {
      issues.push({ severity: 'critical', sheet: '06_세트수업', row: index + 2, message: '허용요일 형식이 올바르지 않습니다.' });
    }
  });
  lessonSetMemberRows.forEach((row, index) => {
    checkReference('07_세트구성', index + 2, row.setId, lessonSetIds, '세트ID');
    checkReference('07_세트구성', index + 2, row.subjectId, subjectIds, '과목ID');
    checkReference('07_세트구성', index + 2, row.teacherId, teacherIds, '교사ID');
    checkReference('07_세트구성', index + 2, row.roomId, roomIds, '특별실ID', true);
  });
  teacherConstraintRows.forEach((row, index) => {
    checkReference('09_교사조건', index + 2, row.teacherId, teacherIds, '교사ID');
    if (!['불가', '비선호', '선호'].includes(row.constraintType)) {
      issues.push({ severity: 'critical', sheet: '09_교사조건', row: index + 2, message: '조건종류는 불가·비선호·선호 중 하나여야 합니다.' });
    }
    if (!/^[월화수목금토일]-\d+$/.test(row.time)) {
      issues.push({ severity: 'critical', sheet: '09_교사조건', row: index + 2, message: '시간은 월-1 형식이어야 합니다.' });
    }
  });
  fixedLessonRows.forEach((row, index) => {
    checkReference('10_고정수업', index + 2, row.assignmentId, assignmentIds, '배정ID');
    if (!['정확고정', '요일고정', '교시고정', '허용범위'].includes(row.fixedType)) {
      issues.push({ severity: 'critical', sheet: '10_고정수업', row: index + 2, message: '지원하지 않는 고정유형입니다.' });
    }
  });
  jointLessonRows.forEach((row, index) => {
    row.classIds.forEach((id: string) => checkReference('11_공동교차수업', index + 2, id, classIds, '대상학급ID'));
    row.subjectIds.forEach((id: string) => checkReference('11_공동교차수업', index + 2, id, subjectIds, '과목ID'));
    row.teacherIds.forEach((id: string) => checkReference('11_공동교차수업', index + 2, id, teacherIds, '교사ID'));
    checkReference('11_공동교차수업', index + 2, row.roomId, roomIds, '특별실ID', true);
  });
  return {
    fileName: file.name, settings, records, issues,
    initialWorkingTimetable: currentEntries.length ? {
      id: 'current', appliedAt: new Date().toISOString(), source: 'excel-import',
      entries: currentEntries, locks: lockRows,
    } : undefined,
  };
}
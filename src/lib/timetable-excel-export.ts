import type { BaseRecord, SchoolSettings } from './base-data-store';
import type { TimetableEntry } from './timetable-solver';

export type TimetableExcelExportInput = {
  /** `entries` itself, or the current working timetable record containing it. */
  timetable: TimetableEntry[] | { entries?: TimetableEntry[] };
  settings: SchoolSettings;
  teachers: BaseRecord[];
  classes: BaseRecord[];
  subjects: BaseRecord[];
  rooms: BaseRecord[];
  fileName?: string;
  mode?: 'all-classes' | 'grade' | 'class' | 'all-teachers' | 'teacher' | 'rooms';
  targetId?: string;
};

export type TimetableExcelExportResult = {
  filename: string;
  sheetCount: number;
};

const weekdayName: Record<string, string> = {
  월: '월요일', 화: '화요일', 수: '수요일', 목: '목요일',
  금: '금요일', 토: '토요일', 일: '일요일',
};

const ids = (entry: TimetableEntry, plural: 'classIds' | 'teacherIds' | 'roomIds', singular: 'classId' | 'teacherId' | 'roomId') =>
  entry[plural]?.length ? entry[plural]! : entry[singular] ? [entry[singular]!] : [];

const recordName = (record: BaseRecord | undefined, fallback: string) =>
  String(record?.displayName ?? record?.name ?? fallback);

const safeFilePart = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '시간표';

/** Excel permits at most 31 characters and rejects a small set of punctuation. */
export const safeExcelSheetName = (value: string, used = new Set<string>()) => {
  const base = (value.replace(/[\\/?*\[\]:]/g, '_').trim() || '시간표').slice(0, 31);
  let name = base;
  let suffix = 2;
  while (used.has(name)) {
    const tail = ` (${suffix++})`;
    name = `${base.slice(0, 31 - tail.length)}${tail}`;
  }
  used.add(name);
  return name;
};

function dateStamp() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function addScheduleSheet(
  XLSX: any,
  workbook: any,
  usedNames: Set<string>,
  sheetTitle: string,
  entities: BaseRecord[],
  entityLabel: string,
  settings: SchoolSettings,
  entries: TimetableEntry[],
  matches: (entry: TimetableEntry, entity: BaseRecord) => boolean,
  lessonLabel: (entry: TimetableEntry) => string,
  schoolTitle: string,
) {
  const days = settings.operatingDays;
  const maxPeriods = Math.max(0, ...days.map((day) => Number(settings.periodsByDay[day] ?? 0)));
  const rows: (string | number)[][] = [
    [`${schoolTitle} ${sheetTitle}`, ...Array(days.length).fill('')],
    [`${entityLabel}별 주간 시간표`, ...Array(days.length).fill('')],
    ['교시', ...days.map((day) => weekdayName[day] ?? `${day}요일`)],
  ];
  const merges: any[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: days.length } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: days.length } },
  ];
  const headerRow = 2;

  entities.forEach((entity, entityIndex) => {
    const name = recordName(entity, String(entity.id));
    const detail = entityLabel === '학급' ? `${entity.grade ?? ''}학년 ${entity.classNumber ?? ''}반`.trim()
      : entityLabel === '특별실' ? String(entity.roomType ?? '')
        : entityLabel === '교사' ? String(entity.department ?? '')
          : '';
    const titleRow = rows.length;
    rows.push([`${name}${detail ? ` · ${detail}` : ''}`, ...Array(days.length).fill('')]);
    merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: days.length } });
    for (let period = 1; period <= maxPeriods; period += 1) {
      const row: (string | number)[] = [`${period}교시`];
      for (const day of days) {
        if (period > Number(settings.periodsByDay[day] ?? 0)) {
          row.push('—');
          continue;
        }
        const labels = entries
          .filter((entry) => entry.day === day && entry.period === period && matches(entry, entity))
          .map(lessonLabel);
        row.push([...new Set(labels)].join('\n') || '');
      }
      rows.push(row);
    }
    if (entityIndex < entities.length - 1) rows.push(Array(days.length + 1).fill(''));
  });
  if (!entities.length) rows.push(['표시할 대상이 없습니다.', ...Array(days.length).fill('')]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = merges;
  sheet['!cols'] = [{ wch: 11 }, ...days.map(() => ({ wch: 25 }))];
  sheet['!rows'] = rows.map((_, index) => ({ hpt: index === 0 ? 26 : index === 1 ? 20 : 38 }));
  for (let column = 0; column <= days.length; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1F4E78' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
  }
  rows.forEach((row, rowIndex) => {
    const isTitle = rowIndex < 2 || (rowIndex > headerRow && typeof row[0] === 'string' && !String(row[0]).endsWith('교시') && row.slice(1).every((cell) => cell === ''));
    for (let column = 0; column <= days.length; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
      if (!cell) continue;
      cell.s = {
        ...(cell.s ?? {}),
        font: isTitle ? { bold: true, sz: rowIndex === 0 ? 15 : 11 } : undefined,
        fill: isTitle ? { fgColor: { rgb: rowIndex === 0 ? 'D9EAF7' : 'EAF2F8' } } : undefined,
        alignment: { vertical: 'center', horizontal: column === 0 ? 'center' : 'left', wrapText: true },
        border: rowIndex >= headerRow ? { top: { style: 'thin', color: { rgb: 'D9E2F3' } }, bottom: { style: 'thin', color: { rgb: 'D9E2F3' } }, left: { style: 'thin', color: { rgb: 'D9E2F3' } }, right: { style: 'thin', color: { rgb: 'D9E2F3' } } } : undefined,
      };
    }
  });
  sheet['!pageSetup'] = { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
  sheet['!margins'] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
  XLSX.utils.book_append_sheet(workbook, sheet, safeExcelSheetName(sheetTitle, usedNames));
}

export async function exportTimetableExcel(input: TimetableExcelExportInput): Promise<TimetableExcelExportResult> {
  const XLSX = await import('@e965/xlsx');
  const entries = Array.isArray(input.timetable) ? input.timetable : input.timetable.entries ?? [];
  const settings = input.settings;
  const schoolTitle = input.settings.schoolName?.trim() || '학교';
  const teachers = input.teachers.filter((record) => record.active !== 'N');
  const classes = input.classes.filter((record) => record.active !== 'N');
  const rooms = input.rooms.filter((record) => record.active !== 'N');
  const teacherById = new Map(input.teachers.map((record) => [String(record.id), record]));
  const classById = new Map(input.classes.map((record) => [String(record.id), record]));
  const subjectById = new Map(input.subjects.map((record) => [String(record.id), record]));
  const roomById = new Map(input.rooms.map((record) => [String(record.id), record]));
  const names = (list: string[], records: Map<string, BaseRecord>) => list.map((id) => recordName(records.get(id), id)).join(', ');
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const summaryRows = [
    [`${schoolTitle} 시간표 내보내기`, ''],
    ['학년도', input.settings.schoolYear ?? ''], ['학기', input.settings.semester ?? ''],
    ['운영 요일', settings.operatingDays.map((day) => weekdayName[day] ?? day).join(', ')],
    ['수업 블록 수', entries.length], ['생성일', new Date().toLocaleString('ko-KR')],
    [], ['시트 안내', '학급별 · 학년별 · 교사별 · 특별실별 시간표는 인쇄용으로 구성되어 있습니다.'],
  ];
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 18 }, { wch: 70 }];
  summary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  summary['!rows'] = summaryRows.map((_, index) => ({ hpt: index === 0 ? 26 : 20 }));
  Object.keys(summary).filter((key) => !key.startsWith('!')).forEach((key) => {
    summary[key].s = { alignment: { vertical: 'center', wrapText: true }, border: { bottom: { style: 'thin', color: { rgb: 'D9E2F3' } } } };
  });
  summary.A1.s = { font: { bold: true, sz: 15 }, fill: { fgColor: { rgb: 'D9EAF7' } }, alignment: { horizontal: 'center', vertical: 'center' } };
  XLSX.utils.book_append_sheet(workbook, summary, safeExcelSheetName('요약', usedNames));

  const classLesson = (entry: TimetableEntry) => `${names(entry.subjectIds?.length ? entry.subjectIds : [entry.subjectId], subjectById)}\n${names(ids(entry, 'teacherIds', 'teacherId'), teacherById)}${ids(entry, 'roomIds', 'roomId').length ? ` · ${names(ids(entry, 'roomIds', 'roomId'), roomById)}` : ''}`;
  const grades = [...new Set(classes.map((record) => String(record.grade ?? '')).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).map((grade) => ({ id: grade, name: `${grade}학년`, grade }));
  const mode = input.mode ?? 'all-classes';
  if (mode === 'all-classes' || mode === 'class') addScheduleSheet(XLSX, workbook, usedNames, mode === 'class' ? '단일학급 시간표' : '전체학급 시간표', mode === 'class' ? classes.filter((value) => String(value.id) === input.targetId) : classes, '학급', settings, entries, (entry, entity) => ids(entry, 'classIds', 'classId').includes(String(entity.id)), classLesson, schoolTitle);
  if (mode === 'grade') addScheduleSheet(XLSX, workbook, usedNames, `${input.targetId}학년 시간표`, grades.filter((value) => String(value.id) === input.targetId), '학년', settings, entries, (entry, entity) => ids(entry, 'classIds', 'classId').some((id) => String(classById.get(id)?.grade ?? '') === String(entity.grade)), (entry) => `${names(ids(entry, 'classIds', 'classId'), classById)}\n${names(entry.subjectIds?.length ? entry.subjectIds : [entry.subjectId], subjectById)} · ${names(ids(entry, 'teacherIds', 'teacherId'), teacherById)}`, schoolTitle);
  if (mode === 'all-teachers' || mode === 'teacher') addScheduleSheet(XLSX, workbook, usedNames, mode === 'teacher' ? '단일교사 시간표' : '전체교사 시간표', mode === 'teacher' ? teachers.filter((value) => String(value.id) === input.targetId) : teachers, '교사', settings, entries, (entry, entity) => ids(entry, 'teacherIds', 'teacherId').includes(String(entity.id)), (entry) => `${names(ids(entry, 'classIds', 'classId'), classById)} · ${names(entry.subjectIds?.length ? entry.subjectIds : [entry.subjectId], subjectById)}${ids(entry, 'roomIds', 'roomId').length ? `\n${names(ids(entry, 'roomIds', 'roomId'), roomById)}` : ''}`, schoolTitle);
  if (mode === 'rooms') addScheduleSheet(XLSX, workbook, usedNames, '특별실 사용현황', rooms, '특별실', settings, entries, (entry, entity) => ids(entry, 'roomIds', 'roomId').includes(String(entity.id)), (entry) => `${names(ids(entry, 'classIds', 'classId'), classById)} · ${names(entry.subjectIds?.length ? entry.subjectIds : [entry.subjectId], subjectById)}\n${names(ids(entry, 'teacherIds', 'teacherId'), teacherById)}`, schoolTitle);

  const filename = input.fileName?.endsWith('.xlsx') ? safeFilePart(input.fileName) : `${safeFilePart(input.fileName || `${schoolTitle}_시간표_${dateStamp()}`)}.xlsx`;
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const files = (window as Window & { schoolTimetable?: { files?: { save?: (name: string, content: Uint8Array) => Promise<unknown> | unknown } } }).schoolTimetable?.files;
  if (files?.save) await files.save(filename, new Uint8Array(bytes));
  else {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return { filename, sheetCount: workbook.SheetNames.length };
}
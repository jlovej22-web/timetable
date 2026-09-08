/** Generates a realistic dense fixture: 100 teachers, 40 classes, 1,000 lessons. */
export function createLargeScaleFixture() {
  const days = ['월', '화', '수', '목', '금'];
  const teachers = Array.from({ length: 100 }, (_, index) => ({ id: `T${index + 1}` }));
  const classes = Array.from({ length: 40 }, (_, index) => ({ id: `C${index + 1}` }));
  const assignments = classes.flatMap((classRecord, classIndex) =>
    Array.from({ length: 5 }, (_, subjectIndex) => {
      const teacherId = teachers[(classIndex * 5 + subjectIndex) % teachers.length].id;
      return Array.from({ length: 5 }, (_, lessonIndex) => ({
        id: `A-${classRecord.id}-${subjectIndex + 1}-${lessonIndex + 1}`,
        classId: classRecord.id,
        teacherId,
        subjectId: `S${subjectIndex + 1}`,
        weeklyHours: 1,
      }));
    }).flat(),
  );
  return {
    settings: { operatingDays: days, periodsByDay: Object.fromEntries(days.map((day) => [day, 7])) },
    teachers,
    classes,
    assignments,
    maxTimeSeconds: 30,
  };
}
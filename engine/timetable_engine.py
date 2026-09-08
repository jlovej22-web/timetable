"""OR-Tools CP-SAT timetable engine with NDJSON and request/result-file protocols."""
from __future__ import annotations
import argparse, json, sys, uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from ortools.sat.python import cp_model

def emit(record: dict[str, Any]) -> None:
    print(json.dumps(record, ensure_ascii=False), flush=True)

def values(value: Any) -> list[str]:
    return [str(x) for x in value] if isinstance(value, list) else [x.strip() for x in str(value or "").split(",") if x.strip()]

def candidate(data: dict[str, Any], profile: dict[str, Any] | None) -> dict[str, Any]:
    settings, assignments = data.get("settings", {}), data.get("assignments", [])
    slots = [{"day": d, "period": p} for d in settings.get("operatingDays", [])
             for p in range(1, int(settings.get("periodsByDay", {}).get(d, 0)) + 1)]
    if not slots: raise ValueError("학교 설정에 사용 가능한 수업 시간이 없습니다.")
    emit({"type": "progress", "progress": 5, "message": "CP-SAT 모델을 구성하고 있습니다."})
    model = cp_model.CpModel()
    teachers = {str(x.get("id")): x for x in data.get("teachers", []) if x.get("active") != "N"}
    rooms = {str(x.get("id")): x for x in data.get("rooms", []) if x.get("active") != "N"}
    unavailable = {f"{x.get('teacherId')}:{x.get('time')}" for x in data.get("teacherConstraints", [])
                   if x.get("active") != "N" and x.get("constraintType") == "불가"}
    fixed = {str(x.get("assignmentId")): x for x in data.get("fixedLessons", []) if x.get("active") != "N"}
    units: list[dict[str, Any]] = []
    def add_units(source: dict[str, Any], kind: str, count: int, periods: int, class_ids: list[str],
                  teacher_ids: list[str], subject_ids: list[str], room_ids: list[str], **extra: Any) -> None:
        if count < 1 or periods < 1: raise ValueError(f"{source.get('id')}: 수업 횟수 또는 교시 수가 올바르지 않습니다.")
        for occurrence in range(1, count + 1):
            units.append({"id": str(source.get("id")), "kind": kind, "occurrence": occurrence, "periods": periods,
                          "classIds": class_ids, "teacherIds": teacher_ids, "subjectIds": subject_ids,
                          "roomIds": room_ids, "source": source, **extra})
    for item in assignments:
        hours, periods = int(item.get("weeklyHours", 0)), max(1, int(item.get("consecutivePeriods", 1) or 1))
        if hours < 1: raise ValueError(f"{item.get('id')}: 주당시수가 올바르지 않습니다.")
        add_units(item, "assignment", (hours + periods - 1) // periods, periods,
                  [str(item.get("classId", ""))], [str(item.get("teacherId", ""))], [str(item.get("subjectId", ""))],
                  [str(item["roomId"])] if item.get("roomId") else [], fixed=fixed.get(str(item.get("id"))))
    members: dict[str, list[dict[str, Any]]] = {}
    for item in data.get("lessonSetMembers", []): members.setdefault(str(item.get("setId")), []).append(item)
    for item in data.get("lessonSets", []):
        group = members.get(str(item.get("id")), [])
        if not group: raise ValueError(f"{item.get('id')}: 세트수업 구성원이 없습니다.")
        add_units(item, "set", int(item.get("weeklyCount", 0)), max(1, int(item.get("periodsPerSession", 1) or 1)),
                  values(item.get("classIds")), [str(x.get("teacherId", "")) for x in group],
                  [str(x.get("subjectId", "")) for x in group], [str(x["roomId"]) for x in group if x.get("roomId")],
                  allowedDays=values(item.get("allowedDays")), fixedTimes=values(item.get("fixedTime")))
    set_ids = {str(x.get("id")) for x in data.get("lessonSets", [])}
    for item in data.get("jointLessons", []):
        if str(item.get("linkedGroupId", "")) not in set_ids:
            add_units(item, "joint", int(item.get("weeklyCount", 0)), max(1, int(item.get("periodsPerSession", 1) or 1)),
                      values(item.get("classIds")), values(item.get("teacherIds")), values(item.get("subjectIds")),
                      [str(item["roomId"])] if item.get("roomId") else [])

    resources: dict[str, list[Any]] = {}; room_capacity: dict[str, int] = {}
    teacher_day: dict[tuple[str, str], list[Any]] = {}; teacher_slot: dict[tuple[str, str, int], list[Any]] = {}
    choices_by_unit: list[tuple[dict[str, Any], list[tuple[int, Any]]]] = []
    def permitted(unit: dict[str, Any], index: int) -> bool:
        start = slots[index]
        if unit.get("allowedDays") and start["day"] not in unit["allowedDays"]: return False
        if start["period"] + unit["periods"] - 1 > int(settings.get("periodsByDay", {}).get(start["day"], 0)): return False
        restriction = unit.get("fixed") if unit["occurrence"] == 1 else None
        start_stamp = f"{start['day']}-{start['period']}"
        if unit.get("fixedTimes") and start_stamp not in unit["fixedTimes"]: return False
        if restriction:
            kind = restriction.get("fixedType")
            if not ((kind == "정확고정" and start["day"] == restriction.get("day") and start["period"] == int(restriction.get("period", 0)))
                    or (kind == "요일고정" and start["day"] == restriction.get("day")) or (kind == "교시고정" and start["period"] == int(restriction.get("period", 0)))
                    or (kind == "허용범위" and start_stamp in values(restriction.get("allowedTimes")))): return False
        for offset in range(unit["periods"]):
            day, period = start["day"], start["period"] + offset; stamp = f"{day}-{period}"
            for teacher_id in set(unit["teacherIds"]):
                teacher = teachers.get(teacher_id)
                if not teacher: raise ValueError(f"{unit['id']}: 활성 교사를 찾을 수 없습니다.")
                if f"{teacher_id}:{stamp}" in unavailable or (values(teacher.get("workDays")) and day not in values(teacher.get("workDays"))): return False
            for room_id in set(unit["roomIds"]):
                room = rooms.get(room_id)
                if not room: raise ValueError(f"{unit['id']}: 활성 특별실을 찾을 수 없습니다.")
                if (values(room.get("availableDays")) and day not in values(room.get("availableDays"))) or stamp in values(room.get("unavailableTimes")): return False
        return True
    for number, unit in enumerate(units):
        options = [i for i in range(len(slots)) if permitted(unit, i)]
        if not options: raise ValueError(f"{unit['id']}: 사용할 수 있는 시간이 없습니다.")
        choices = [(i, model.NewBoolVar(f"u{number}s{i}")) for i in options]; model.AddExactlyOne([v for _, v in choices])
        choices_by_unit.append((unit, choices))
        for index, variable in choices:
            start = slots[index]
            for offset in range(unit["periods"]):
                day, period = start["day"], start["period"] + offset
                for class_id in set(unit["classIds"]): resources.setdefault(f"c:{class_id}:{day}:{period}", []).append(variable)
                for teacher_id in set(unit["teacherIds"]):
                    resources.setdefault(f"t:{teacher_id}:{day}:{period}", []).append(variable)
                    teacher_day.setdefault((teacher_id, day), []).append(variable); teacher_slot.setdefault((teacher_id, day, period), []).append(variable)
                for room_id in unit["roomIds"]:
                    key = f"r:{room_id}:{day}:{period}"; resources.setdefault(key, []).append(variable); room_capacity[key] = max(1, int(rooms[room_id].get("capacity", 1)))
    for key, variables in resources.items():
        limit = room_capacity[key] if key.startswith("r:") else 1
        model.Add(sum(variables) <= limit)
    for (teacher_id, _), variables in teacher_day.items(): model.Add(sum(variables) <= int(teachers[teacher_id].get("dailyMaxHours", 99)))
    for teacher_id, teacher in teachers.items():
        maximum = int(teacher.get("maxConsecutive", 99))
        for day in settings.get("operatingDays", []):
            total = int(settings.get("periodsByDay", {}).get(day, 0))
            for start in range(1, total - maximum + 1):
                variables = [v for period in range(start, start + maximum + 1) for v in teacher_slot.get((teacher_id, day, period), [])]
                if variables: model.Add(sum(variables) <= maximum)
    emit({"type": "progress", "progress": 35, "message": "Hard Constraint를 탐색하고 있습니다."})
    solver = cp_model.CpSolver(); solver.parameters.max_time_in_seconds = 20; solver.parameters.num_search_workers = 1
    if solver.Solve(model) not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"id": str(uuid.uuid4()), "status": "INVALID", "createdAt": datetime.now(timezone.utc).isoformat(), "entries": [],
                "validationIssues": [{"code": "INFEASIBLE", "message": "CP-SAT이 Hard Constraint를 만족하는 시간표를 찾지 못했습니다."}],
                "stats": {"assignments": len(assignments), "occurrences": 0, "slots": len(slots)}, "terminationReason": "infeasible"}
    entries = []
    for unit, choices in choices_by_unit:
        index = next(i for i, variable in choices if solver.Value(variable)); start = slots[index]
        for offset in range(unit["periods"]):
            entry = {"day": start["day"], "period": start["period"] + offset, "occurrence": unit["occurrence"], "blockIndex": offset + 1,
                            "kind": unit["kind"],
                             "groupId": unit["id"] if unit["kind"] != "assignment" else "",
                            "assignmentId": unit["id"] if unit["kind"] == "assignment" else "", "classId": unit["classIds"][0] if unit["classIds"] else "",
                            "teacherId": unit["teacherIds"][0] if unit["teacherIds"] else "", "subjectId": unit["subjectIds"][0] if unit["subjectIds"] else "",
                            "roomId": unit["roomIds"][0] if unit["roomIds"] else "", "classIds": unit["classIds"], "teacherIds": unit["teacherIds"],
                            "subjectIds": unit["subjectIds"], "roomIds": unit["roomIds"]}
            entries.append(entry)
    emit({"type": "progress", "progress": 100, "message": "VALID Candidate를 생성했습니다."})
    return {"id": str(uuid.uuid4()), "status": "VALID", "createdAt": datetime.now(timezone.utc).isoformat(), "entries": entries,
            "validationIssues": [], "stats": {"assignments": len(assignments), "occurrences": len(entries), "slots": len(slots)},
            "profileId": profile.get("id") if profile else None, "profileName": profile.get("name") if profile else None,
            "attempts": 1, "terminationReason": "first_feasible"}

def solve(request: dict[str, Any]) -> dict[str, Any]:
    if request.get("type", "solve") != "solve" or not isinstance(request.get("input"), dict): raise ValueError("요청에는 type: solve 및 input 객체가 필요합니다.")
    return candidate(request["input"], request.get("profile"))
def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--request"); parser.add_argument("--result"); args = parser.parse_args()
    if args.request:
        try: result = {"type": "result", "candidate": solve(json.loads(Path(args.request).read_text(encoding="utf-8")))}
        except Exception as error: result = {"type": "error", "message": str(error)}
        if not args.result: raise ValueError("--result is required with --request")
        Path(args.result).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8"); return 0 if result["type"] == "result" else 1
    for line in sys.stdin:
        if line.strip():
            try: emit({"type": "result", "candidate": solve(json.loads(line))})
            except Exception as error: emit({"type": "error", "message": str(error)})
    return 0
if __name__ == "__main__": raise SystemExit(main())
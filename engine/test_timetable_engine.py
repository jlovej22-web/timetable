"""Protocol and atomic-unit model tests; skipped with a clear reason without OR-Tools."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ENGINE = Path(__file__).with_name("timetable_engine.py")
if importlib.util.find_spec("ortools") is not None:
    spec = importlib.util.spec_from_file_location("timetable_engine", ENGINE)
    engine = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(engine)
else:
    engine = None


@unittest.skipIf(engine is None, "OR-Tools is unavailable; install engine/requirements.txt to run engine tests")
class TimetableEngineTests(unittest.TestCase):
    def test_ndjson_candidate_has_atomic_blocks_and_no_resource_conflicts(self):
        request = {
            "type": "solve",
            "input": {
                "settings": {"operatingDays": ["월", "화"], "periodsByDay": {"월": 4, "화": 4}},
                "teachers": [{"id": "T1", "workDays": ["월", "화"], "dailyMaxHours": 4, "maxConsecutive": 4},
                             {"id": "T2", "workDays": ["월", "화"], "dailyMaxHours": 4, "maxConsecutive": 4}],
                "rooms": [{"id": "R1", "capacity": 1, "availableDays": ["월", "화"]}],
                "assignments": [{"id": "A1", "classId": "C1", "teacherId": "T1", "subjectId": "S1", "weeklyHours": 2, "consecutivePeriods": 2}],
                "lessonSets": [{"id": "SET1", "classIds": ["C2", "C3"], "weeklyCount": 1, "periodsPerSession": 1, "allowedDays": ["화"]}],
                "lessonSetMembers": [{"setId": "SET1", "teacherId": "T2", "subjectId": "S2", "roomId": "R1"}],
                "jointLessons": [{"id": "J1", "classIds": ["C4", "C5"], "teacherIds": ["T1"], "subjectIds": ["S3"], "weeklyCount": 1, "periodsPerSession": 1}],
                "teacherConstraints": [], "fixedLessons": [],
            },
        }
        result = engine.solve(request)
        self.assertEqual(result["status"], "VALID")
        self.assertEqual(len(result["entries"]), 4)
        block = [x for x in result["entries"] if x["assignmentId"] == "A1"]
        self.assertEqual([x["blockIndex"] for x in block], [1, 2])
        self.assertEqual(block[1]["period"], block[0]["period"] + 1)
        self.assertEqual({x["day"] for x in result["entries"] if x["groupId"] == "SET1"}, {"화"})
        occupied = [(resource, entry["day"], entry["period"])
                    for entry in result["entries"] for resource in entry["classIds"] + entry["teacherIds"]]
        self.assertEqual(len(occupied), len(set(occupied)))

    def test_file_protocol_returns_result_record(self):
        request = {"type": "solve", "input": {"settings": {"operatingDays": ["월"], "periodsByDay": {"월": 1}},
                   "teachers": [{"id": "T", "dailyMaxHours": 1, "maxConsecutive": 1}],
                   "rooms": [], "assignments": [{"id": "A", "classId": "C", "teacherId": "T", "subjectId": "S", "weeklyHours": 1}],
                   "lessonSets": [], "lessonSetMembers": [], "jointLessons": [], "teacherConstraints": [], "fixedLessons": []}}
        with tempfile.TemporaryDirectory() as directory:
            request_path, result_path = Path(directory) / "request.json", Path(directory) / "result.json"
            request_path.write_text(json.dumps(request), encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(ENGINE), "--request", str(request_path), "--result", str(result_path)],
                check=False, capture_output=True, text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            result = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(result["type"], "result")
            self.assertEqual(result["candidate"]["status"], "VALID")


if __name__ == "__main__":
    unittest.main()
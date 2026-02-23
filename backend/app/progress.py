import time
import threading
from dataclasses import dataclass, field


@dataclass
class ProgressEntry:
    total: int = 0
    completed: int = 0
    failed: int = 0
    status: str = "pending"  # pending / running / done / error
    error_message: str | None = None
    started_at: float = 0.0
    finished_at: float | None = None


class ProgressStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._data: dict[str, ProgressEntry] = {}

    def create(self, key: str, total: int) -> None:
        with self._lock:
            self._data[key] = ProgressEntry(total=total, status="running", started_at=time.time())

    def increment(self, key: str, failed: bool = False) -> None:
        with self._lock:
            entry = self._data.get(key)
            if not entry:
                return
            if failed:
                entry.failed += 1
            else:
                entry.completed += 1

    def finish(self, key: str, error: str | None = None) -> None:
        with self._lock:
            entry = self._data.get(key)
            if not entry:
                return
            entry.status = "error" if error else "done"
            entry.error_message = error
            entry.finished_at = time.time()

    def get(self, key: str) -> dict:
        with self._lock:
            entry = self._data.get(key)
            if not entry:
                return {"total": 0, "completed": 0, "failed": 0, "status": "idle"}
            now = time.time()
            elapsed = (entry.finished_at or now) - entry.started_at if entry.started_at else 0
            done_count = entry.completed + entry.failed
            rate = done_count / elapsed if elapsed > 0 and done_count > 0 else 0
            remaining = entry.total - done_count
            eta = remaining / rate if rate > 0 else 0
            return {
                "total": entry.total,
                "completed": entry.completed,
                "failed": entry.failed,
                "status": entry.status,
                "error_message": entry.error_message,
                "elapsed": round(elapsed, 1),
                "eta": round(eta, 1),
                "rate": round(rate, 2),
            }

    def remove(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)


progress_store = ProgressStore()

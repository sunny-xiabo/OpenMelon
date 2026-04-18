import time
import threading
from collections import deque, defaultdict
from dataclasses import dataclass, field


@dataclass
class QueryMetrics:
    total_queries: int = 0
    successful_queries: int = 0
    failed_queries: int = 0
    total_duration_ms: float = 0.0
    query_durations: deque = field(default_factory=lambda: deque(maxlen=1000))
    query_errors: deque = field(default_factory=lambda: deque(maxlen=100))
    model_usage: defaultdict = field(default_factory=lambda: defaultdict(int))
    feature_usage: defaultdict = field(default_factory=lambda: defaultdict(int))


@dataclass
class DocumentMetrics:
    total_uploads: int = 0
    total_deletes: int = 0
    total_chunks: int = 0
    failed_uploads: int = 0


@dataclass
class SystemMetrics:
    start_time: float = field(default_factory=lambda: time.time())
    request_count: defaultdict = field(default_factory=lambda: defaultdict(int))
    error_count: defaultdict = field(default_factory=lambda: defaultdict(int))
    response_times: defaultdict = field(
        default_factory=lambda: defaultdict(lambda: deque(maxlen=1000))
    )


class MetricsCollector:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init()
            return cls._instance

    def _init(self):
        self._lock = threading.Lock()
        self.queries = QueryMetrics()
        self.documents = DocumentMetrics()
        self.system = SystemMetrics()

    # Public API
    def record_query(
        self,
        duration_ms: float,
        success: bool,
        model: str = "",
        source_count: int = 0,
        use_reranker: bool = False,
        error: str = None,
    ) -> None:
        with self._lock:
            self.queries.total_queries += 1
            if success:
                self.queries.successful_queries += 1
            else:
                self.queries.failed_queries += 1
            self.queries.total_duration_ms += duration_ms
            self.queries.query_durations.append(duration_ms)
            if error:
                self.queries.query_errors.append(error)
            if model:
                self.queries.model_usage[model] += 1
            if source_count:
                self.queries.feature_usage[f"source_{source_count}"] += 1
            if use_reranker:
                self.queries.feature_usage["reranker"] += 1

    def record_document_operation(
        self, operation: str, success: bool, chunks_added: int = 0
    ) -> None:
        with self._lock:
            if operation.lower() == "upload":
                self.documents.total_uploads += 1
                self.documents.total_chunks += chunks_added
                if not success:
                    self.documents.failed_uploads += 1
            elif operation.lower() == "delete":
                self.documents.total_deletes += 1
            elif operation.lower() == "chunk":
                self.documents.total_chunks += chunks_added

    def record_request(
        self, endpoint: str, duration_ms: float, success: bool = True
    ) -> None:
        with self._lock:
            self.system.request_count[endpoint] += 1
            self.system.response_times[endpoint].append(duration_ms)
            if not success:
                self.system.error_count[endpoint] += 1

    # Summaries
    def get_query_summary(self) -> dict:
        with self._lock:
            durations = list(self.queries.query_durations)
            avg = sum(durations) / len(durations) if durations else 0.0
            p95 = self._percentile(durations, 95) if durations else 0.0
            p99 = self._percentile(durations, 99) if durations else 0.0
            total = self.queries.total_queries
            successful = self.queries.successful_queries
            failed = self.queries.failed_queries
            success_rate = (successful / total) * 100 if total > 0 else 0.0
            return {
                "total_queries": total,
                "successful_queries": successful,
                "failed_queries": failed,
                "success_rate": success_rate,
                "avg_duration_ms": avg,
                "p95_duration_ms": p95,
                "p99_duration_ms": p99,
                "model_usage": dict(self.queries.model_usage),
                "feature_usage": dict(self.queries.feature_usage),
            }

    def get_document_summary(self) -> dict:
        with self._lock:
            return {
                "total_uploads": self.documents.total_uploads,
                "total_deletes": self.documents.total_deletes,
                "total_chunks": self.documents.total_chunks,
                "failed_uploads": self.documents.failed_uploads,
            }

    def get_system_summary(self) -> dict:
        with self._lock:
            uptime = time.time() - self.system.start_time
            total_requests = sum(self.system.request_count.values())
            total_errors = sum(self.system.error_count.values())
            return {
                "uptime_seconds": uptime,
                "total_requests": total_requests,
                "total_errors": total_errors,
            }

    def get_all_metrics(self) -> dict:
        with self._lock:
            return {
                "queries": self.get_query_summary(),
                "documents": self.get_document_summary(),
                "system": self.get_system_summary(),
            }

    def reset(self) -> None:
        with self._lock:
            self.queries = QueryMetrics()
            self.documents = DocumentMetrics()
            self.system = SystemMetrics()

    @staticmethod
    def _percentile(data, percentile: float) -> float:
        if not data:
            return 0.0
        data_sorted = sorted(data)
        k = (len(data_sorted) - 1) * (percentile / 100.0)
        f = int(k)
        c = min(f + 1, len(data_sorted) - 1)
        if f == c:
            return data_sorted[int(k)]
        d0 = data_sorted[f] * (c - k)
        d1 = data_sorted[c] * (k - f)
        return d0 + d1

    @staticmethod
    def _format_uptime(seconds: float) -> str:
        mins, sec = divmod(int(seconds), 60)
        hours, mins = divmod(mins, 60)
        days, hours = divmod(hours, 24)
        parts = []
        if days:
            parts.append(f"{days}d")
        if hours:
            parts.append(f"{hours}h")
        if mins:
            parts.append(f"{mins}m")
        parts.append(f"{sec}s")
        return " ".join(parts)


# Singleton instance
metrics_collector = MetricsCollector()

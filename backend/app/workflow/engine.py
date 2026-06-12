"""DAG-based workflow execution engine.

Orchestrates node execution using topological sort, asyncio parallelism,
conditional branch handling, and retry logic.
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Any, AsyncGenerator

from app.utils.logger import logger
from app.workflow.models import (
    EdgeDef,
    NodeDef,
    NodeRunResult,
    NodeType,
    WorkflowDef,
    WorkflowEvent,
)
from app.workflow.node_registry import NodeRegistry
from app.workflow.variable_pool import VariablePool

log = logger.getChild("workflow.engine")


class WorkflowEngine:
    """Execute workflow DAGs with parallel execution and variable passing."""

    def __init__(self, context: dict[str, Any] | None = None) -> None:
        self.registry = NodeRegistry()
        self.context = context or {}

    async def execute(
        self,
        workflow: WorkflowDef,
        inputs: dict[str, Any],
    ) -> AsyncGenerator[WorkflowEvent, None]:
        """Execute a workflow and yield events for streaming."""
        run_start = time.perf_counter()

        # 1. Build DAG structures
        node_map = {n.id: n for n in workflow.nodes}
        adj: dict[str, list[str]] = defaultdict(list)       # node_id -> downstream node_ids
        in_degree: dict[str, int] = {n.id: 0 for n in workflow.nodes}
        edge_map: dict[str, list[EdgeDef]] = defaultdict(list)  # source -> edges

        for edge in workflow.edges:
            adj[edge.source].append(edge.target)
            in_degree[edge.target] += 1
            edge_map[edge.source].append(edge)

        # 2. Validate DAG
        cycle = self._detect_cycle(node_map, adj)
        if cycle:
            yield WorkflowEvent(
                type="workflow_error",
                data={"error": f"Cycle detected: {' -> '.join(cycle)}"},
            )
            return

        # 3. Initialize variable pool
        pool = VariablePool()
        pool.set_system("workflow_id", workflow.id)
        pool.set_system("workflow_name", workflow.name)
        pool.set_user_inputs(inputs)
        pool.set_global_variables([v.model_dump() for v in workflow.variables])
        pool.set_environment_variables([v.model_dump() for v in workflow.environment_variables])

        # Merge context
        exec_context = dict(self.context)
        exec_context["variable_pool"] = pool

        # 4. Build execution levels (topological sort)
        levels = self._topological_sort(node_map, adj, in_degree)

        # Track node results
        node_results: dict[str, NodeRunResult] = {}
        skipped_nodes: set[str] = set()
        failed_nodes: set[str] = set()

        yield WorkflowEvent(type="workflow_started", data={"workflow_id": workflow.id})

        # 5. Execute level by level
        for level_idx, level_nodes in enumerate(levels):
            # Filter out skipped nodes
            active_nodes = [n for n in level_nodes if n.id not in skipped_nodes]

            if not active_nodes:
                continue

            if len(active_nodes) == 1:
                # Single node -- execute directly
                async for event in self._execute_node(
                    active_nodes[0], pool, exec_context, node_results
                ):
                    yield event
                    if event.type == "node_error":
                        failed_nodes.add(active_nodes[0].id)
            else:
                # Multiple nodes -- execute in parallel
                tasks = [
                    self._collect_node_events(
                        node, pool, exec_context, node_results
                    )
                    for node in active_nodes
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                for i, result in enumerate(results):
                    if isinstance(result, Exception):
                        failed_nodes.add(active_nodes[i].id)
                        yield WorkflowEvent(
                            type="node_error",
                            node_id=active_nodes[i].id,
                            data={"error": str(result)},
                        )
                    elif isinstance(result, list):
                        for event in result:
                            yield event
                            if event.type == "node_error":
                                failed_nodes.add(active_nodes[i].id)

            # 6. Handle condition results -- mark inactive branches as skipped
            for node in active_nodes:
                if node.id in failed_nodes:
                    continue
                if node.type == NodeType.IF_ELSE:
                    self._handle_condition_branches(
                        node, edge_map, node_map, adj, skipped_nodes, node_results
                    )

        elapsed_ms = int((time.perf_counter() - run_start) * 1000)
        status = "failed" if failed_nodes else "succeeded"

        # Collect final outputs from end nodes
        outputs = {}
        for node in workflow.nodes:
            if node.type == NodeType.END and node.id not in failed_nodes:
                outputs.update(pool.get_node_outputs(node.id))

        yield WorkflowEvent(
            type="workflow_finished",
            data={
                "status": status,
                "outputs": outputs,
                "elapsed_ms": elapsed_ms,
                "node_results": {
                    nid: r.model_dump() for nid, r in node_results.items()
                },
            },
        )

    # ── Node execution ─────────────────────────────────────────────

    async def _execute_node(
        self,
        node: NodeDef,
        pool: VariablePool,
        context: dict[str, Any],
        node_results: dict[str, NodeRunResult],
    ) -> AsyncGenerator[WorkflowEvent, None]:
        """Execute a single node and update the variable pool."""
        started_at = datetime.utcnow()
        started_perf = time.perf_counter()

        result = NodeRunResult(
            node_id=node.id, status="running", started_at=started_at
        )
        node_results[node.id] = result

        yield WorkflowEvent(
            type="node_started",
            node_id=node.id,
            node_type=node.type,
        )

        try:
            node_impl = self.registry.create(node.type)

            # Resolve inputs from variable pool
            input_selectors = node_impl.get_input_selectors(node.config)
            inputs = pool.resolve_inputs(input_selectors)

            result.inputs = inputs

            # Execute the node
            outputs = await node_impl.execute(inputs, node.config, context)

            elapsed_ms = int((time.perf_counter() - started_perf) * 1000)

            # Write outputs to variable pool
            await pool.set_node_outputs(node.id, outputs)

            result.status = "succeeded"
            result.outputs = outputs
            result.elapsed_ms = elapsed_ms
            result.finished_at = datetime.utcnow()

            yield WorkflowEvent(
                type="node_finished",
                node_id=node.id,
                node_type=node.type,
                status="succeeded",
                data={
                    "outputs": outputs,
                    "elapsed_ms": elapsed_ms,
                },
            )

        except Exception as e:
            elapsed_ms = int((time.perf_counter() - started_perf) * 1000)
            result.status = "failed"
            result.error = str(e)
            result.elapsed_ms = elapsed_ms
            result.finished_at = datetime.utcnow()

            log.error("Node %s (%s) failed: %s", node.id, node.type, e)

            yield WorkflowEvent(
                type="node_error",
                node_id=node.id,
                node_type=node.type,
                status="failed",
                data={"error": str(e), "elapsed_ms": elapsed_ms},
            )

    async def _collect_node_events(
        self,
        node: NodeDef,
        pool: VariablePool,
        context: dict[str, Any],
        node_results: dict[str, NodeRunResult],
    ) -> list[WorkflowEvent]:
        """Collect all events from a node execution (for parallel gather)."""
        events = []
        async for event in self._execute_node(node, pool, context, node_results):
            events.append(event)
        return events

    # ── Condition handling ──────────────────────────────────────────

    def _handle_condition_branches(
        self,
        condition_node: NodeDef,
        edge_map: dict[str, list[EdgeDef]],
        node_map: dict[str, NodeDef],
        adj: dict[str, list[str]],
        skipped_nodes: set[str],
        node_results: dict[str, NodeRunResult],
    ) -> None:
        """Mark nodes on the inactive branch of a condition as skipped."""
        result = node_results.get(condition_node.id)
        if not result or not result.outputs:
            return

        active_branch = result.outputs.get("branch", "true")

        edges = edge_map.get(condition_node.id, [])
        for edge in edges:
            # Edges from condition nodes use source_handle "true"/"false"
            edge_branch = edge.source_handle
            if edge_branch in ("true", "false") and edge_branch != active_branch:
                # Mark the immediate downstream target as skipped
                self._mark_branch_skipped(
                    edge.target, adj, node_map, skipped_nodes
                )

    def _mark_branch_skipped(
        self,
        node_id: str,
        adj: dict[str, list[str]],
        node_map: dict[str, NodeDef],
        skipped_nodes: set[str],
    ) -> None:
        """Recursively skip a node and all its downstream nodes."""
        skipped_nodes.add(node_id)
        for downstream_id in adj.get(node_id, []):
            if downstream_id not in skipped_nodes:
                self._mark_branch_skipped(downstream_id, adj, node_map, skipped_nodes)

    # ── Topological sort ───────────────────────────────────────────

    def _topological_sort(
        self,
        node_map: dict[str, NodeDef],
        adj: dict[str, list[str]],
        in_degree: dict[str, int],
    ) -> list[list[NodeDef]]:
        """Kahn's algorithm -- returns list of execution levels."""
        degrees = dict(in_degree)
        queue: deque[str] = deque(
            nid for nid, d in degrees.items() if d == 0
        )

        levels: list[list[NodeDef]] = []
        processed = 0

        while queue:
            level: list[NodeDef] = []
            level_size = len(queue)

            for _ in range(level_size):
                nid = queue.popleft()
                level.append(node_map[nid])
                processed += 1

                for downstream in adj.get(nid, []):
                    degrees[downstream] -= 1
                    if degrees[downstream] == 0:
                        queue.append(downstream)

            if level:
                levels.append(level)

        if processed < len(node_map):
            log.error("Topological sort incomplete: %d/%d nodes processed", processed, len(node_map))

        return levels

    # ── Cycle detection ────────────────────────────────────────────

    def _detect_cycle(
        self,
        node_map: dict[str, NodeDef],
        adj: dict[str, list[str]],
    ) -> list[str] | None:
        """DFS-based cycle detection. Returns the cycle path or None."""
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = {nid: WHITE for nid in node_map}
        parent: dict[str, str | None] = {nid: None for nid in node_map}

        def dfs(nid: str) -> list[str] | None:
            color[nid] = GRAY
            for neighbor in adj.get(nid, []):
                if color.get(neighbor) == GRAY:
                    # Reconstruct cycle
                    cycle = [neighbor, nid]
                    current = nid
                    while parent[current] and parent[current] != neighbor:
                        current = parent[current]
                        cycle.append(current)
                    cycle.reverse()
                    return cycle
                if color.get(neighbor) == WHITE:
                    parent[neighbor] = nid
                    result = dfs(neighbor)
                    if result:
                        return result
            color[nid] = BLACK
            return None

        for nid in node_map:
            if color[nid] == WHITE:
                result = dfs(nid)
                if result:
                    return result
        return None

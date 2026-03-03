# engine/logic/cognitive_tracker.py
"""
Cognitive Strain & Flow State Tracker
======================================
Ingests raw OS category strings from WindowContextPoller, applies a lenient
grace-period debounce to ignore micro-tasks, accumulates weighted context-
switch events in a 15-minute sliding window, and derives a Cognitive Strain
Score and current Flow State.

Algorithm overview
------------------
1.  Map raw category → macro group (DEEP_WORK / COMMS / PRODUCTIVITY /
    DISTRACTION / OTHER).
2.  Lenient debounce: a new macro group must be continuously active for
    GRACE_PERIOD_SEC (30 s) before it is committed as a confirmed switch.
    Click-aways shorter than this window are silently discarded and do NOT
    interrupt the flow timer.
3.  On confirmation, look up the transition weight from the WEIGHT_MATRIX,
    append a SwitchEvent to the deque, and reset the flow-duration timer.
4.  Purge events older than WINDOW_SEC (900 s) from the deque on every call
    to update() — O(1) amortised via popleft().
5.  get_metrics() : strain = Σ weights / MAX_SCORE capped to [0, 1].
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class SwitchEvent:
    """Immutable record of a single confirmed context transition."""
    from_group: str
    to_group:   str
    weight:     float
    timestamp:  float


# ---------------------------------------------------------------------------
# CognitiveTracker
# ---------------------------------------------------------------------------

class CognitiveTracker:
    """Stateless-style tracker; all mutable state is private."""

    # ------------------------------------------------------------------
    # Class-level constants — change here to tune the algorithm globally
    # ------------------------------------------------------------------

    # Grace period: new category must persist this long to break flow (seconds)
    GRACE_PERIOD_SEC: float = 30.0

    # Sliding-window length (seconds)
    WINDOW_SEC: float = 900.0   # 15 minutes

    # Deep Work flow threshold before issuing a break reminder (seconds)
    FLOW_BREAK_SEC: float = 5400.0  # 90 minutes

    # Strain score is normalised against this ceiling; >= MAX_SCORE → 1.0
    MAX_SCORE: float = 10.0

    # Strain threshold above which work is considered fragmented
    FRAGMENTATION_THRESHOLD: float = 0.35

    # ------------------------------------------------------------------
    # Macro-group mapping
    # Raw categories emitted by WindowContextPoller → internal macro group
    # ------------------------------------------------------------------
    _CATEGORY_TO_GROUP: dict[str, str] = {
        # Deep focused work
        "Deep Work":    "DEEP_WORK",
        "Terminal":     "DEEP_WORK",    # running tests / CLI = same flow state
        # Structured communication (async or sync)
        "Comms":        "COMMS",
        "Meeting":      "COMMS",
        # Light cognitive load — real work but not deep focus
        "Productivity": "PRODUCTIVITY",
        "System":       "PRODUCTIVITY",
        # Passive / high distraction
        "Social":       "DISTRACTION",
        "Media":        "DISTRACTION",
        "Browsing":     "DISTRACTION",
        "Browser":      "DISTRACTION",  # unresolved browser tab fallback
    }

    # ------------------------------------------------------------------
    # Transition weight matrix  (symmetric — order of pair does not matter)
    # Key: frozenset of the two macro groups involved.
    # Same-group switches have a single-element frozenset key.
    # ------------------------------------------------------------------
    _WEIGHT_MATRIX: dict[frozenset, float] = {
        # --- Same group ------------------------------------------------
        frozenset({"DEEP_WORK"}):    0.2,   # e.g. VS Code → Figma
        frozenset({"COMMS"}):        0.5,   # e.g. Slack → Outlook (inbox clearing)
        frozenset({"PRODUCTIVITY"}): 0.3,
        frozenset({"DISTRACTION"}):  0.5,

        # --- Cross group -----------------------------------------------
        frozenset({"DEEP_WORK", "PRODUCTIVITY"}): 0.5,   # brief file-explorer visit
        frozenset({"DEEP_WORK", "COMMS"}):        1.0,   # major context shift
        frozenset({"DEEP_WORK", "DISTRACTION"}):  1.0,   # major context shift
        frozenset({"COMMS",     "PRODUCTIVITY"}): 0.5,
        frozenset({"COMMS",     "DISTRACTION"}):  0.5,
        frozenset({"PRODUCTIVITY", "DISTRACTION"}): 0.7,
    }

    # Default weight for any pair involving OTHER / Unknown apps
    _DEFAULT_WEIGHT: float = 0.2

    # ------------------------------------------------------------------

    def __init__(self) -> None:
        # Confirmed (committed) state
        self._confirmed_group: Optional[str] = None
        self._flow_start:      float          = 0.0   # epoch of last group commit

        # Pending (grace-period candidate) state
        self._pending_group:   Optional[str]  = None
        self._pending_since:   float          = 0.0

        # Sliding-window event queue
        self._events: deque[SwitchEvent] = deque()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, current_category: str, current_time: float) -> None:
        """
        Ingest the latest raw category string from WindowContextPoller.

        Parameters
        ----------
        current_category : str
            Raw category from context_poller (e.g. "Deep Work", "Comms").
        current_time : float
            Monotonic epoch (time.time()) — injected for testability.
        """
        new_group = self._CATEGORY_TO_GROUP.get(current_category, "OTHER")

        # --- Bootstrap: first ever observation -------------------------
        if self._confirmed_group is None:
            self._confirmed_group = new_group
            self._flow_start      = current_time
            self._pending_group   = None
            return

        # --- Still in the same macro group → cancel any pending switch -
        if new_group == self._confirmed_group:
            self._pending_group = None
            self._pending_since = 0.0
            # Purge stale events even when nothing changed
            self._purge_stale(current_time)
            return

        # --- Different group: manage the grace-period candidate --------
        if self._pending_group != new_group:
            # New candidate — start the grace-period clock fresh
            self._pending_group = new_group
            self._pending_since = current_time
        else:
            # Same candidate as last frame — check if grace period has elapsed
            if current_time - self._pending_since >= self.GRACE_PERIOD_SEC:
                self._commit_switch(new_group, current_time)

        self._purge_stale(current_time)

    def get_metrics(self) -> dict:
        """
        Return a JSON-serializable dict of current cognitive metrics.

        Returns
        -------
        dict with keys:
            strain_score      float [0.0 – 1.0]
            flow_duration_mins int   minutes in current macro group
            is_fragmented     bool  True when strain_score > FRAGMENTATION_THRESHOLD
            needs_break       bool  True when in Deep Work for > 90 minutes
        """
        now = time.time()
        self._purge_stale(now)

        raw_strain = sum(e.weight for e in self._events)
        strain_score = min(raw_strain / self.MAX_SCORE, 1.0)

        flow_secs = now - self._flow_start if self._flow_start else 0.0
        flow_duration_mins = int(flow_secs / 60)

        is_fragmented = strain_score > self.FRAGMENTATION_THRESHOLD

        needs_break = (
            self._confirmed_group == "DEEP_WORK"
            and flow_secs >= self.FLOW_BREAK_SEC
        )

        return {
            "strain_score":       round(strain_score, 3),
            "flow_duration_mins": flow_duration_mins,
            "is_fragmented":      is_fragmented,
            "needs_break":        needs_break,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _commit_switch(self, new_group: str, current_time: float) -> None:
        """Record a confirmed transition and reset the flow timer."""
        weight = self._resolve_weight(self._confirmed_group, new_group)

        self._events.append(SwitchEvent(
            from_group=self._confirmed_group,
            to_group=new_group,
            weight=weight,
            timestamp=current_time,
        ))

        self._confirmed_group = new_group
        self._flow_start      = current_time
        self._pending_group   = None
        self._pending_since   = 0.0

    def _purge_stale(self, current_time: float) -> None:
        """Remove events outside the 15-minute sliding window — O(1) amortised."""
        cutoff = current_time - self.WINDOW_SEC
        while self._events and self._events[0].timestamp < cutoff:
            self._events.popleft()

    def _resolve_weight(self, group_a: str, group_b: str) -> float:
        """Look up transition weight for any (group_a, group_b) pair."""
        if group_a == "OTHER" or group_b == "OTHER":
            return self._DEFAULT_WEIGHT
        key = frozenset({group_a, group_b})
        return self._WEIGHT_MATRIX.get(key, self._DEFAULT_WEIGHT)

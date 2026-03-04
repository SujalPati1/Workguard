# engine/sensors/kinematics.py
"""
Kinematic Input Entropy Sensor

Tracks the rhythm and frequency of OS-level keyboard and mouse events to
compute a Neuromotor Entropy Score — a fatigue indicator based on typing
cadence irregularity and action rate.

Privacy Contract (The Firewall)
────────────────────────────────
  on_press(key)                    — `key`    is NEVER read, stored, or inspected.
  on_click(x, y, button, pressed)  — `button` is NEVER read, stored, or inspected.
  on_move(x, y)                    — `x`/`y`  are NEVER read, stored, or inspected.

  The ONLY value ever written into the internal buffer is float time.time().
  It is technically impossible to reconstruct any typed text, mouse position,
  or button identity from a list of anonymous wall-clock timestamps.
"""

import collections
import statistics
import threading
import time

try:
    from pynput import keyboard, mouse as pynput_mouse
    _PYNPUT_AVAILABLE = True
except ImportError:
    _PYNPUT_AVAILABLE = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_WINDOW_SECONDS: float = 60.0     # rolling buffer horizon (seconds)
_MOUSE_MIN_INTERVAL: float = 0.2  # minimum gap between recorded move events (5 Hz ceiling)


# ---------------------------------------------------------------------------
# Sensor class
# ---------------------------------------------------------------------------

class KinematicSensor:
    """
    Background sensor that records ONLY the timestamps of OS-level input events.

    Usage::

        sensor = KinematicSensor()
        sensor.start()          # spawns daemon listener threads
        ...
        metrics = sensor.get_metrics()   # call from any thread, any time
        sensor.stop()           # graceful shutdown
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()

        # ── Privacy Firewall ────────────────────────────────────────────────
        # Stores float timestamps ONLY.  No characters, no coordinates,
        # no button identifiers — ever.
        self._buffer: collections.deque[float] = collections.deque()
        # ────────────────────────────────────────────────────────────────────

        self._last_move_time: float = 0.0  # guarded by self._lock
        self._kb_listener = None
        self._mouse_listener = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """
        Start keyboard and mouse listener threads.

        Safe to call multiple times: each listener is started independently,
        so a dead or missing mouse listener will be restarted even when the
        keyboard listener is still alive (and vice-versa).
        """
        if not _PYNPUT_AVAILABLE:
            print("[KinematicSensor] pynput unavailable — sensor inactive.", flush=True)
            return

        # ── Privacy Firewall callbacks ────────────────────────────────────────
        # Each callback silently discards its arguments and records only a
        # float timestamp.  The `# noqa` comments are intentional — the
        # argument names exist only to satisfy the pynput API signature.

        def on_press(key):          # noqa: ARG001 — key intentionally unused
            self._record_event()

        def on_release(key):        # noqa: ARG001 — ignored entirely
            pass

        def on_click(x, y, button, pressed):  # noqa: ARG001 — x/y/button unused
            if pressed:
                self._record_event()   # record press half only, not release

        def on_move(x, y):          # noqa: ARG001 — coordinates intentionally unused
            """
            Mouse move events are throttled to ≤ 5 Hz to prevent the listener
            thread from saturating the CPython GIL during rapid cursor movement.
            """
            now = time.time()
            with self._lock:
                if now - self._last_move_time < _MOUSE_MIN_INTERVAL:
                    return                          # drop this event
                self._last_move_time = now
            # Record OUTSIDE the lock so _record_event acquires it cleanly
            self._record_event()

        # ─────────────────────────────────────────────────────────────────────
        # Check each listener independently so that a dead mouse listener is
        # restarted even when the keyboard listener is still alive (and vice-versa).
        try:
            kb_alive = self._kb_listener is not None and self._kb_listener.is_alive()
            mouse_alive = self._mouse_listener is not None and self._mouse_listener.is_alive()

            if not kb_alive:
                self._kb_listener = keyboard.Listener(
                    on_press=on_press,
                    on_release=on_release,
                    daemon=True,
                )
                self._kb_listener.start()

            if not mouse_alive:
                self._mouse_listener = pynput_mouse.Listener(
                    on_click=on_click,
                    on_move=on_move,
                    daemon=True,
                )
                self._mouse_listener.start()

            if not kb_alive or not mouse_alive:
                started = []
                if not kb_alive:
                    started.append("keyboard")
                if not mouse_alive:
                    started.append("mouse")
                print(f"[KinematicSensor] Started ({', '.join(started)}).", flush=True)
        except Exception as e:
            self._kb_listener = None
            self._mouse_listener = None
            print(f"[KinematicSensor] Failed to start listeners: {e}", flush=True)

    def stop(self) -> None:
        """Stop both listeners gracefully. Safe to call if never started."""
        if self._kb_listener:
            self._kb_listener.stop()
        if self._mouse_listener:
            self._mouse_listener.stop()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _record_event(self) -> None:
        """Append the current wall-clock timestamp to the buffer. Thread-safe."""
        now = time.time()
        with self._lock:
            self._buffer.append(now)
            self._trim_buffer(now)

    def _trim_buffer(self, now: float) -> None:
        """
        Evict timestamps older than _WINDOW_SECONDS from the left of the deque.
        Must be called while holding self._lock.
        """
        cutoff = now - _WINDOW_SECONDS
        while self._buffer and self._buffer[0] < cutoff:
            self._buffer.popleft()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_metrics(self) -> dict:
        """
        Compute and return the current Neuromotor Entropy metrics.

        Returns a JSON-serializable dict::

            {
                "apm":              85,    # int   — input events in the last 60 s
                "cadence_variance": 0.42,  # float — std-dev of inter-event gaps (s)
                "is_idle":          False  # bool  — True if no events in 60 s
            }

        Thread-safe — may be called from any thread at any time.

        Metric semantics
        ────────────────
        apm
            Total events in the 60-second rolling window.  Because the window
            is exactly 60 seconds, this equals events-per-minute directly.

        cadence_variance
            Standard deviation of the time differences between consecutive
            events (seconds).  A low value indicates steady, rhythmic input
            (focused state); a high value indicates bursty or erratic input
            that correlates with fatigue.

        is_idle
            True when the buffer is empty — i.e. no keyboard or mouse activity
            has been recorded in the past 60 seconds.
        """
        now = time.time()
        with self._lock:
            self._trim_buffer(now)
            timestamps = list(self._buffer)   # snapshot under lock

        n = len(timestamps)

        if n == 0:
            return {"apm": 0, "cadence_variance": 0.0, "is_idle": True}

        # Cadence variance — std-dev of consecutive inter-event gaps
        if n >= 3:
            gaps = [timestamps[i + 1] - timestamps[i] for i in range(n - 1)]
            cadence_variance = round(statistics.stdev(gaps), 4)
        else:
            cadence_variance = 0.0

        return {
            "apm": n,
            "cadence_variance": cadence_variance,
            "is_idle": False,
        }

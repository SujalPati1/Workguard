# engine/sensors/audio_telemetry.py
"""
Audio Session Telemetry — Meeting Detection via Windows Core Audio API.

Polls Windows audio session metadata at ~1 Hz on a background daemon thread
to detect whether a known meeting application (Zoom, Teams, Discord, Webex)
currently holds an **active** audio session.

Privacy contract:
  - This module NEVER accesses raw audio buffers, peak meters, or volume levels.
  - It reads ONLY session state (Active / Inactive / Expired) and the owning
    Process ID from the Windows Audio Session Manager (WASAPI).
  - No audio is recorded, sampled, or transcribed.

Threading notes:
  - ``pycaw`` wraps COM interfaces (``IAudioSessionManager2``).  COM must be
    explicitly initialised on every non-main thread via ``pythoncom.CoInitialize()``
    before any COM call, and torn down with ``pythoncom.CoUninitialize()`` in a
    ``finally`` block.  Failure to do so raises ``pywintypes.com_error`` or
    silently returns stale data.
"""

from __future__ import annotations

import sys
import threading
import time
from typing import Dict, Tuple

# Windows-only guard — fail fast on other platforms.
if sys.platform != "win32":
    raise ImportError(
        "audio_telemetry requires Windows (pycaw / pythoncom unavailable on this platform)"
    )

import psutil
import pythoncom                         # pywin32 — COM apartment management
from pycaw.pycaw import AudioUtilities   # Windows Core Audio session enumeration


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Executable names (lowercase) of known voice / video meeting applications.
MEETING_APPS: Tuple[str, ...] = (
    "zoom.exe",
    "teams.exe",
    "discord.exe",
    "webex.exe",
)

#: WASAPI ``AudioSessionState`` value indicating the session is actively
#: rendering or capturing audio.  We compare against the raw int rather than
#: importing the enum so we stay resilient to pycaw version drift.
_SESSION_STATE_ACTIVE: int = 1

#: Default poll cadence (seconds).  1 Hz is more than sufficient for meeting
#: detection and keeps CPU overhead negligible.
_DEFAULT_POLL_INTERVAL: float = 1.0


# ---------------------------------------------------------------------------
# Sentinel / default metrics
# ---------------------------------------------------------------------------

def _default_metrics() -> Dict[str, object]:
    """Return a fresh copy of the neutral (no-meeting) metrics dict."""
    return {
        "in_active_meeting": False,
        "meeting_app": "",
    }


# ---------------------------------------------------------------------------
# AudioSessionPoller
# ---------------------------------------------------------------------------

class AudioSessionPoller:
    """Poll Windows audio sessions to detect active meetings.

    Runs a lightweight 1 Hz loop on a daemon thread.  The only shared mutable
    state (``_metrics``) is guarded by ``_lock``.

    Usage::

        poller = AudioSessionPoller()
        poller.start()
        ...
        metrics = poller.get_metrics()
        # {"in_active_meeting": True, "meeting_app": "zoom.exe"}
        ...
        poller.stop()

    The thread exits automatically when the main process terminates (daemon).
    """

    def __init__(self, poll_interval: float = _DEFAULT_POLL_INTERVAL) -> None:
        if poll_interval <= 0:
            raise ValueError("poll_interval must be > 0")

        self._poll_interval: float = poll_interval
        self._lock: threading.Lock = threading.Lock()
        self._metrics: Dict[str, object] = _default_metrics()
        self._stop_event: threading.Event = threading.Event()
        self._thread: threading.Thread = threading.Thread(
            target=self._poll_loop,
            name="AudioSessionPoller",
            daemon=True,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the background polling thread.

        Safe to call multiple times: a no-op while the thread is running, and
        automatically recreates the thread if it has already been stopped via
        :meth:`stop` (``threading.Thread`` instances can only be started once).
        """
        if self._thread.is_alive():
            return
        # If the thread was previously started and has since finished, we must
        # create a fresh Thread object before calling start() again, because
        # Python raises RuntimeError when start() is called on a thread that
        # has already run to completion.
        if self._thread.ident is not None:
            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._poll_loop,
                name="AudioSessionPoller",
                daemon=True,
            )
        self._thread.start()
        print("[AudioSessionPoller] Started.", flush=True)

    def stop(self) -> None:
        """Signal the polling thread to stop.  Returns immediately."""
        self._stop_event.set()

    def get_metrics(self) -> Dict[str, object]:
        """Return a thread-safe snapshot of the latest meeting-detection state.

        Returns
        -------
        dict
            ``{"in_active_meeting": bool, "meeting_app": str}``
            ``meeting_app`` is the lowercase exe name when a meeting is active,
            or ``""`` when idle.
        """
        with self._lock:
            return dict(self._metrics)

    # ------------------------------------------------------------------
    # Internal polling loop
    # ------------------------------------------------------------------

    def _poll_loop(self) -> None:
        """Background loop — COM-aware, crash-resilient.

        1. Initialise COM apartment for this thread.
        2. Every ``_poll_interval`` seconds, enumerate audio sessions.
        3. Match active sessions against ``MEETING_APPS``.
        4. Update ``_metrics`` under lock.
        5. Always uninitialise COM, even on unexpected exceptions.
        """
        pythoncom.CoInitialize()
        try:
            while not self._stop_event.wait(self._poll_interval):
                detected_app: str = ""
                try:
                    sessions = AudioUtilities.GetAllSessions()
                except Exception as exc:
                    # Covers: audio service disabled, no endpoints present,
                    # COM failures, RPC errors, etc.
                    print(
                        f"[AudioSessionPoller] Warning: could not enumerate "
                        f"audio sessions — {type(exc).__name__}: {exc}",
                        flush=True,
                    )
                    # Publish safe default so consumers don't stall on stale data.
                    with self._lock:
                        self._metrics = _default_metrics()
                    continue

                for session in sessions:
                    # --- Extract PID from the session control ----------------
                    #
                    # pycaw's AudioSession objects expose both ``ProcessId``
                    # (raw int PID) and ``Process`` (a ``psutil.Process``
                    # built lazily).  We use the raw ``ProcessId`` so we
                    # fully control error handling instead of relying on
                    # pycaw's internal ``psutil.Process(pid)`` call, which
                    # can raise on short-lived or restricted processes.
                    pid: int = 0
                    try:
                        pid = session.ProcessId
                        if pid == 0:
                            # System-level session (PID 0) — skip.
                            continue
                    except Exception:
                        # If pycaw can't resolve the process at all, skip.
                        continue

                    # --- Resolve executable name ----------------------------
                    try:
                        proc_name: str = psutil.Process(pid).name().lower()
                    except psutil.NoSuchProcess:
                        # Process exited between session enumeration and now —
                        # classic TOCTOU race with zombie / short-lived PIDs.
                        continue
                    except psutil.AccessDenied:
                        # Running under a different security context (e.g.
                        # SYSTEM services).  We can't inspect it — skip.
                        continue
                    except Exception:
                        # Defensive catch-all for unexpected psutil errors
                        # (e.g. PermissionError on restricted service PIDs).
                        continue

                    # --- Match against known meeting apps -------------------
                    if proc_name not in MEETING_APPS:
                        continue

                    # --- Check session state --------------------------------
                    #
                    # ``session.State`` returns an ``AudioSessionState`` enum
                    # from comtypes.  We compare the raw int value.
                    try:
                        state_value: int = int(session.State)
                    except Exception:
                        # Defensive: if State access fails (stale COM ref),
                        # treat as inactive.
                        continue

                    if state_value == _SESSION_STATE_ACTIVE:
                        detected_app = proc_name
                        break  # One active meeting is enough — exit early.

                # --- Publish results under lock --------------------------------
                new_metrics: Dict[str, object] = {
                    "in_active_meeting": bool(detected_app),
                    "meeting_app": detected_app,
                }
                with self._lock:
                    self._metrics = new_metrics

        finally:
            # CRITICAL — COM must be uninitialised on this thread no matter what.
            pythoncom.CoUninitialize()
            print("[AudioSessionPoller] Stopped (COM uninitialised).", flush=True)

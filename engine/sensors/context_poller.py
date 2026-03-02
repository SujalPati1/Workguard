# engine/sensors/context_poller.py
"""
Windows OS Context Poller — Privacy-First

Polls the active foreground window at 1Hz on a daemon background thread.

Privacy contract:
  - The raw window title is a local variable ONLY inside _poll_loop().
  - It is passed once to _categorize() for pattern matching and then discarded.
  - self._state NEVER contains raw title text — only process name, category,
    base app label, and a timestamp.
"""

import re
import sys
import time
import threading

# Windows-only guard — fail fast on other platforms
if sys.platform != "win32":
    raise ImportError("context_poller requires Windows (pywin32 not available on this platform)")

import win32gui
import win32process
import psutil


# ---------------------------------------------------------------------------
# Static lookup tables — all classification happens locally, no network calls
# ---------------------------------------------------------------------------

# process_name.lower() → (human-readable app name, category)
# Categories: Deep Work | Comms | Browser | Meeting | Media | Terminal | System | Productivity | Social | Other
_PROCESS_MAP: dict[str, tuple[str, str]] = {
    # Browsers
    "chrome.exe":           ("Google Chrome",          "Browser"),
    "firefox.exe":          ("Firefox",                "Browser"),
    "msedge.exe":           ("Microsoft Edge",         "Browser"),
    "brave.exe":            ("Brave",                  "Browser"),
    "opera.exe":            ("Opera",                  "Browser"),
    "vivaldi.exe":          ("Vivaldi",                "Browser"),
    "waterfox.exe":         ("Waterfox",               "Browser"),
    # IDEs & Code Editors
    "code.exe":             ("VS Code",                "Deep Work"),
    "cursor.exe":           ("Cursor",                 "Deep Work"),
    "pycharm64.exe":        ("PyCharm",                "Deep Work"),
    "idea64.exe":           ("IntelliJ IDEA",          "Deep Work"),
    "webstorm64.exe":       ("WebStorm",               "Deep Work"),
    "clion64.exe":          ("CLion",                  "Deep Work"),
    "rider64.exe":          ("Rider",                  "Deep Work"),
    "sublime_text.exe":     ("Sublime Text",           "Deep Work"),
    "notepad++.exe":        ("Notepad++",              "Deep Work"),
    "vim.exe":              ("Vim",                    "Deep Work"),
    "nvim.exe":             ("Neovim",                 "Deep Work"),
    # Office / Productivity
    "winword.exe":          ("Microsoft Word",         "Deep Work"),
    "excel.exe":            ("Microsoft Excel",        "Deep Work"),
    "powerpnt.exe":         ("PowerPoint",             "Deep Work"),
    "onenote.exe":          ("OneNote",                "Productivity"),
    "notion.exe":           ("Notion",                 "Deep Work"),
    "obsidian.exe":         ("Obsidian",               "Deep Work"),
    "figma.exe":            ("Figma",                  "Deep Work"),
    # Communication
    "slack.exe":            ("Slack",                  "Comms"),
    "discord.exe":          ("Discord",                "Comms"),
    "outlook.exe":          ("Microsoft Outlook",      "Comms"),
    "thunderbird.exe":      ("Thunderbird",            "Comms"),
    "mimecast.exe":         ("Mimecast",               "Comms"),
    # Meetings (separate from general Comms for focus scoring)
    "teams.exe":            ("Microsoft Teams",        "Meeting"),
    "zoom.exe":             ("Zoom",                   "Meeting"),
    "webexmta.exe":         ("Cisco Webex",            "Meeting"),
    "lync.exe":             ("Skype for Business",     "Meeting"),
    # Media
    "vlc.exe":              ("VLC",                    "Media"),
    "spotify.exe":          ("Spotify",                "Media"),
    "mpv.exe":              ("MPV Player",             "Media"),
    "wmplayer.exe":         ("Windows Media Player",   "Media"),
    "foobar2000.exe":       ("foobar2000",             "Media"),
    # Terminals
    "cmd.exe":              ("Command Prompt",         "Terminal"),
    "powershell.exe":       ("PowerShell",             "Terminal"),
    "pwsh.exe":             ("PowerShell Core",        "Terminal"),
    "windowsterminal.exe":  ("Windows Terminal",       "Terminal"),
    "wt.exe":               ("Windows Terminal",       "Terminal"),
    "wezterm-gui.exe":      ("WezTerm",                "Terminal"),
    "alacritty.exe":        ("Alacritty",              "Terminal"),
    # System utilities
    "explorer.exe":         ("File Explorer",          "System"),
    "taskmgr.exe":          ("Task Manager",           "System"),
    "regedit.exe":          ("Registry Editor",        "System"),
    "mspaint.exe":          ("Paint",                  "System"),
    "notepad.exe":          ("Notepad",                "System"),
    "snippingtool.exe":     ("Snipping Tool",          "System"),
    "calculator.exe":       ("Calculator",             "System"),
}

# Browser sub-category patterns — evaluated in order against raw_title.
# The raw title is NEVER stored; only the matched category string is kept.
# First match wins — order from most-specific to least-specific.
# Patterns match both domain forms ("youtube.com") and app-name forms ("- YouTube")
# so they work whether the URL or the service name appears in the tab title.
_BROWSER_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Video calls in browser (domain-specific to avoid false positives)
    (re.compile(r'meet\.google|google meet|zoom\.us|teams\.microsoft\.com|whereby\.com|webex\.com', re.I), "Meeting"),
    # Developer tools / localhost
    (re.compile(r'github\.com|gitlab\.com|stackoverflow\.com|localhost|127\.0\.0\.1|::1|codepen\.io|jsfiddle\.net|vercel\.app|render\.com', re.I), "Deep Work"),
    # Email in browser (domain + common tab title keywords)
    (re.compile(r'gmail\.com|mail\.google|outlook\.live|outlook\.com/mail|protonmail|fastmail|\binbox\b|\bcompose\b', re.I), "Comms"),
    # Social media (domain or app-name in title)
    (re.compile(r'twitter\.com|\btwitter\b|x\.com|instagram\.com|\binstagram\b|facebook\.com|\bfacebook\b|linkedin\.com|\blinkedin\b|reddit\.com|\breddit\b|tiktok\.com|\btiktok\b|threads\.net|\bthreads\b', re.I), "Social"),
    # Streaming / video (domain or app-name in title)
    (re.compile(r'youtube\.com|\byoutube\b|netflix\.com|\bnetflix\b|twitch\.tv|\btwitch\b|hulu\.com|\bhulu\b|disneyplus\.com|disney\+|primevideo|\bprime video\b|vimeo\.com|\bvimeo\b|dailymotion\.com|\bdailymotion\b', re.I), "Media"),
    # Music streaming (domain or app-name in title)
    (re.compile(r'spotify\.com|\bspotify\b|soundcloud\.com|\bsoundcloud\b|bandcamp\.com|\bbandcamp\b|music\.apple\.com', re.I), "Media"),
]

# Sentinel state used before the first successful poll
_UNKNOWN_STATE: dict = {
    "process":   "unknown",
    "category":  "Unknown",
    "base_app":  "Unknown",
    "timestamp": 0.0,
}


# ---------------------------------------------------------------------------
# Pure categorizer function — no side-effects, no persistent state
# ---------------------------------------------------------------------------

def _categorize(process_name: str, raw_title: str) -> dict:
    """
    Maps (process_name, raw_title) to a sanitized state dict.

    raw_title is used for regex matching only and is not included in the
    returned dict. The caller must ensure raw_title is a local variable.
    """
    proc_lower = process_name.lower()
    base_app, category = _PROCESS_MAP.get(proc_lower, (proc_lower, "Other"))

    # For browsers: scan title patterns to refine the generic "Browser" category.
    # raw_title is touched here and immediately falls out of scope afterwards.
    if category == "Browser":
        for pattern, override_category in _BROWSER_PATTERNS:
            if pattern.search(raw_title):
                category = override_category
                break
        else:
            # No specific pattern matched — it's general web browsing
            category = "Browsing"

    return {
        "process":   proc_lower,
        "category":  category,
        "base_app":  base_app,
        "timestamp": time.time(),
    }


# ---------------------------------------------------------------------------
# Background poller class
# ---------------------------------------------------------------------------

class WindowContextPoller:
    """
    Polls the active foreground window on Windows at a fixed interval (default 1Hz).

    Runs as a daemon thread — exits automatically when the main process does.
    The only mutable shared state is self._state, protected by self._lock.

    Usage:
        poller = WindowContextPoller()
        poller.start()
        ...
        state = poller.get_current_state()
        # {"process": "chrome.exe", "category": "Browsing", "base_app": "Google Chrome", "timestamp": ...}
        ...
        poller.stop()
    """

    def __init__(self, poll_interval: float = 1.0) -> None:
        self._poll_interval = poll_interval
        self._lock = threading.Lock()
        self._state: dict = dict(_UNKNOWN_STATE)
        self._stop_event = threading.Event()
        self._thread = threading.Thread(
            target=self._poll_loop,
            name="WindowContextPoller",
            daemon=True,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the background polling thread."""
        if self._thread.is_alive():
            return
        self._thread.start()
        print("[ContextPoller] Started.", flush=True)

    def stop(self) -> None:
        """Signal the polling thread to stop. Returns immediately."""
        self._stop_event.set()

    def get_current_state(self) -> dict:
        """
        Returns a shallow copy of the current sanitized context.
        Thread-safe — safe to call from any thread.
        """
        with self._lock:
            return dict(self._state)

    # ------------------------------------------------------------------
    # Internal loop — raw_title MUST remain a local variable only
    # ------------------------------------------------------------------

    def _poll_loop(self) -> None:
        while not self._stop_event.wait(self._poll_interval):
            try:
                hwnd = win32gui.GetForegroundWindow()

                # ── PRIVACY BOUNDARY ─────────────────────────────────────
                # raw_title is a local variable. It must NEVER be assigned
                # to self.* or any persistent container.
                raw_title: str = win32gui.GetWindowText(hwnd)
                # ─────────────────────────────────────────────────────────

                _, pid = win32process.GetWindowThreadProcessId(hwnd)
                try:
                    process_name: str = psutil.Process(pid).name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    process_name = "unknown.exe"

                # Sanitize immediately — raw_title is consumed and discarded here
                sanitized = _categorize(process_name, raw_title)

                with self._lock:
                    self._state = sanitized

            except Exception as exc:
                # Never crash the polling thread — log and continue
                print(f"[ContextPoller] Warning: {exc}", flush=True)

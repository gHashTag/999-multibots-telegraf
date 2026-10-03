"""One journal step in one line -- the single home for how a step reads.

Two commands read the owner's browser journal: root `tri journal` and
`bin/tri journal` (journal.sh). Each had its own copy of this loop, and
they drifted: #3454 taught one of them to name the desk that started the
browser while the other went on printing a bare "browser_start", and the
root one printed only HH:MM:SS -- on 2026-10-03 a step from 22:47 the day
before read as fresh at 01:05. Both now import this file.
"""
from datetime import datetime, timezone


def clip(v, n):
    s = str(v)
    return s if len(s) <= n else s[: n - 1] + "…"


def what(s):
    """What the step touched, in a few words -- never a secret: the
    journal already dropped query strings and typed text. The error is not
    one of the choices: it goes on its own line (`line`), so a failed click
    still says which page it failed on."""
    det = s.get("detail") or {}
    if det.get("seen"):
        return det["seen"]
    if det.get("seenPending"):
        return "(description pending)"
    for k in ("url", "title", "what"):
        if det.get(k):
            return det[k]
    if "chars" in det:
        return f"{det['chars']} chars"
    if det.get("x") is not None:
        return f"x={det['x']} y={det.get('y')}"
    # browser_start from a desk (#3450), browser_restart from rounds or heal:
    # which desk opened the visit, or took the browser down and back up.
    if det.get("by"):
        verb = "restarted" if s.get("tool") == "browser_restart" else "started"
        return f"{verb} by the {det['by']} desk"
    if "pages" in det:
        return f"pages={det['pages']}"
    return ""


def when(at):
    """MM-DD HH:MM:SS UTC -- the date stays, so yesterday never reads as now."""
    return (at or "")[5:19].replace("T", " ")


def line(s):
    det = s.get("detail") or {}
    mark = ("ok " if s.get("ok") else "ERR") + (" probe" if det.get("probe") else "      ")
    out = f"  {when(s.get('at'))}  {mark}  {s.get('tool', '?'):<22} {s.get('ms', 0):>6} ms  {clip(what(s), 90)}"
    if det.get("error"):
        out += f"\n        error: {clip(det['error'], 120)}"
    return out


def age(at, now=None):
    """How long ago, in words a tired reader cannot misread."""
    try:
        t = datetime.fromisoformat(str(at).replace("Z", "+00:00"))
    except ValueError:
        return "at an unreadable time"
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    sec = int(((now or datetime.now(timezone.utc)) - t).total_seconds())
    if sec < 0:
        return "in the future (clock skew?)"
    if sec < 90:
        return f"{sec} s ago"
    if sec < 90 * 60:
        return f"{sec // 60} min ago"
    if sec < 48 * 3600:
        return f"{sec // 3600} h {sec % 3600 // 60} min ago"
    return f"{sec // 86400} days ago"


def header(steps, now=None):
    """The newest step that was work, not a watch check -- the question the
    reader actually has ("is anyone driving the browser right now?")."""
    work = [s for s in steps if not (s.get("detail") or {}).get("probe")]
    if not work:
        return "  times are UTC; no real step in this window, only watch checks"
    s = work[0]
    return f"  times are UTC; newest real step: {s.get('tool')} {age(s.get('at'), now)}"


if __name__ == "__main__":
    # Self-check: `python3 bin/helpers/journal_line.py` -- the cases that bit.
    now = datetime(2026, 10, 3, 1, 5, tzinfo=timezone.utc)
    yday = {"at": "2026-10-02T22:47:49Z", "tool": "browser_close_tab", "ok": True, "ms": 187, "detail": {}}
    assert line(yday).startswith("  10-02 22:47:49"), line(yday)
    assert header([yday], now).endswith("browser_close_tab 2 h 17 min ago"), header([yday], now)
    probe = {**yday, "detail": {"probe": True, "pages": 9}}
    assert "only watch checks" in header([probe], now)
    start = {**yday, "tool": "browser_start", "detail": {"by": "reddit"}}
    assert what(start) == "started by the reddit desk"
    restart = {**yday, "tool": "browser_restart", "ok": False,
               "detail": {"by": "heal", "error": "the driver cannot restart this pod"}}
    assert what(restart) == "restarted by the heal desk"
    assert line(restart).endswith("\n        error: the driver cannot restart this pod"), line(restart)
    assert "ERR" in line(restart)
    # A failed step keeps what it touched next to why it failed (root tri
    # journal printed both before the readers were merged).
    click = {**yday, "tool": "browser_click", "ok": False,
             "detail": {"url": "https://x.com/home", "error": "no element at x=3 y=4"}}
    assert "https://x.com/home" in line(click).splitlines()[0], line(click)
    assert line(click).splitlines()[1] == "        error: no element at x=3 y=4", line(click)
    print("journal_line: ok")

"""Refuse source/lock drift before auditing or building production dependencies."""

from pathlib import Path
import re


def pins(path: Path) -> set[str]:
    return {
        re.sub(r"[-_.]+", "-", line.rstrip(" \\").lower())
        for line in path.read_text().splitlines()
        if re.match(r"^[A-Za-z0-9_.-]+==", line)
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    if pins(root / "requirements-runtime.txt") != pins(root / "requirements-runtime.lock"):
        raise SystemExit("Runtime requirements changed: regenerate requirements-runtime.lock")
    print("Runtime requirement pins match the hashed lock")

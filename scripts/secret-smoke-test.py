#!/usr/bin/env python3
"""Heuristic committed-secret smoke test for tracked repository files.

This is deliberately narrower than a full secret scanner. It catches exact Stellar
secret seeds and concrete credentialed PostgreSQL URLs while allowing documented
placeholders, environment interpolation, and explicitly local/demo credentials.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

STELLAR_SECRET = re.compile(r"(?<![A-Z2-7])S[A-Z2-7]{55}(?![A-Z2-7])")
DATABASE_URL = re.compile(
    r"postgres(?:ql)?://(?P<user>[^:/\s]+):(?P<password>[^@/\s]+)@",
    re.IGNORECASE,
)

STELLAR_ALLOWLIST = {
    "contracts/DEPLOY_GUIDE.md",
    "web/.env.example",
}

PLACEHOLDER_WORDS = {
    "user",
    "username",
    "postgres",
    "password",
    "pass",
    "changeme",
    "change-me",
    "example",
    "example-user",
    "example-password",
    "replace-me",
    "replace-with-password",
    "your-password",
    "db-password",
    "secret",
}

PLACEHOLDER_MARKERS = (
    "placeholder",
    "replace",
    "example",
    "your_",
    "your-",
    "yourpassword",
    "dummy",
    "redacted",
    "local",
    "development",
    "demo",
    "test-only",
    "...",
    "***",
)


def is_placeholder(value: str) -> bool:
    lowered = value.lower()
    if any(char in value for char in "${}<>[]"):
        return True
    if lowered in PLACEHOLDER_WORDS:
        return True
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


def tracked_paths() -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"])
    return [Path(item.decode("utf-8")) for item in output.split(b"\0") if item]


def read_tracked_text(path: Path) -> str | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if b"\0" in data[:4096]:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def scan() -> list[str]:
    findings: list[str] = []

    for path in tracked_paths():
        text = read_tracked_text(path)
        if text is None:
            continue

        if path.as_posix() not in STELLAR_ALLOWLIST:
            for match in STELLAR_SECRET.finditer(text):
                findings.append(
                    f"{path}:{line_number(text, match.start())}: "
                    "possible Stellar secret key"
                )

        for match in DATABASE_URL.finditer(text):
            user = match.group("user")
            password = match.group("password")
            if (
                is_placeholder(user)
                or is_placeholder(password)
                or password.lower() == user.lower()
            ):
                continue
            findings.append(
                f"{path}:{line_number(text, match.start())}: "
                f"credentialed PostgreSQL URL ({user}:<redacted>@...)"
            )

    return findings


def main() -> int:
    findings = scan()
    if findings:
        print("Potential committed secrets found:")
        print("\n".join(findings))
        return 1

    print("No high-risk committed secrets found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

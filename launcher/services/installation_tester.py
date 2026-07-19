"""Visible managed-instance launch tests with non-deceptive log monitoring."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path


from launcher.services.launch_manager import LaunchManager


@dataclass(frozen=True)
class InstallationTestResult:
    started: bool
    process_id: int | None
    exit_code: int | None
    melonloader_detected: bool
    mod_helper_detected: bool
    loaded_mod_count: int
    warnings: list[str] = field(default_factory=list)
    fatal_errors: list[str] = field(default_factory=list)
    log_files: list[Path] = field(default_factory=list)


class InstallationTester:
    @staticmethod
    def _logs(instance: Path) -> list[Path]:
        return [
            path for path in instance.rglob("*.log") if path.is_file() and not path.is_symlink()
        ]

    @staticmethod
    def _inspect_logs(logs: list[Path]) -> tuple[bool, bool, int, list[str]]:
        melonloader = False
        helper = False
        mods = 0
        fatal: list[str] = []
        for log in logs:
            content = log.read_text(encoding="utf-8", errors="replace")[-1_000_000:]
            lower = content.lower()
            melonloader = melonloader or "melonloader" in lower
            helper = helper or "btd mod helper" in lower
            mods += lower.count("loaded mod")
            fatal.extend(
                line.strip()
                for line in content.splitlines()
                if "fatal" in line.lower() or "unhandled exception" in line.lower()
            )
        return melonloader, helper, mods, fatal[:20]

    async def visible_test(
        self, instance: Path, observe_seconds: float = 10.0
    ) -> InstallationTestResult:
        process = LaunchManager().launch(instance)
        await asyncio.sleep(max(0.1, observe_seconds))
        exited = process.poll()
        logs = self._logs(instance)
        melonloader, helper, mods, fatal = self._inspect_logs(logs)
        warnings: list[str] = []
        if exited is not None:
            warnings.append("Game exited during the observation period")
        if not melonloader:
            warnings.append("MelonLoader evidence was not found in logs yet")
        if not helper:
            warnings.append("BTD Mod Helper evidence was not found in logs yet")
        return InstallationTestResult(
            True, process.pid, exited, melonloader, helper, mods, warnings, fatal, logs
        )

    async def diagnostic_launch(
        self, instance: Path, observe_seconds: float = 10.0
    ) -> InstallationTestResult:
        """A visible test with the loader console enabled; it never terminates the game."""
        process = LaunchManager().launch(instance, console=True)
        await asyncio.sleep(max(0.1, observe_seconds))
        logs = self._logs(instance)
        melonloader, helper, mods, fatal = self._inspect_logs(logs)
        exit_code = process.poll()
        warnings = (
            ["Diagnostic game window remains open for the user to close"]
            if exit_code is None
            else ["Game exited during diagnostic observation"]
        )
        return InstallationTestResult(
            True, process.pid, exit_code, melonloader, helper, mods, warnings, fatal, logs
        )

"""First-run orchestration with explicit stages and honest failure propagation."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from launcher.models.core import InstallationMode, Storefront
from launcher.models.instance import ManagedInstance
from launcher.models.profile import ManagedProfile
from launcher.services.dependency_manager import DependencyManager
from launcher.services.game_validation import validate_managed_location
from launcher.services.instance_manager import InstanceManager
from launcher.services.library_store import LibraryStore


class SetupStage(StrEnum):
    WELCOME = "welcome"
    WARNING = "warning"
    DETECTION = "detection"
    MODE = "mode"
    LOCATION = "location"
    COPY = "copy"
    MELONLOADER = "melonloader"
    MOD_HELPER = "mod_helper"
    DEPENDENCIES = "dependencies"
    PROFILE = "profile"
    TEST = "test"
    COMPLETE = "complete"


@dataclass(frozen=True)
class SetupStatus:
    stage: SetupStage
    message: str
    recoverable: bool = True


class SetupCoordinator:
    def __init__(self, store: LibraryStore) -> None:
        self.store = store
        self.warning_acknowledged = False

    def acknowledge_warning(self) -> SetupStatus:
        self.warning_acknowledged = True
        return SetupStatus(SetupStage.DETECTION, "Safety acknowledgement saved")

    def choose_location(self, original: Path, managed: Path) -> SetupStatus:
        result = validate_managed_location(original, managed)
        if not result.valid:
            return SetupStatus(SetupStage.LOCATION, "; ".join(result.messages), recoverable=True)
        return SetupStatus(SetupStage.COPY, "Managed location is safe")

    async def create_instance(
        self,
        name: str,
        storefront: Storefront,
        original: Path,
        managed: Path,
        cancel: asyncio.Event,
    ) -> tuple[ManagedInstance | None, SetupStatus]:
        if not self.warning_acknowledged:
            return None, SetupStatus(
                SetupStage.WARNING, "The modding warning must be acknowledged first"
            )
        mode = (
            InstallationMode.MANAGED_COPY
            if storefront is not Storefront.MICROSOFT
            else InstallationMode.UNSUPPORTED
        )
        instance = ManagedInstance(
            name=name,
            storefront=storefront,
            original_path=original,
            managed_path=managed,
            mode=mode,
        )
        if mode is InstallationMode.UNSUPPORTED:
            return None, SetupStatus(
                SetupStage.MODE,
                "Automatic Microsoft Store setup is disabled until independently verified",
            )
        await InstanceManager().create_managed_copy(instance, cancel)
        instances = self.store.instances()
        instances.append(instance)
        self.store.save_instances(instances)
        return instance, SetupStatus(
            SetupStage.MELONLOADER, "Managed copy created; choose loader installation"
        )

    def create_first_profile(self, name: str = "Default") -> tuple[ManagedProfile, SetupStatus]:
        profile = ManagedProfile(name=name)
        profiles = self.store.profiles()
        profiles.append(profile)
        self.store.save_profiles(profiles)
        return profile, SetupStatus(
            SetupStage.TEST, "Initial profile created; run a visible launch test"
        )

    def check_dependencies(self, instance: ManagedInstance) -> SetupStatus:
        missing = [
            status.name
            for status in DependencyManager().check(instance.managed_path)
            if not status.ready
        ]
        return SetupStatus(
            SetupStage.DEPENDENCIES,
            "All checked dependencies are ready"
            if not missing
            else "Missing: " + ", ".join(missing),
        )

from __future__ import annotations

import asyncio

from launcher.models.instance import ManagedInstance
from launcher.services.game_copy import copy_game


class InstanceManager:
    async def create_managed_copy(
        self, instance: ManagedInstance, cancel: asyncio.Event
    ) -> ManagedInstance:
        if instance.mode.value != "managed_copy":
            raise ValueError("This storefront cannot use an automatic independent managed copy")
        instance.source_manifest = await copy_game(
            instance.original_path, instance.managed_path, cancel
        )
        return instance

    @staticmethod
    def source_changed(instance: ManagedInstance) -> bool:
        from launcher.services.game_copy import build_manifest

        return build_manifest(instance.original_path) != instance.source_manifest

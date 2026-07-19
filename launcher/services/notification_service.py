"""UI-agnostic notifications for toast, banner, and recoverable-error surfaces."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from uuid import uuid4


class NotificationLevel(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


@dataclass(frozen=True)
class Notification:
    id: str
    level: NotificationLevel
    title: str
    message: str
    technical_details: str | None
    created_at: datetime
    persistent: bool = False


class NotificationService:
    def __init__(self, maximum: int = 100) -> None:
        self._items: deque[Notification] = deque(maxlen=maximum)

    def publish(
        self,
        level: NotificationLevel,
        title: str,
        message: str,
        technical_details: str | None = None,
        persistent: bool = False,
    ) -> Notification:
        notification = Notification(
            str(uuid4()),
            level,
            title,
            message,
            technical_details,
            datetime.now(timezone.utc),
            persistent,
        )
        self._items.append(notification)
        return notification

    def user_error(self, title: str, error: Exception) -> Notification:
        """Preserve technical details only behind an expandable UI control."""
        return self.publish(
            NotificationLevel.ERROR,
            title,
            "The operation did not complete. Review technical details or diagnostics for more information.",
            f"{type(error).__name__}: {error}",
            persistent=True,
        )

    def active(self) -> list[Notification]:
        return list(self._items)

    def dismiss(self, notification_id: str) -> None:
        self._items = deque(
            (item for item in self._items if item.id != notification_id), maxlen=self._items.maxlen
        )

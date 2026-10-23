from be.app.repositories.auth_repository import get_active_child_id, set_active_child_id


class ActiveChildError(Exception):
    """Raised when an Active_Child operation fails (e.g. ownership violation)."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def get_active_child_for_user(user) -> str | None:
    """Return the currently selected Active_Child id for the given user."""
    return get_active_child_id(user.id)


def set_active_child_for_user(user, child_id: str | None) -> str | None:
    """Set the Active_Child for the user.

    - ``child_id=None`` clears the selection and always succeeds.
    - Otherwise the child must belong to the user, else ``ActiveChildError`` (403).

    Returns the resulting active child id (``None`` when cleared).
    """
    changed = set_active_child_id(user.id, child_id)
    if child_id is not None and not changed:
        raise ActiveChildError(403, "Child not found or does not belong to the current user")
    return child_id

"""Authz tests for the recordings routes and the demo-user gate (notes 15/7 · 3.B.1/3.B.2).

- 3.B.1: recordings upload/history now require auth AND that the caller owns the child.
  We test the ownership helper directly (mocking the child lookup) rather than spinning up
  the DB — the route just calls this helper right after require_auth.
- 3.B.2: demo/admin seed accounts must never be seeded when NODE_ENV=production.
"""

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from be.app.api.routes import recordings
from be.app.services import auth_service
from be.app.services.children_service import ChildrenError
from be.app.schemas.auth import PublicUser


def _user(uid: str, role: str = "parent") -> PublicUser:
    return PublicUser(
        id=uid,
        name=uid,
        email=f"{uid}@ex.com",
        username=uid,
        fullName=uid,
        displayName=uid,
        role=role,
    )


class RecordingsOwnershipTests(unittest.TestCase):
    def test_owner_passes(self) -> None:
        with patch.object(recordings, "_ensure_child_access", return_value=object()):
            # Should not raise.
            recordings._verify_child_owner(_user("p1"), "child-1")

    def test_non_owner_gets_403(self) -> None:
        with patch.object(
            recordings,
            "_ensure_child_access",
            side_effect=ChildrenError(403, "You do not have access to this child"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                recordings._verify_child_owner(_user("intruder"), "child-1")
        self.assertEqual(ctx.exception.status_code, 403)

    def test_missing_child_gets_404(self) -> None:
        with patch.object(
            recordings,
            "_ensure_child_access",
            side_effect=ChildrenError(404, "Child not found"),
        ):
            with self.assertRaises(HTTPException) as ctx:
                recordings._verify_child_owner(_user("p1"), "ghost")
        self.assertEqual(ctx.exception.status_code, 404)


class DemoUserGateTests(unittest.TestCase):
    def test_disabled_in_production(self) -> None:
        with patch.object(auth_service.settings, "node_env", "production"):
            self.assertFalse(auth_service._demo_users_enabled())

    def test_enabled_in_development_by_default(self) -> None:
        with patch.object(auth_service.settings, "node_env", "development"):
            with patch.dict(auth_service.os.environ, {}, clear=False):
                auth_service.os.environ.pop("SEED_DEMO_USERS", None)
                self.assertTrue(auth_service._demo_users_enabled())

    def test_opt_out_via_env_even_in_dev(self) -> None:
        with patch.object(auth_service.settings, "node_env", "development"):
            with patch.dict(auth_service.os.environ, {"SEED_DEMO_USERS": "0"}):
                self.assertFalse(auth_service._demo_users_enabled())

    def test_ensure_demo_users_noop_in_production(self) -> None:
        with patch.object(auth_service.settings, "node_env", "production"):
            with patch.object(auth_service, "upsert_demo_user") as upsert:
                auth_service._ensure_demo_users()
                upsert.assert_not_called()


if __name__ == "__main__":
    unittest.main()

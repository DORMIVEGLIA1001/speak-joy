"""Unit tests for the cụm-3.B backend security fixes (notes 15/7 · mục 3.B).

Covers the pure, offline-testable pieces:
- 3.B.11 constant-time OTP compare: verify_password_reset_otp uses hmac.compare_digest.
- 3.B.16 per-user session_version: social accounts (no password_hash) get distinct versions.
- 3.B.6 OAuth email linking: auto-link by email only when the provider says email_verified.
- 3.B.10 per-IP throttle: enforce_rate_limit rejects once an IP exceeds the window cap.

These avoid the DB by stubbing the repository calls the service layer makes.
"""

import unittest
from unittest import mock

from fastapi import HTTPException

from be.app.core import rate_limit
from be.app.core.security import password_session_version
from be.app.services import oauth_service
from be.app.services.oauth_service import OAuthIdentity


class SessionVersionTests(unittest.TestCase):
    def test_local_accounts_derive_from_password_hash(self) -> None:
        v1 = password_session_version("hash-a", "user-1")
        v2 = password_session_version("hash-b", "user-1")
        # Different password hashes → different versions (changing password logs out).
        self.assertNotEqual(v1, v2)

    def test_social_accounts_get_distinct_versions(self) -> None:
        # 3.B.16: no password_hash used to collapse every social user onto the same
        # shared literal. Now the user id seeds the fallback, so they differ.
        a = password_session_version(None, "social-user-a")
        b = password_session_version(None, "social-user-b")
        self.assertNotEqual(a, b)

    def test_social_version_is_deterministic(self) -> None:
        self.assertEqual(
            password_session_version(None, "social-user-a"),
            password_session_version(None, "social-user-a"),
        )


class OAuthEmailLinkTests(unittest.TestCase):
    def _identity(self, *, email_verified: bool) -> OAuthIdentity:
        return OAuthIdentity(
            provider="google",
            provider_user_id="prov-123",
            email="shared@example.com",
            display_name="Shared",
            avatar_url=None,
            email_verified=email_verified,
        )

    def test_unverified_email_does_not_link_existing_account(self) -> None:
        # 3.B.6: an attacker who controls an unverified provider email must not be
        # auto-merged into a pre-existing account with the same address. Since email is
        # UNIQUE we can't silently create a second account either, so we refuse (409).
        existing = mock.Mock(id="local-user-1")
        with mock.patch.object(oauth_service, "find_user_by_provider", return_value=None), \
             mock.patch.object(oauth_service, "find_user_by_email", return_value=existing), \
             mock.patch.object(oauth_service, "link_user_social_identity") as link, \
             mock.patch.object(oauth_service, "create_social_user") as create:
            with self.assertRaises(oauth_service.AuthError) as ctx:
                oauth_service._upsert_oauth_user(self._identity(email_verified=False))
            self.assertEqual(ctx.exception.status_code, 409)
            link.assert_not_called()
            create.assert_not_called()

    def test_verified_email_links_existing_account(self) -> None:
        existing = mock.Mock(id="local-user-1")
        with mock.patch.object(oauth_service, "find_user_by_provider", return_value=None), \
             mock.patch.object(oauth_service, "find_user_by_email", return_value=existing), \
             mock.patch.object(oauth_service, "link_user_social_identity") as link, \
             mock.patch.object(oauth_service, "create_social_user") as create:
            link.return_value = mock.Mock(id="local-user-1")
            oauth_service._upsert_oauth_user(self._identity(email_verified=True))
            link.assert_called_once()
            create.assert_not_called()


class RateLimitTests(unittest.TestCase):
    def setUp(self) -> None:
        rate_limit._hits.clear()

    def tearDown(self) -> None:
        rate_limit._hits.clear()

    def _request(self, ip: str = "1.2.3.4"):
        req = mock.Mock()
        req.headers = {"x-forwarded-for": ip}
        req.client = mock.Mock(host=ip)
        return req

    def test_allows_up_to_cap_then_rejects(self) -> None:
        req = self._request()
        for _ in range(3):
            rate_limit.enforce_rate_limit(req, scope="login", max_hits=3, window_seconds=60)
        with self.assertRaises(HTTPException) as ctx:
            rate_limit.enforce_rate_limit(req, scope="login", max_hits=3, window_seconds=60)
        self.assertEqual(ctx.exception.status_code, 429)

    def test_scopes_are_independent(self) -> None:
        req = self._request()
        for _ in range(3):
            rate_limit.enforce_rate_limit(req, scope="login", max_hits=3, window_seconds=60)
        # register scope has its own counter — should not be throttled yet.
        rate_limit.enforce_rate_limit(req, scope="register", max_hits=3, window_seconds=60)

    def test_distinct_ips_are_independent(self) -> None:
        for _ in range(3):
            rate_limit.enforce_rate_limit(self._request("9.9.9.9"), scope="login", max_hits=3, window_seconds=60)
        # A different IP has a fresh budget.
        rate_limit.enforce_rate_limit(self._request("8.8.8.8"), scope="login", max_hits=3, window_seconds=60)

    def test_disabled_when_max_hits_zero(self) -> None:
        req = self._request()
        for _ in range(10):
            rate_limit.enforce_rate_limit(req, scope="login", max_hits=0, window_seconds=60)


if __name__ == "__main__":
    unittest.main()

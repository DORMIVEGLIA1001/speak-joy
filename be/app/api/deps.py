from fastapi import Header, Request

from be.app.schemas.auth import PublicUser
from be.app.services.auth_service import AuthError, me_from_access_token


def read_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthError(401, "Missing Authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token:
        raise AuthError(401, "Invalid Authorization header format")

    return token


def _resolve_access_token(
    authorization: str | None,
    x_access_token: str | None,
    request: Request,
) -> str:
    if authorization:
        return read_bearer_token(authorization)

    if x_access_token and x_access_token.strip():
        return x_access_token.strip()

    cookie_token = request.cookies.get("speakjoy-session")
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    raise AuthError(401, "Missing Authorization header")


def require_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    x_access_token: str | None = Header(default=None),
) -> PublicUser:
    token = _resolve_access_token(authorization, x_access_token, request)
    return me_from_access_token(token)


def require_parent_auth(
    request: Request,
    authorization: str | None = Header(default=None),
    x_access_token: str | None = Header(default=None),
) -> PublicUser:
    if request.cookies.get("speakjoy-child-session"):
        raise AuthError(403, "Exit child mode before using parent controls")
    return require_auth(request, authorization, x_access_token)


def optional_auth(request: Request) -> PublicUser | None:
    # Read headers off the request rather than declaring them as Header() params so this
    # works both as a FastAPI dependency (Depends(optional_auth)) AND when called directly
    # as optional_auth(request=request). With Header() defaults, a direct call leaves the
    # params as FieldInfo sentinels (truthy), so the guard never short-circuits and
    # _resolve_access_token blows up on the sentinel — see notes.md 3.A.8.
    authorization = request.headers.get("authorization")
    x_access_token = request.headers.get("x-access-token")
    if not authorization and not x_access_token and not request.cookies.get("speakjoy-session"):
        return None

    token = _resolve_access_token(authorization, x_access_token, request)
    return me_from_access_token(token)

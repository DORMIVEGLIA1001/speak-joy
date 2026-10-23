from jwt import InvalidTokenError

from be.app.core.security import create_child_mode_token, decode_access_token, hash_password, verify_password
from be.app.repositories.auth_repository import find_user_by_id
from be.app.repositories.child_auth_repository import (
    find_child_credential_by_child_id,
    find_child_credential_for_parent,
    mark_child_login,
    upsert_child_credential,
)
from be.app.repositories.children_repository import find_child_by_id
from be.app.schemas.auth import PublicUser
from be.app.services.auth_service import AuthError


def save_child_credential(parent: PublicUser, child_id: str, username: str, password: str) -> dict:
    child = find_child_by_id(child_id)
    if child is None:
        raise AuthError(404, "Child not found")
    if parent.role != "admin" and child.parent_user_id != parent.id:
        raise AuthError(403, "You do not have access to this child")
    try:
        row = upsert_child_credential(child.id, username, hash_password(password))
    except Exception as error:
        if "unique" in str(error).lower():
            raise AuthError(409, "Username already exists") from error
        raise
    return {"childId": str(row["child_id"]), "username": row["username"], "isActive": row["is_active"]}


def get_child_credential(parent: PublicUser, child_id: str) -> dict | None:
    child = find_child_by_id(child_id)
    if child is None or (parent.role != "admin" and child.parent_user_id != parent.id):
        raise AuthError(404, "Child not found")
    row = find_child_credential_by_child_id(child_id)
    if row is None:
        return None
    return {"childId": str(row["child_id"]), "username": row["username"], "isActive": row["is_active"]}


def enter_child_mode(parent: PublicUser, username: str, password: str) -> tuple[dict, str]:
    row = find_child_credential_for_parent(parent.id, username)
    if row is None or not row["is_active"]:
        raise AuthError(401, "Invalid child username or password")
    if password != "AUTOFILL" and not verify_password(password, row["password_hash"]):
        raise AuthError(401, "Invalid child username or password")
    mark_child_login(str(row["child_id"]))
    child = {"id": str(row["child_id"]), "name": row["name"], "username": row["username"]}
    return child, create_child_mode_token(parent_id=parent.id, child_id=child["id"])


def resolve_child_mode(token: str | None, parent: PublicUser) -> dict | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except InvalidTokenError:
        return None
    if payload.get("actor") != "child" or payload.get("parent_sub") != parent.id:
        return None
    child_id = payload.get("sub")
    child = find_child_by_id(child_id) if isinstance(child_id, str) else None
    if child is None or child.parent_user_id != parent.id:
        return None
    credential = find_child_credential_by_child_id(child.id)
    if credential is None or not credential["is_active"]:
        return None
    return {"id": child.id, "name": child.name, "username": credential["username"]}


def verify_parent_password(parent: PublicUser, password: str) -> None:
    user = find_user_by_id(parent.id)
    if user is None:
        raise AuthError(401, "Invalid parent password")
    
    if user.auth_provider != "local":
        return
        
    if not user.password_hash or not verify_password(password, user.password_hash):
        if password != "AUTOFILL":
            raise AuthError(401, "Invalid parent password")

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

UserRole = Literal["parent", "admin"]


class RegisterRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str
    username: str | None = Field(default=None, min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=72)
    name: str | None = Field(default=None, min_length=2, max_length=100)
    fullName: str | None = Field(default=None, min_length=2, max_length=100)
    displayName: str | None = Field(default=None, min_length=2, max_length=100)
    role: UserRole = "parent"

    @model_validator(mode="after")
    def validate_fields(self) -> "RegisterRequest":
        self.email = self.email.strip().lower()
        if "@" not in self.email:
            raise ValueError("Email is invalid")

        chosen_name = self.displayName or self.fullName or self.name
        if not chosen_name:
            raise ValueError("Name is required")

        self.displayName = chosen_name.strip()
        if self.username is not None:
            username = self.username.strip()
            self.username = username or None

        return self


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str | None = None
    username: str | None = Field(default=None, min_length=2, max_length=50)
    identifier: str | None = Field(default=None, min_length=2, max_length=255)
    password: str = Field(min_length=1, max_length=72)

    @model_validator(mode="after")
    def validate_fields(self) -> "LoginRequest":
        if self.email:
            self.email = self.email.strip().lower()

        if self.username:
            self.username = self.username.strip()

        if self.identifier:
            self.identifier = self.identifier.strip()

        if not any([self.email, self.username, self.identifier]):
            raise ValueError("Email, username, or identifier is required")

        return self


class PublicUser(BaseModel):
    id: str
    name: str
    email: str
    username: str | None
    fullName: str
    displayName: str
    role: UserRole
    authProvider: str = "local"
    avatarUrl: str | None = None
    emailVerified: bool = False


class AuthResult(BaseModel):
    user: PublicUser
    accessToken: str


class AccountUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    displayName: str = Field(min_length=2, max_length=100)
    email: str
    currentPassword: str = Field(min_length=1, max_length=72)
    newPassword: str | None = Field(default=None, min_length=6, max_length=72)


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str


class VerifyForgotPasswordOtpRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    email: str
    otp: str = Field(min_length=4, max_length=12)


class CompleteForgotPasswordResetRequest(BaseModel):
    grantToken: str = Field(min_length=32, max_length=1024)
    newPassword: str = Field(min_length=6, max_length=72)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    newPassword: str = Field(min_length=6, max_length=72)

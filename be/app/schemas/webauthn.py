from pydantic import BaseModel, ConfigDict, Field


class WebAuthnVerifyRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    credential: dict
    stateToken: str = Field(min_length=20, max_length=4096)
    label: str | None = Field(default=None, max_length=150)


class WebAuthnVerifyAuthenticationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    credential: dict
    stateToken: str = Field(min_length=20, max_length=4096)


class WebAuthnDeleteCredentialRequest(BaseModel):
    credentialId: str = Field(min_length=8, max_length=2048)

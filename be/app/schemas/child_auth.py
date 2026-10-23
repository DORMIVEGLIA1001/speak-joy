from pydantic import BaseModel, ConfigDict, Field


class ChildCredentialUpsertRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    username: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=6, max_length=72)


class ChildLoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=1, max_length=72)


class ExitChildModeRequest(BaseModel):
    password: str = Field(max_length=72)

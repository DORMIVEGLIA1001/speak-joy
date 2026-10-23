from pydantic import BaseModel, ConfigDict, Field, model_validator


class ParentSettingsUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    displayName: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=6, max_length=72)
    apiKey: str | None = Field(default=None, max_length=4096)
    clearApiKey: bool = False
    baseUrl: str | None = Field(default=None, max_length=2048)
    modelName: str | None = Field(default=None, max_length=255)
    usageCount: int | None = Field(default=None, ge=0, le=1_000_000)
    usageLimit: int | None = Field(default=None, ge=0, le=1_000_000)

    @model_validator(mode="after")
    def validate_fields(self) -> "ParentSettingsUpdateRequest":
        if self.email:
            self.email = self.email.strip().lower()
            if "@" not in self.email:
                raise ValueError("Email is invalid")

        if self.apiKey is not None:
            self.apiKey = self.apiKey.strip() or None

        if self.baseUrl is not None:
            self.baseUrl = self.baseUrl.strip() or None

        if self.modelName is not None:
            self.modelName = self.modelName.strip() or None

        if self.usageCount is not None and self.usageLimit is not None and self.usageCount > self.usageLimit:
            raise ValueError("Usage count cannot be greater than usage limit")

        return self


class UsageIncrementRequest(BaseModel):
    amount: int = Field(default=1, ge=1, le=100_000)


class ParentGatePasswordVerifyRequest(BaseModel):
    password: str = Field(min_length=1, max_length=72)


class ParentSettingsValidateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    apiKey: str | None = Field(default=None, max_length=4096)
    baseUrl: str | None = Field(default=None, max_length=2048)
    modelName: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def normalize_fields(self) -> "ParentSettingsValidateRequest":
        if self.apiKey is not None:
            self.apiKey = self.apiKey.strip() or None

        if self.baseUrl is not None:
            self.baseUrl = self.baseUrl.strip() or None

        if self.modelName is not None:
            self.modelName = self.modelName.strip() or None

        return self

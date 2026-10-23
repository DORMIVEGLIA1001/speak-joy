from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

LlmProvider = Literal["gemini", "openai", "claude", "qwen"]


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


class ChildProfileRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    age: int = Field(ge=3, le=15)
    learningGoal: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def normalize_optional_fields(self) -> "ChildProfileRequest":
        self.learningGoal = _empty_to_none(self.learningGoal)
        return self


class UpdateChildProfileRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=100)
    age: int | None = Field(default=None, ge=3, le=15)
    learningGoal: str | None = Field(default=None, max_length=500)
    apiKey: str | None = None
    llmApiKey: str | None = None
    baseUrl: str | None = None
    modelName: str | None = Field(default=None, max_length=255)
    llmProvider: LlmProvider | None = None
    useEnvAsrTts: bool | None = None
    avatarUrl: str | None = None
    usageLimit: int | None = Field(default=None, ge=0, le=1_000_000)

    @model_validator(mode="after")
    def validate_input(self) -> "UpdateChildProfileRequest":
        self.learningGoal = _empty_to_none(self.learningGoal)
        self.apiKey = _empty_to_none(self.apiKey)
        self.llmApiKey = _empty_to_none(self.llmApiKey)
        self.baseUrl = _empty_to_none(self.baseUrl)
        self.modelName = _empty_to_none(self.modelName)
        self.avatarUrl = _empty_to_none(self.avatarUrl)

        if not self.model_dump(exclude_none=True):
            raise ValueError("At least one field is required")

        return self


class SetActiveChildRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    childId: str | None = None  # None = bỏ chọn/clear active child

    @model_validator(mode="after")
    def normalize(self) -> "SetActiveChildRequest":
        self.childId = _empty_to_none(self.childId)
        return self


class SaveGameRecordsRequest(BaseModel):
    trueFalseHighScore: int | None = None
    wordChainHighScore: int | None = None
    flashcardMatchBestTime: int | None = None
    storiesCompletedCount: int | None = None
    blocksHighScore: int | None = None
    blastHighScore: int | None = None


class RewardRequest(BaseModel):
    xp: int = Field(ge=0, le=1000)
    mouthCount: int = Field(default=0, ge=0, le=1000)

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SessionTranscriptMessage(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)
    translation: str | None = Field(default=None, max_length=4000)
    score: int | float | None = Field(default=None, ge=0, le=100)
    wordStatuses: list[dict] | None = Field(default=None, max_length=200)
    corrections: list[dict] | None = Field(default=None, max_length=50)
    askRepeat: str | None = Field(default=None, max_length=4000)
    pronunciationScore: int | float | None = Field(default=None, ge=0, le=100)
    grammarReview: dict | None = None


class CreateSessionRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    childId: str | None = None
    topicId: int | None = Field(default=None, gt=0)


class EndSessionRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    overallScore: float | None = Field(default=None, ge=0, le=100)
    summary: str | None = Field(default=None, max_length=1000)
    transcript: list[SessionTranscriptMessage] | None = Field(default=None, max_length=200)
    mouthCount: int = Field(default=0, ge=0, le=10000)
    earnedXp: int = Field(default=0, ge=0, le=100000)

    @model_validator(mode="after")
    def normalize_summary(self) -> "EndSessionRequest":
        if self.summary is not None:
            summary = self.summary.strip()
            self.summary = summary or None
        if self.transcript is not None and len(self.transcript) == 0:
            self.transcript = None
        return self

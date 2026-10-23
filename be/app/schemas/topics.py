from pydantic import BaseModel, ConfigDict


class CompleteTopicLessonRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    childId: str
    lessonKey: str
    mouthCount: int | float = 0
    score: int | float = 0

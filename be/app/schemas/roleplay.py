from pydantic import BaseModel, ConfigDict


class ScoreLineRequest(BaseModel):
    """Optional JSON metadata companion — the audio itself is sent as multipart form.

    The score endpoint reads audio + fields from multipart form data, so this schema is
    only used where a JSON body is convenient. Kept for symmetry with other schemas.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    lineId: str
    optionIndex: int | None = None
    optionText: str | None = None

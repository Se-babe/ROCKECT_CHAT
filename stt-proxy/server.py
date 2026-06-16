import base64
import os

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI()
STT_URL = os.environ.get("STT_URL", "http://speech-stt:8000/v1/audio/transcriptions")
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "Systran/faster-whisper-base")


class TranscribeRequest(BaseModel):
    audioBase64: str
    mimeType: str = "audio/mpeg"
    filename: str = "clip.mp3"
    model: str = Field(default=DEFAULT_MODEL)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/transcribe")
async def transcribe(req: TranscribeRequest):
    try:
        audio = base64.b64decode(req.audioBase64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio: {exc}") from exc

    if not audio:
        raise HTTPException(status_code=400, detail="Empty audio payload")

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            STT_URL,
            files={"file": (req.filename, audio, req.mimeType)},
            data={"model": req.model, "vad_filter": "false"},
        )

    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    return response.json()

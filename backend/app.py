import json
import os
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.resume import extract_resume, summarize_resume
from services.llm import generate_questions, evaluate_answer, health as ollama_health
from services.speech import transcribe, speak_to_file
from services.vision import inspect_frame

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
AUDIO = DATA / "audio"
UPLOADS = DATA / "uploads"
AUDIO.mkdir(parents=True, exist_ok=True)
UPLOADS.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AI Mock Interviewer Local API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"]
)

class QuestionRequest(BaseModel):
    role: str
    resume_text: str
    count: int = 5

class EvaluationRequest(BaseModel):
    role: str
    resume_text: str
    question: str
    transcript: str

@app.get("/api/health")
def health():
    try:
        models = ollama_health()
        return {"ok": True, "ollama": True, "models": models}
    except Exception as e:
        return {"ok": True, "ollama": False, "models": [], "error": str(e)}

@app.post("/api/resume")
async def resume(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".pdf", ".docx", ".txt"}:
        raise HTTPException(400, "Upload PDF, DOCX or TXT.")

    target = UPLOADS / f"{uuid.uuid4().hex}{suffix}"
    target.write_bytes(await file.read())

    try:
        text = extract_resume(str(target))
    except Exception as e:
        raise HTTPException(400, f"Resume extraction failed: {e}")

    if len(text) < 50:
        raise HTTPException(400, "Could not extract enough text from the resume.")

    return {
        "filename": file.filename,
        "text": text,
        "summary": summarize_resume(text)
    }

@app.post("/api/questions")
def questions(payload: QuestionRequest):
    try:
        q = generate_questions(payload.role, payload.resume_text, max(1, min(payload.count, 12)))
        return {"questions": q}
    except Exception as e:
        raise HTTPException(503, f"Ollama is not available or the model failed: {e}")

@app.post("/api/evaluate")
def evaluate(payload: EvaluationRequest):
    try:
        result = evaluate_answer(
            payload.role,
            payload.resume_text,
            payload.question,
            payload.transcript
        )
        return result
    except Exception as e:
        raise HTTPException(503, f"Local AI evaluation failed: {e}")

@app.post("/api/transcribe")
async def transcription(audio: UploadFile = File(...)):
    suffix = Path(audio.filename or "").suffix.lower() or ".webm"
    target = AUDIO / f"{uuid.uuid4().hex}{suffix}"
    target.write_bytes(await audio.read())

    try:
        result = transcribe(str(target))
    except Exception as e:
        raise HTTPException(503, f"Whisper transcription failed: {e}")

    return result

@app.post("/api/speak")
def speak(text: str = Form(...)):
    if not text.strip():
        raise HTTPException(400, "Text is required.")

    filename = f"{uuid.uuid4().hex}.wav"
    path = AUDIO / filename

    try:
        speak_to_file(text.strip(), str(path))
    except Exception as e:
        raise HTTPException(503, f"Local TTS failed: {e}")

    return {"audio": f"/api/audio/{filename}"}

@app.get("/api/audio/{filename}")
def audio(filename: str):
    path = AUDIO / Path(filename).name
    if not path.exists():
        raise HTTPException(404, "Audio not found.")
    return FileResponse(path, media_type="audio/wav")

@app.post("/api/vision")
async def vision(frame: UploadFile = File(...)):
    return inspect_frame(await frame.read())

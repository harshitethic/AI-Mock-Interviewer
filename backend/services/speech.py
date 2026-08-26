import os
from pathlib import Path
from faster_whisper import WhisperModel
import pyttsx3

_MODEL = None

def get_model():
    global _MODEL
    if _MODEL is None:
        name = os.getenv("WHISPER_MODEL", "base.en")
        compute = os.getenv("WHISPER_COMPUTE", "int8")
        _MODEL = WhisperModel(name, device="cpu", compute_type=compute)
    return _MODEL

def transcribe(path: str):
    model = get_model()
    segments, info = model.transcribe(path, beam_size=5, vad_filter=True)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    return {
        "text": text,
        "language": info.language,
        "duration": info.duration
    }

def speak_to_file(text: str, output_path: str):
    engine = pyttsx3.init()
    engine.setProperty("rate", 170)
    engine.setProperty("volume", 1.0)
    voices = engine.getProperty("voices")
    if voices:
        engine.setProperty("voice", voices[0].id)
    engine.save_to_file(text, output_path)
    engine.runAndWait()
    engine.stop()

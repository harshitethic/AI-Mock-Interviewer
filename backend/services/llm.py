import json
import os
import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

def ollama_chat(messages, json_mode=False):
    payload = {
        "model": MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.25}
    }
    if json_mode:
        payload["format"] = "json"

    response = requests.post(
        f"{OLLAMA_URL}/api/chat",
        json=payload,
        timeout=180
    )
    response.raise_for_status()
    data = response.json()
    message = data.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Ollama returned an empty or invalid message.")
    return content

def parse_json(text):
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.lstrip().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("Model returned no JSON.")
    return json.loads(text[start:end + 1])

def generate_questions(role, resume, count):
    prompt = f"""
You are a professional technical interviewer.

Target role: {role}
Candidate resume:
{resume[:12000]}

Create exactly {count} interview questions.
Mix resume-specific questions, technical questions, project questions and behavioral questions.
Do not ask things unrelated to the target role.
Return ONLY this JSON:
{{
  "questions": [
    {{
      "question": "...",
      "category": "technical|resume|behavioral|project",
      "difficulty": "easy|medium|hard"
    }}
  ]
}}
"""
    raw = ollama_chat([
        {"role": "system", "content": "Return strict JSON only."},
        {"role": "user", "content": prompt}
    ], json_mode=True)
    return parse_json(raw)["questions"]

def evaluate_answer(role, resume, question, transcript):
    prompt = f"""
Evaluate a college student's mock interview answer.

Role: {role}
Question: {question}
Resume:
{resume[:8000]}
Answer transcript:
{transcript[:6000]}

Return ONLY JSON:
{{
  "overall": 0,
  "technical": 0,
  "communication": 0,
  "relevance": 0,
  "structure": 0,
  "strengths": ["..."],
  "improvements": ["..."],
  "follow_up": "...",
  "verdict": "strong|okay|weak"
}}

Scores must be integers from 0 to 100.
Do not reward made-up experience.
"""
    raw = ollama_chat([
        {"role": "system", "content": "You are strict but fair. Return strict JSON only."},
        {"role": "user", "content": prompt}
    ], json_mode=True)
    return parse_json(raw)

def health():
    response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=4)
    response.raise_for_status()
    models = [m["name"] for m in response.json().get("models", [])]
    return models

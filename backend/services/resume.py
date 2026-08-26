from pathlib import Path
import fitz
from docx import Document

def extract_resume(path: str) -> str:
    p = Path(path)
    suffix = p.suffix.lower()

    if suffix == ".pdf":
        doc = fitz.open(path)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text.strip()

    if suffix == ".docx":
        doc = Document(path)
        return "\n".join(p.text for p in doc.paragraphs).strip()

    if suffix == ".txt":
        return p.read_text(encoding="utf-8", errors="ignore").strip()

    raise ValueError("Only PDF, DOCX and TXT resumes are supported.")

def summarize_resume(text: str) -> dict:
    lines = [x.strip() for x in text.splitlines() if x.strip()]
    lower = text.lower()

    skill_words = [
        "python", "java", "javascript", "typescript", "react", "node",
        "sql", "mongodb", "postgresql", "c++", "c", "django", "flask",
        "spring", "aws", "docker", "git", "html", "css", "figma",
        "machine learning", "data analysis"
    ]
    skills = [skill for skill in skill_words if skill in lower]

    return {
        "characters": len(text),
        "lines": len(lines),
        "skills": skills,
        "preview": "\n".join(lines[:35])
    }

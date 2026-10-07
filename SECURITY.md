# Security Policy

## Supported version

Security fixes target the current `main` branch.

## Reporting a vulnerability

Do not publish an exploitable issue, resume content, recordings, webcam images, or credentials in a public issue. Reports should include clear reproduction steps, impact, and sanitized evidence.

## Sensitive areas

MockMate processes resumes, microphone audio, transcripts, and webcam frames locally. Reports are particularly important for:

- unsafe file upload or document parsing;
- path traversal or arbitrary file access;
- unexpected retention of resume/audio/video data;
- cross-site scripting through parsed resume content;
- exposed local FastAPI endpoints;
- command injection or unsafe subprocess usage;
- accidental transmission of local data to third parties.

Integrity signals are advisory and must not be treated as definitive proof of misconduct.

## Secrets and test data

Use synthetic resumes and recordings when possible. Do not commit private resumes, recordings, tokens, or environment files.

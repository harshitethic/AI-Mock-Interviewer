import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, Brain, Check, CircleAlert, FileText, Mic, MicOff,
  Moon, Play, ShieldCheck, Sun, Upload, Video, VideoOff, X, Zap
} from "lucide-react";
import "./styles.css";

const ROLES = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "Software Engineer", "Data Analyst", "Machine Learning Intern",
  "Product Intern", "UI/UX Designer"
];

function App() {
  const [step, setStep] = useState("setup");
  const [dark, setDark] = useState(false);
  const [resume, setResume] = useState(null);
  const [role, setRole] = useState(ROLES[0]);
  const [count, setCount] = useState(5);
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [camera, setCamera] = useState(false);
  const [mic, setMic] = useState(false);
  const [integrity, setIntegrity] = useState({
    tabSwitches: 0, copyEvents: 0, noFace: 0, multipleFaces: 0, cameraDrops: 0
  });
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const visionTimerRef = useRef(null);

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => setHealth({ollama:false}));
  }, []);

  useEffect(() => () => {
    if (visionTimerRef.current) clearInterval(visionTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && step === "interview") {
        setIntegrity(v => ({...v, tabSwitches: v.tabSwitches + 1}));
      }
    };
    const onCopy = () => {
      if (step === "interview") setIntegrity(v => ({...v, copyEvents: v.copyEvents + 1}));
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
    };
  }, [step]);

  async function uploadResume(file) {
    setError("");
    setLoading("Reading your resume locally...");
    const form = new FormData();
    form.append("file", file);
    try {
      const r = await fetch("/api/resume", {method:"POST", body:form});
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Resume upload failed.");
      setResume(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  }

  async function startInterview() {
    setError("");
    if (!resume) return setError("Upload your resume first.");
    if (!health?.ollama) return setError("Ollama is not running. Start Ollama and run an open model first.");
    setLoading("Generating resume-specific interview questions...");
    try {
      const r = await fetch("/api/questions", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({role, resume_text:resume.text, count})
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Question generation failed.");
      setQuestions(data.questions);
      await startMedia();
      setStep("interview");
      setQuestionIndex(0);
      setResults([]);
      setTimeout(() => speakQuestion(data.questions[0].question), 400);
    } catch (e) {
      setError(e.message);
      stopMedia();
    } finally {
      setLoading("");
    }
  }

  async function startMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({video:true, audio:true});
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setCamera(true);
    setMic(true);
    visionTimerRef.current = setInterval(checkVision, 2500);
  }

  function stopMedia() {
    if (visionTimerRef.current) clearInterval(visionTimerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCamera(false);
    setMic(false);
  }

  async function checkVision() {
    if (!videoRef.current || videoRef.current.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(async blob => {
      if (!blob) return;
      const form = new FormData();
      form.append("frame", blob, "frame.jpg");
      try {
        const r = await fetch("/api/vision", {method:"POST",body:form});
        const d = await r.json();
        if (d.signal === "no-face") setIntegrity(v => ({...v,noFace:v.noFace+1}));
        if (d.signal === "multiple-faces") setIntegrity(v => ({...v,multipleFaces:v.multipleFaces+1}));
      } catch {}
    }, "image/jpeg", .7);
  }

  async function speakQuestion(text) {
    try {
      const form = new FormData();
      form.append("text", text);
      const r = await fetch("/api/speak", {method:"POST",body:form});
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      const audio = new Audio(d.audio);
      await audio.play();
    } catch {
      // No cloud fallback: if local TTS is unavailable, the text remains visible.
    }
  }

  function startAnswer() {
    if (!streamRef.current?.getAudioTracks().length) {
      setError("Microphone is not available.");
      return;
    }
    setTranscript("");
    setEvaluation(null);
    chunksRef.current = [];
    const audioStream = new MediaStream(streamRef.current.getAudioTracks());
    const recorder = new MediaRecorder(audioStream);
    recorderRef.current = recorder;
    recorder.ondataavailable = e => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = processAnswer;
    recorder.start();
    setMic(true);
  }

  function stopAnswer() {
    recorderRef.current?.stop();
    setMic(false);
    setLoading("Transcribing your answer locally with Whisper...");
  }

  async function processAnswer() {
    try {
      const blob = new Blob(chunksRef.current, {type:"audio/webm"});
      const form = new FormData();
      form.append("audio", blob, "answer.webm");
      const tr = await fetch("/api/transcribe", {method:"POST",body:form});
      const td = await tr.json();
      if (!tr.ok) throw new Error(td.detail || "Transcription failed.");
      setTranscript(td.text);

      setLoading("Scoring the answer with your local AI...");
      const q = questions[questionIndex];
      const er = await fetch("/api/evaluate", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          role,
          resume_text:resume.text,
          question:q.question,
          transcript:td.text
        })
      });
      const ed = await er.json();
      if (!er.ok) throw new Error(ed.detail || "Evaluation failed.");
      setEvaluation(ed);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  }

  async function nextQuestion() {
    if (evaluation) setResults(v => [...v, {question:questions[questionIndex], evaluation, transcript}]);
    const next = questionIndex + 1;
    if (next >= questions.length) {
      stopMedia();
      setStep("results");
      return;
    }
    setQuestionIndex(next);
    setTranscript("");
    setEvaluation(null);
    setTimeout(() => speakQuestion(questions[next].question), 200);
  }

  function restart() {
    stopMedia();
    setStep("setup");
    setQuestions([]);
    setQuestionIndex(0);
    setTranscript("");
    setEvaluation(null);
    setResults([]);
    setError("");
  }

  const current = questions[questionIndex];

  return <div className={`app ${dark ? "dark":""}`}>
    <header className="top">
      <div className="brand"><div className="brand-icon"><Brain size={19}/></div><div><b>MockMate</b><small>local AI • no HR jumpscares</small></div></div>
      <div className="top-right"><span className={`ai-status ${health?.ollama ? "on":""}`}><i/> {health?.ollama ? "Ollama online" : "Ollama offline"}</span><button className="theme" onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>}</button></div>
    </header>

    {error && <div className="error"><CircleAlert size={16}/><span>{error}</span><button onClick={()=>setError("")}><X size={14}/></button></div>}

    {loading && <div className="loading-line"><span/><b>{loading}</b></div>}

    {step==="setup" && <Setup resume={resume} uploadResume={uploadResume} role={role} setRole={setRole} count={count} setCount={setCount} startInterview={startInterview} health={health}/>}
    {step==="interview" && <Interview videoRef={videoRef} current={current} index={questionIndex} total={questions.length} camera={camera} mic={mic} transcript={transcript} evaluation={evaluation} integrity={integrity} startAnswer={startAnswer} stopAnswer={stopAnswer} nextQuestion={nextQuestion}/>}
    {step==="results" && <Results results={results} integrity={integrity} role={role} restart={restart}/>}
  </div>
}

function Setup({resume,uploadResume,role,setRole,count,setCount,startInterview,health}) {
  return <main className="setup">
    <section className="intro"><span className="eyebrow">PRIVATE • LOCAL • FREE • NO BS</span><h1>Your interview.<br/><em>No HR jumpscares.</em></h1><p>Upload your resume. Pick a role. Then face a real voice interview powered by open models running on your own machine.</p><div className="feature-row"><span>🎙 Local Whisper</span><span>🧠 Ollama</span><span>👁 OpenCV</span><span>🔊 Local TTS</span></div></section>

    <section className="setup-card">
      <div className="step-label">01 / YOUR RESUME</div>
      <label className={`drop ${resume?"ready":""}`}>
        <input type="file" accept=".pdf,.docx,.txt" onChange={e=>e.target.files[0]&&uploadResume(e.target.files[0])}/>
        <div className="upload-icon">{resume?<Check size={22}/>:<Upload size={22}/>}</div>
        <div><b>{resume ? resume.filename : "Upload your resume"}</b><small>{resume ? `${resume.summary.characters} characters extracted locally` : "PDF, DOCX or TXT • never leaves your computer"}</small></div>
      </label>

      {resume && <div className="resume-preview"><FileText size={15}/><div><b>Detected skills</b><span>{resume.summary.skills.length ? resume.summary.skills.join(" • ") : "No common skills detected — that's okay."}</span></div></div>}

      <div className="step-label second">02 / TARGET ROLE</div>
      <select className="select" value={role} onChange={e=>setRole(e.target.value)}>{ROLES.map(r=><option key={r}>{r}</option>)}</select>

      <div className="step-label second">03 / INTERVIEW LENGTH</div>
      <div className="lengths">{[3,5,7,10].map(n=><button className={count===n?"selected":""} key={n} onClick={()=>setCount(n)}>{n} questions</button>)}</div>

      <button className="start" disabled={!resume || !health?.ollama} onClick={startInterview}><Play size={17}/> Let's get grilled <ArrowRight size={16}/></button>
      {!health?.ollama && <p className="offline">Start Ollama and run an open model first:<code>ollama run llama3.2:3b</code></p>}
    </section>

    <div className="setup-note"><ShieldCheck size={16}/><span><b>Local means local.</b> Resume, audio, webcam frames and answers are processed by services on this computer. Nothing is sent to a paid AI API.</span></div>
  </main>
}

function Interview({videoRef,current,index,total,camera,mic,transcript,evaluation,integrity,startAnswer,stopAnswer,nextQuestion}) {
  return <main className="interview">
    <div className="interview-top"><div><span className="eyebrow">LIVE INTERVIEW</span><h2>{current?.category || "Interview"} • {current?.difficulty || "medium"}</h2></div><div className="counter">QUESTION <b>{index+1}</b> / {total}</div></div>

    <div className="interview-grid">
      <section className="camera-card">
        <video ref={videoRef} muted playsInline className="video"/>
        {!camera && <div className="camera-off"><VideoOff size={25}/><span>Camera unavailable</span></div>}
        <div className="camera-status"><span className={camera?"green-dot":""}/>{camera?"Camera active":"Camera off"} <span className="sep"/> <span className={mic?"green-dot":""}/>{mic?"Mic active":"Mic idle"}</div>
        <div className="integrity"><ShieldCheck size={14}/><span>Integrity monitor</span><b>{integrity.tabSwitches+integrity.multipleFaces+integrity.noFace} signals</b></div>
      </section>

      <section className="question-card">
        <div className="speaker"><span>AI INTERVIEWER</span><div>🔊</div></div>
        <h1>{current?.question}</h1>
        <p>Talk like a human. Whisper writes it down. The robot judges you. 🤖</p>

        <div className="answer-area">
          {transcript ? <><span className="mini-label">YOUR TRANSCRIPT</span><div className="transcript">{transcript}</div></> : <div className="waiting"><Mic size={20}/><span>{mic ? "Recording your answer..." : "Ready to get absolutely grilled."}</span></div>}
        </div>

        {!evaluation ? (
          <button className={`record ${mic?"recording":""}`} onClick={mic?stopAnswer:startAnswer}>{mic?<><MicOff size={18}/> Stop & evaluate</>:<><Mic size={18}/> Start speaking</>}</button>
        ) : (
          <div className="evaluation"><div className="score"><span>AI SCORE</span><b>{evaluation.overall}</b><small>/ 100</small></div><div className="score-grid"><Score name="Technical" value={evaluation.technical}/><Score name="Communication" value={evaluation.communication}/><Score name="Relevance" value={evaluation.relevance}/><Score name="Structure" value={evaluation.structure}/></div><p className="verdict">{evaluation.verdict?.toUpperCase()}: {evaluation.strengths?.[0]}</p><button className="next" onClick={nextQuestion}>Next question <ArrowRight size={15}/></button></div>
        )}
      </section>
    </div>
  </main>
}

function Score({name,value}){return <div><span>{name}</span><b>{value}</b><div className="scorebar"><i style={{width:`${value}%`}}/></div></div>}

function Results({results,integrity,role,restart}) {
  const scores = results.map(r=>Number(r.evaluation?.overall||0)).filter(Boolean);
  const average = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  return <main className="results">
    <span className="eyebrow">INTERVIEW COMPLETE</span><h1>{average >= 75 ? "Pretty solid. 👏" : average >= 55 ? "You've got work to do." : "Good. Now we know what to fix."}</h1><p>{role} • {results.length} evaluated answers</p>
    <div className="result-grid"><div className="result-score"><span>OVERALL</span><b>{average}</b><small>/ 100</small></div><div className="integrity-report"><div><ShieldCheck size={18}/><b>Integrity signals</b></div><Signal label="Tab switches" value={integrity.tabSwitches}/><Signal label="Multiple faces" value={integrity.multipleFaces}/><Signal label="No-face checks" value={integrity.noFace}/><Signal label="Copy attempts" value={integrity.copyEvents}/><small>Signals are indicators, not proof of cheating.</small></div></div>
    <section className="result-list">{results.map((r,i)=><div className="result-item" key={i}><div><span>Q{i+1}</span><b>{r.question.question}</b></div><strong>{r.evaluation.overall}</strong><small>{r.evaluation.improvements?.[0]}</small></div>)}</section>
    <button className="start" onClick={restart}><Zap size={16}/> Start another interview</button>
  </main>
}

function Signal({label,value}){return <div><span>{label}</span><b className={value?"warn":""}>{value}</b></div>}

createRoot(document.getElementById("root")).render(<App/>);
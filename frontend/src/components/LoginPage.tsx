import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import type { FaceRecord } from '../services/api';

const FACES_KEY = 'bibo_faces';

function loadLocalFaces(): FaceRecord[] {
  try {
    const raw = sessionStorage.getItem(FACES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalFaces(faces: FaceRecord[]) {
  sessionStorage.setItem(FACES_KEY, JSON.stringify(faces));
}

/* ── Custom CAPTCHA ──────────────────────────────────── */

function generateCode(len = 6): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function drawCaptcha(canvas: HTMLCanvasElement, code: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${140 + Math.random() * 60},${150 + Math.random() * 60},${180 + Math.random() * 60},0.4)`;
    ctx.lineWidth = 1 + Math.random();
    ctx.beginPath();
    ctx.moveTo(Math.random() * W, Math.random() * H);
    ctx.bezierCurveTo(Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H);
    ctx.stroke();
  }

  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(${120 + Math.random() * 80},${120 + Math.random() * 80},${140 + Math.random() * 80},${0.2 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Characters
  const spacing = W / (code.length + 1);
  const colors = ['#059669', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#0891b2'];
  ctx.textBaseline = 'middle';

  for (let i = 0; i < code.length; i++) {
    ctx.save();
    const x = spacing * (i + 0.7) + (Math.random() - 0.5) * 8;
    const y = H / 2 + (Math.random() - 0.5) * 14;
    const angle = (Math.random() - 0.5) * 0.5;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `bold ${24 + Math.random() * 8}px 'Courier New', monospace`;
    ctx.fillStyle = colors[i % colors.length];
    ctx.shadowColor = colors[i % colors.length];
    ctx.shadowBlur = 4;
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = `rgba(${80 + Math.random() * 80},${80 + Math.random() * 80},${100 + Math.random() * 80},0.3)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10 + Math.random() * 30, H * 0.3 + Math.random() * H * 0.4);
    ctx.lineTo(W - 10 - Math.random() * 30, H * 0.3 + Math.random() * H * 0.4);
    ctx.stroke();
  }
}

function CaptchaWidget({ onVerify }: { onVerify: (ok: boolean) => void }) {
  const captchaCanvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState(generateCode);
  const [input, setInput] = useState('');
  const [verified, setVerified] = useState(false);
  const [shakeError, setShakeError] = useState(false);

  useEffect(() => {
    if (captchaCanvasRef.current) drawCaptcha(captchaCanvasRef.current, code);
  }, [code]);

  const refresh = () => {
    setCode(generateCode());
    setInput('');
    setVerified(false);
    onVerify(false);
  };

  const check = () => {
    if (input.toUpperCase() === code) {
      setVerified(true);
      onVerify(true);
    } else {
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
      refresh();
    }
  };

  if (verified) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600"><polyline points="20 6 9 17 4 12"/></svg>
        <span className="text-sm text-emerald-700 font-semibold">Verified</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-gray-50 p-3 ${shakeError ? 'animate-[shake_0.3s_ease-in-out]' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] uppercase text-gray-600 font-bold tracking-wider">Security Check</span>
      </div>
      <div className="flex items-center gap-2">
        <canvas
          ref={captchaCanvasRef}
          width={220}
          height={60}
          className="rounded border border-gray-300"
        />
        <button
          type="button"
          onClick={refresh}
          className="shrink-0 rounded p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          title="New code"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="Type the code"
          maxLength={6}
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 font-mono tracking-widest placeholder-gray-400 focus:border-emerald-500 focus:outline-none uppercase"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={check}
          disabled={input.length < 6}
          className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
        >
          Verify
        </button>
      </div>
    </div>
  );
}

export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
}

interface Props {
  onLogin: (user: AuthUser) => void;
}

const MATCH_THRESHOLD = 0.5;

export default function LoginPage({ onLogin }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [status, setStatus] = useState('Loading face detection models...');
  const [faceDetected, setFaceDetected] = useState(false);
  const [matchResult, setMatchResult] = useState<{ user: FaceRecord; distance: number } | null>(null);
  const [error, setError] = useState('');
  const [faces, setFaces] = useState<FaceRecord[]>([]);
  const [facesLoading, setFacesLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Bootstrap state — only shows when zero users enrolled on this device
  const [bootstrapName, setBootstrapName] = useState('');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<number | null>(null);

  // Load enrolled faces from this device's localStorage
  useEffect(() => {
    setFaces(loadLocalFaces());
    setFacesLoading(false);
  }, []);

  const isBootstrap = !facesLoading && faces.length === 0;

  // Load face-api models
  useEffect(() => {
    async function loadModels() {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
        setStatus('Models loaded. Starting camera...');
      } catch (err) {
        setError(`Failed to load face detection models: ${err}`);
        setStatus('Model loading failed.');
      }
    }
    loadModels();
  }, []);

  // Start camera
  useEffect(() => {
    if (!modelsLoaded) return;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360, facingMode: 'user' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => setCameraReady(true);
        }
        setStatus(isBootstrap ? 'First-time setup — enroll the initial administrator.' : 'Position your face in the frame.');
      } catch {
        setCameraError(true);
        setError('Camera access denied. Please allow camera permissions and reload.');
        setStatus('Camera unavailable.');
      }
    }
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelsLoaded]);

  const detectFace = useCallback(async (): Promise<faceapi.WithFaceDescriptor<faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>> | null> => {
    if (!videoRef.current || !cameraReady) return null;

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    setFaceDetected(!!detection);

    if (canvasRef.current && videoRef.current) {
      const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
      faceapi.draw.drawDetections(canvasRef.current, detection ? faceapi.resizeResults([detection], dims) : []);
    }

    return detection || null;
  }, [cameraReady]);

  // Continuous detection loop
  useEffect(() => {
    if (!cameraReady) return;

    detectIntervalRef.current = window.setInterval(async () => {
      const detection = await detectFace();
      if (detection && !isBootstrap && faces.length > 0) {
        const labeledDescriptors = faces.map(
          (u, i) => new faceapi.LabeledFaceDescriptors(`${i}`, [new Float32Array(u.descriptor)])
        );
        const matcher = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
        const match = matcher.findBestMatch(detection.descriptor);
        if (match.label !== 'unknown') {
          setMatchResult({ user: faces[parseInt(match.label)], distance: match.distance });
        } else {
          setMatchResult(null);
        }
      }
    }, 500);

    return () => {
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    };
  }, [cameraReady, faces, isBootstrap, detectFace]);

  // --- Bootstrap: first admin enrollment (per-device) ---
  const handleBootstrap = async () => {
    if (!bootstrapName.trim()) {
      setError('Enter your name to continue.');
      return;
    }
    setError('');
    setBootstrapLoading(true);
    setStatus('Capturing face...');

    const detection = await detectFace();
    if (!detection) {
      setError('No face detected. Position your face in the frame and try again.');
      setBootstrapLoading(false);
      return;
    }

    const record: FaceRecord = {
      id: crypto.randomUUID(),
      name: bootstrapName.trim(),
      role: 'admin',
      descriptor: Array.from(detection.descriptor),
    };
    const updated = [...faces, record];
    saveLocalFaces(updated);
    setFaces(updated);
    setBootstrapName('');
    setStatus('Administrator enrolled. You can now log in.');
    setBootstrapLoading(false);
  };

  // --- Face login ---
  const handleFaceLogin = async () => {
    if (!captchaVerified) {
      setError('Complete the security verification first.');
      return;
    }
    setError('');
    setScanning(true);
    setStatus('Scanning...');

    const detection = await detectFace();
    if (!detection) {
      setError('No face detected. Position your face in the frame and try again.');
      setScanning(false);
      return;
    }

    if (faces.length === 0) {
      setError('No enrolled personnel. Contact your administrator.');
      setScanning(false);
      return;
    }

    const labeledDescriptors = faces.map(
      (u, i) => new faceapi.LabeledFaceDescriptors(`${i}`, [new Float32Array(u.descriptor)])
    );
    const matcher = new faceapi.FaceMatcher(labeledDescriptors, MATCH_THRESHOLD);
    const match = matcher.findBestMatch(detection.descriptor);

    if (match.label === 'unknown') {
      setError('Identity not recognized. Access denied.');
      setScanning(false);
      return;
    }

    const matchedUser = faces[parseInt(match.label)];
    setScanning(false);
    onLogin({ id: matchedUser.id, name: matchedUser.name, role: matchedUser.role as UserRole });
  };

  return (
    <div className="login-page-themed min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <img
            src={new URL('../assets/sprites/environment/title_font.png', import.meta.url).href}
            alt="BIBO"
            className="mx-auto mb-4"
            style={{ width: 240, height: 'auto', imageRendering: 'pixelated' }}
          />
          <p className="text-gray-600 text-sm">
            {isBootstrap ? 'System Initialization — Register First Administrator' : 'Biometric Access Control'}
          </p>
        </div>

        {/* Main Card */}
        <div className="login-card rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xl">
          <div className="p-6">
            {/* Camera Feed */}
            <div className="relative rounded-lg overflow-hidden bg-black mb-4 mx-auto" style={{ maxWidth: 480 }}>
              {!cameraError ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-auto"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                </>
              ) : (
                <div className="flex items-center justify-center h-64 bg-gray-900">
                  <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-500 mx-auto mb-2"><path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/></svg>
                    <p className="text-red-400 text-xs font-semibold">Camera Access Required</p>
                    <p className="text-gray-600 text-xs mt-1">Allow camera permissions and reload the page.</p>
                  </div>
                </div>
              )}

              {/* Face detection indicator */}
              {!cameraError && (
                <div className={`absolute top-3 left-3 flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  faceDetected
                    ? 'bg-emerald-900/80 text-emerald-400 border border-emerald-600/50'
                    : 'bg-gray-900/80 text-gray-500 border border-gray-700/50'
                }`}>
                  <div className={`h-2 w-2 rounded-full ${faceDetected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                  {faceDetected ? 'Face Detected' : 'No Face'}
                </div>
              )}

              {/* Live match indicator */}
              {!isBootstrap && matchResult && (
                <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-emerald-900/90 border border-emerald-600/50 px-3 py-2 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-emerald-300 font-semibold">Identity: {matchResult.user.name}</span>
                    <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                      matchResult.user.role === 'admin' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {matchResult.user.role.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[10px] text-emerald-400/70 mt-0.5">
                    Confidence: {((1 - matchResult.distance) * 100).toFixed(1)}%
                  </div>
                </div>
              )}

              {!cameraReady && modelsLoaded && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <span className="text-gray-400 text-sm animate-pulse">Starting camera...</span>
                </div>
              )}
              {!modelsLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-emerald-400 rounded-full animate-spin mx-auto mb-2" />
                    <span className="text-gray-400 text-xs">Loading AI models...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            <div className="text-center text-xs text-gray-500 mb-4">{status}</div>

            {/* Loading faces */}
            {facesLoading && (
              <div className="text-center text-xs text-gray-500 py-4">Loading enrolled personnel...</div>
            )}

            {/* === BOOTSTRAP MODE: First admin enrollment === */}
            {isBootstrap && !facesLoading && (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3">
                  <span className="text-xs text-amber-700 font-semibold">First-time setup</span>
                  <p className="text-xs text-amber-600 mt-0.5">No personnel enrolled. Register yourself as the system administrator to get started.</p>
                </div>

                <div>
                  <label className="text-xs text-gray-600 block mb-1">Your Name</label>
                  <input
                    type="text"
                    value={bootstrapName}
                    onChange={e => setBootstrapName(e.target.value)}
                    placeholder="e.g. Nick Fury"
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none"
                    onKeyDown={e => e.key === 'Enter' && handleBootstrap()}
                  />
                </div>
                <button
                  onClick={handleBootstrap}
                  disabled={!faceDetected || !bootstrapName.trim() || bootstrapLoading || cameraError}
                  className="w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40 transition-colors"
                >
                  {bootstrapLoading ? 'Enrolling...' : 'Register as Administrator'}
                </button>
              </div>
            )}

            {/* === NORMAL LOGIN MODE === */}
            {!isBootstrap && !facesLoading && (
              <div className="space-y-3">
                {/* CAPTCHA */}
                <CaptchaWidget onVerify={setCaptchaVerified} />

                <button
                  onClick={handleFaceLogin}
                  disabled={!faceDetected || !captchaVerified || scanning || cameraError}
                  className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                >
                  {scanning ? 'Verifying identity...' : 'Authenticate'}
                </button>

                <div className="text-center text-[10px] text-gray-500 pt-1">
                  {faces.length} personnel enrolled on this device
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';

import boIdleSrc from '../assets/sprites/bo/Bo_idle.png';
import boSnapSrc from '../assets/sprites/bo/Bo_snap.png';
import boWaveSrc from '../assets/sprites/bo/Bo_wave.png';
import sirenSrc from '../assets/sprites/environment/Emergency.png';

const FRAME_W = 64;
const FRAME_H = 64;
const IDLE_FRAMES = 4;
const WAVE_FRAMES = 11;
const SNAP_FRAMES = 17;
const SIREN_FRAME_W = 160;
const SIREN_FRAME_H = 90;
const SIREN_FRAMES = 53;

const IDLE_FPS = 6;
const WAVE_FPS = 10;
const SNAP_FPS = 12;
const SIREN_FPS = 16;
const DISPLAY_SCALE = 3;

type SnapPhase =
  | 'idle'
  | 'walk-to-center'
  | 'snapping'
  | 'flash'
  | 'siren'
  | 'returning';

interface Props {
  snapTriggered: boolean;
  onSnapComplete: () => void;
  visible: boolean;
  onClick?: () => void;
}

export default function BoSprite({ snapTriggered, onSnapComplete, visible, onClick }: Props) {
  const [phase, setPhase] = useState<SnapPhase>('idle');
  const idleFrame = useRef(0);
  const snapFrame = useRef(0);
  const sirenFrame = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sirenCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const lastFrameTime = useRef(0);
  const sirenRafRef = useRef<number>(0);
  const sirenLastFrame = useRef(0);
  const onCompleteRef = useRef(onSnapComplete);
  onCompleteRef.current = onSnapComplete;

  const boIdleImg = useRef<HTMLImageElement | null>(null);
  const boSnapImg = useRef<HTMLImageElement | null>(null);
  const boWaveImg = useRef<HTMLImageElement | null>(null);
  const sirenImg = useRef<HTMLImageElement | null>(null);
  const waveFrame = useRef(0);

  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [boPos, setBoPos] = useState<{ x: number; y: number } | null>(null);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [sirenVisible, setSirenVisible] = useState(false);
  const [sirenY, setSirenY] = useState(-120);
  const [dustParticles, setDustParticles] = useState<{ id: number; x: number; y: number; vx: number; vy: number; opacity: number; size: number }[]>([]);

  useEffect(() => {
    let loaded = 0;
    const total = 4;
    const check = () => { loaded++; if (loaded === total) setImagesLoaded(true); };

    const idle = new Image(); idle.src = boIdleSrc; idle.onload = check; boIdleImg.current = idle;
    const snap = new Image(); snap.src = boSnapSrc; snap.onload = check; boSnapImg.current = snap;
    const wave = new Image(); wave.src = boWaveSrc; wave.onload = check; boWaveImg.current = wave;
    const sir = new Image(); sir.src = sirenSrc; sir.onload = check; sirenImg.current = sir;
  }, []);

  const drawBo = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !imagesLoaded) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isSnapping = phase === 'snapping';
    const isWaving = !isSnapping && hovered && phase === 'idle';

    const img = isSnapping
      ? boSnapImg.current
      : isWaving
        ? boWaveImg.current
        : boIdleImg.current;
    const totalFrames = isSnapping ? SNAP_FRAMES : isWaving ? WAVE_FRAMES : IDLE_FRAMES;
    const fps = isSnapping ? SNAP_FPS : isWaving ? WAVE_FPS : IDLE_FPS;
    const frameRef = isSnapping ? snapFrame : isWaving ? waveFrame : idleFrame;

    const interval = 1000 / fps;
    if (timestamp - lastFrameTime.current >= interval) {
      lastFrameTime.current = timestamp;
      frameRef.current = (frameRef.current + 1) % totalFrames;

      if (isSnapping && frameRef.current === 0) {
        setPhase('flash');
        return;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        frameRef.current * FRAME_W, 0, FRAME_W, FRAME_H,
        0, 0, canvas.width, canvas.height
      );
    }

    rafRef.current = requestAnimationFrame(drawBo);
  }, [phase, imagesLoaded, hovered]);

  useEffect(() => {
    if (!imagesLoaded || !visible) return;
    rafRef.current = requestAnimationFrame(drawBo);
    return () => cancelAnimationFrame(rafRef.current);
  }, [drawBo, imagesLoaded, visible]);

  const sirenDoneRef = useRef(false);

  const drawSiren = useCallback((timestamp: number) => {
    const canvas = sirenCanvasRef.current;
    if (!canvas || !sirenImg.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const screenW = window.innerWidth;
    const screenH = Math.round(screenW * (SIREN_FRAME_H / SIREN_FRAME_W));
    if (canvas.width !== screenW) canvas.width = screenW;
    if (canvas.height !== screenH) canvas.height = screenH;

    const interval = 1000 / SIREN_FPS;
    if (timestamp - sirenLastFrame.current >= interval) {
      sirenLastFrame.current = timestamp;

      if (sirenFrame.current >= SIREN_FRAMES - 1) {
        sirenDoneRef.current = true;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      sirenFrame.current += 1;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      sirenImg.current,
      sirenFrame.current * SIREN_FRAME_W, 0, SIREN_FRAME_W, SIREN_FRAME_H,
      0, 0, screenW, screenH
    );

    sirenRafRef.current = requestAnimationFrame(drawSiren);
  }, []);

  useEffect(() => {
    if (!sirenVisible) return;
    sirenRafRef.current = requestAnimationFrame(drawSiren);
    return () => cancelAnimationFrame(sirenRafRef.current);
  }, [sirenVisible, drawSiren]);

  /* ── Snap trigger ─────────────────────────────── */
  useEffect(() => {
    if (!snapTriggered || phase !== 'idle') return;

    snapFrame.current = 0;
    setPhase('walk-to-center');

    const centerX = window.innerWidth / 2 - (FRAME_W * DISPLAY_SCALE) / 2;
    const centerY = window.innerHeight / 2 - (FRAME_H * DISPLAY_SCALE) / 2;
    setBoPos({ x: centerX, y: centerY });

    setTimeout(() => setPhase('snapping'), 800);
  }, [snapTriggered, phase]);

  /* ── Flash + particles ─────────────────────────── */
  useEffect(() => {
    if (phase !== 'flash') return;

    setFlashOpacity(1);

    const particles = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 400,
      y: window.innerHeight / 2 + (Math.random() - 0.5) * 300,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      opacity: 1,
      size: Math.random() * 6 + 2,
    }));
    setDustParticles(particles);

    setTimeout(() => setFlashOpacity(0), 300);
    setTimeout(() => {
      setPhase('siren');
      sirenFrame.current = 0;
      sirenDoneRef.current = false;
      setSirenVisible(true);
      setSirenY(-120);
      let y = -120;
      const dropInterval = setInterval(() => {
        y += 10;
        if (y >= 0) {
          y = 0;
          clearInterval(dropInterval);
        }
        setSirenY(y);
      }, 16);
    }, 600);

    setTimeout(() => setDustParticles([]), 2000);
  }, [phase]);

  /* ── Dust physics ──────────────────────────────── */
  useEffect(() => {
    if (dustParticles.length === 0) return;
    const interval = setInterval(() => {
      setDustParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.15,
            opacity: p.opacity - 0.02,
          }))
          .filter(p => p.opacity > 0)
      );
    }, 30);
    return () => clearInterval(interval);
  }, [dustParticles.length > 0]);

  /* ── Siren -> Return to idle (when animation finishes) ── */
  useEffect(() => {
    if (phase !== 'siren') return;

    const poll = setInterval(() => {
      if (!sirenDoneRef.current) return;
      clearInterval(poll);

      setSirenVisible(false);
      setSirenY(-120);
      setPhase('returning');

      setBoPos({ x: 16, y: window.innerHeight - 16 - FRAME_H * DISPLAY_SCALE });

      setTimeout(() => {
        setBoPos(null);
        setPhase('idle');
        idleFrame.current = 0;
        onCompleteRef.current();
      }, 800);
    }, 100);

    return () => clearInterval(poll);
  }, [phase]);

  if (!visible || !imagesLoaded) return null;

  const isAtRest = phase === 'idle';
  const boStyle: React.CSSProperties = isAtRest
    ? {
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9998,
        imageRendering: 'pixelated' as const,
      }
    : {
        position: 'fixed',
        left: boPos?.x ?? 16,
        top: boPos?.y ?? undefined,
        bottom: boPos ? undefined : 16,
        zIndex: 9998,
        transition: (phase === 'walk-to-center' || phase === 'returning')
          ? 'left 0.7s ease-in-out, top 0.7s ease-in-out'
          : 'none',
        imageRendering: 'pixelated' as const,
      };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={FRAME_W * DISPLAY_SCALE}
        height={FRAME_H * DISPLAY_SCALE}
        style={{ ...boStyle, cursor: isAtRest && onClick ? 'pointer' : undefined }}
        onClick={isAtRest && onClick ? onClick : undefined}
        onMouseEnter={() => { if (isAtRest) { waveFrame.current = 0; setHovered(true); } }}
        onMouseLeave={() => setHovered(false)}
        title={isAtRest && onClick ? 'Chat with Bo' : undefined}
      />

      {flashOpacity > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'white',
            opacity: flashOpacity,
            zIndex: 10000,
            transition: 'opacity 0.5s ease-out',
            pointerEvents: 'none',
          }}
        />
      )}

      {dustParticles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: `rgba(180, 160, 120, ${p.opacity})`,
            zIndex: 10001,
            pointerEvents: 'none',
          }}
        />
      ))}

      {sirenVisible && (
        <canvas
          ref={sirenCanvasRef}
          style={{
            position: 'fixed',
            top: sirenY,
            left: 0,
            width: '100vw',
            zIndex: 10002,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      )}

      {sirenVisible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10003,
            animation: 'siren-flash 0.5s infinite alternate',
          }}
        />
      )}
    </>
  );
}

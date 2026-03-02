import { useEffect, useRef, useState, useCallback } from 'react';

import boIdleSrc from '../assets/sprites/bo/Bo_idle.png';
import boSnapSrc from '../assets/sprites/bo/Bo_snap.png';
import boWaveSrc from '../assets/sprites/bo/Bo_wave.png';
import sirenSrc from '../assets/sprites/environment/Emergency.png';

/* ═══════════════════════════════════════════════════════════
   TIMING & VISUAL KNOBS — adjust these to tweak the snap
   ═══════════════════════════════════════════════════════════ */

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
const SNAP_FPS = 12;                // speed of the 17-frame snap animation
const SIREN_FPS = 16;
const DISPLAY_SCALE = 3;

const WALK_TO_CENTER_MS = 800;      // how long Bo takes to walk to center (diagonal)
const FLASH_HOLD_MS = 300;          // how long the white screen stays at full opacity
const FLASH_FADE_MS = 500;          // how long the white fades out (CSS transition)
const SIREN_DELAY_MS = 600;         // delay after flash before siren drops in
const SIREN_DROP_SPEED = 10;        // pixels per frame the siren drops (16ms per frame)
const DUST_PARTICLE_COUNT = 60;     // number of snap dust particles
const DUST_LIFETIME_MS = 2000;      // how long dust particles linger
const RETURN_DELAY_MS = 200;        // delay after flash before Bo starts returning
const RETURN_WALK_MS = 900;         // how long Bo takes to walk back to corner

/* ═══════════════════════════════════════════════════════════ */

type SnapPhase =
  | 'idle'
  | 'walk-to-center'
  | 'snapping'
  | 'flash'
  | 'siren'
  | 'returning';

interface Props {
  snapTriggered: boolean;
  onFlash?: () => void;
  onSnapComplete: () => void;
  visible: boolean;
  onClick?: () => void;
}

export default function BoSprite({ snapTriggered, onFlash, onSnapComplete, visible, onClick }: Props) {
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
  const onFlashRef = useRef(onFlash);
  onFlashRef.current = onFlash;

  const boIdleImg = useRef<HTMLImageElement | null>(null);
  const boSnapImg = useRef<HTMLImageElement | null>(null);
  const boWaveImg = useRef<HTMLImageElement | null>(null);
  const sirenImg = useRef<HTMLImageElement | null>(null);
  const waveFrame = useRef(0);

  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [boPos, setBoPos] = useState<{ x: number; y: number } | null>(null);
  const [boTransition, setBoTransition] = useState('none');
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [sirenVisible, setSirenVisible] = useState(false);
  const [sirenY, setSirenY] = useState(-120);
  const [dustParticles, setDustParticles] = useState<{ id: number; x: number; y: number; vx: number; vy: number; opacity: number; size: number }[]>([]);

  const canvasH = FRAME_H * DISPLAY_SCALE;
  const canvasW = FRAME_W * DISPLAY_SCALE;
  const homePos = { x: 16, y: typeof window !== 'undefined' ? window.innerHeight - 16 - canvasH : 600 };

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

  /* ── Snap trigger: diagonal walk from bottom-left to center ── */
  useEffect(() => {
    if (!snapTriggered || phase !== 'idle') return;

    snapFrame.current = 0;

    const startPos = { x: 16, y: window.innerHeight - 16 - canvasH };
    setBoPos(startPos);
    setBoTransition('none');
    setPhase('walk-to-center');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const centerX = window.innerWidth / 2 - canvasW / 2;
        const centerY = window.innerHeight / 2 - canvasH / 2;
        setBoTransition(`left ${WALK_TO_CENTER_MS}ms ease-in-out, top ${WALK_TO_CENTER_MS}ms ease-in-out`);
        setBoPos({ x: centerX, y: centerY });
      });
    });

    setTimeout(() => setPhase('snapping'), WALK_TO_CENTER_MS);
  }, [snapTriggered, phase, canvasH, canvasW]);

  /* ── Flash + particles + start return simultaneously ── */
  useEffect(() => {
    if (phase !== 'flash') return;

    onFlashRef.current?.();
    setFlashOpacity(1);

    const particles = Array.from({ length: DUST_PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 400,
      y: window.innerHeight / 2 + (Math.random() - 0.5) * 300,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      opacity: 1,
      size: Math.random() * 6 + 2,
    }));
    setDustParticles(particles);

    setTimeout(() => setFlashOpacity(0), FLASH_HOLD_MS);

    setTimeout(() => {
      setPhase('siren');
      sirenFrame.current = 0;
      sirenDoneRef.current = false;
      setSirenVisible(true);
      setSirenY(-120);
      let y = -120;
      const dropInterval = setInterval(() => {
        y += SIREN_DROP_SPEED;
        if (y >= 0) { y = 0; clearInterval(dropInterval); }
        setSirenY(y);
      }, 16);
    }, SIREN_DELAY_MS);

    setTimeout(() => {
      setBoTransition(`left ${RETURN_WALK_MS}ms ease-in-out, top ${RETURN_WALK_MS}ms ease-in-out`);
      setBoPos({ x: homePos.x, y: window.innerHeight - 16 - canvasH });
    }, RETURN_DELAY_MS);

    setTimeout(() => setDustParticles([]), DUST_LIFETIME_MS);
  }, [phase, canvasH, homePos.x]);

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

  /* ── Siren done -> idle ── */
  useEffect(() => {
    if (phase !== 'siren') return;

    const poll = setInterval(() => {
      if (!sirenDoneRef.current) return;
      clearInterval(poll);

      setSirenVisible(false);
      setSirenY(-120);
      setBoTransition('none');
      setBoPos(null);
      setPhase('idle');
      idleFrame.current = 0;
      onCompleteRef.current();
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
        top: boPos?.y ?? homePos.y,
        zIndex: 9998,
        transition: boTransition,
        imageRendering: 'pixelated' as const,
      };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
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
            transition: `opacity ${FLASH_FADE_MS}ms ease-out`,
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

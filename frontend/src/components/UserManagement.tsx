import { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { fetchFaces, enrollFace, removeFace } from '../services/api';
import type { FaceRecord } from '../services/api';
import type { AuthUser } from './LoginPage';

interface Props {
  currentUser: AuthUser;
}

export default function UserManagement({ currentUser }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [faces, setFaces] = useState<FaceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectIntervalRef = useRef<number | null>(null);

  const loadFaces = useCallback(() => {
    setLoading(true);
    fetchFaces().then(setFaces).catch(() => setFaces([])).finally(() => setLoading(false));
  }, []);

  useEffect(loadFaces, [loadFaces]);

  // Start camera when enrollment form is shown
  useEffect(() => {
    if (!showCamera) return;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 400, height: 300, facingMode: 'user' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => setCameraReady(true);
        }
      } catch {
        setError('Camera access denied.');
      }
    }
    start();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setFaceDetected(false);
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    };
  }, [showCamera]);

  // Detection loop
  useEffect(() => {
    if (!cameraReady) return;

    detectIntervalRef.current = window.setInterval(async () => {
      if (!videoRef.current) return;
      const det = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      setFaceDetected(!!det);

      if (canvasRef.current && videoRef.current) {
        const dims = faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
        faceapi.draw.drawDetections(canvasRef.current, det ? faceapi.resizeResults([det], dims) : []);
      }
    }, 500);

    return () => {
      if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);
    };
  }, [cameraReady]);

  const handleEnroll = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setError('');
    setSuccess('');
    setEnrolling(true);

    if (!videoRef.current) { setError('Camera not ready.'); setEnrolling(false); return; }

    const det = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      setError('No face detected. Make sure the face is visible and try again.');
      setEnrolling(false);
      return;
    }

    try {
      const result = await enrollFace(
        { name: name.trim(), role, descriptor: Array.from(det.descriptor) },
        currentUser.role,
        currentUser.name,
      );
      setSuccess(`${result.name} enrolled as ${result.role}.`);
      setName('');
      setShowCamera(false);
      loadFaces();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = err as { response?: { data?: { detail?: string } } };
        setError(resp.response?.data?.detail || 'Enrollment failed.');
      } else {
        setError('Enrollment failed. Check backend connection.');
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (id === currentUser.id) {
      setError('You cannot remove your own account while logged in.');
      return;
    }
    setError('');
    try {
      await removeFace(id, currentUser.role);
      setConfirmDelete(null);
      loadFaces();
      setSuccess('Personnel removed.');
    } catch {
      setError('Failed to remove. Check permissions.');
    }
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className="rounded-lg border border-red-800/50 bg-red-950/20 p-8 text-center">
        <p className="text-red-400 font-semibold">Access Denied</p>
        <p className="text-gray-500 text-xs mt-1">Only administrators can manage personnel.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Personnel Management</h2>
          <p className="text-xs text-gray-500">{faces.length} enrolled</p>
        </div>
        {!showCamera && (
          <button
            onClick={() => { setShowCamera(true); setError(''); setSuccess(''); }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            + Enroll New
          </button>
        )}
      </div>

      {success && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Enrollment Form */}
      {showCamera && (
        <div className="rounded-lg border border-gray-300 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Enroll New Personnel</h3>
            <button
              onClick={() => setShowCamera(false)}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Camera */}
            <div className="relative rounded-lg overflow-hidden bg-gray-100">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-auto" style={{ transform: 'scaleX(-1)' }} />
              <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" style={{ transform: 'scaleX(-1)' }} />
              <div className={`absolute top-2 left-2 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                faceDetected ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-gray-200 text-gray-500'
              }`}>
                <div className={`h-1.5 w-1.5 rounded-full ${faceDetected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                {faceDetected ? 'Face Detected' : 'No Face'}
              </div>
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-700 block mb-1 font-medium">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Maria Hill"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-emerald-500 focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleEnroll()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-700 block mb-1 font-medium">Access Level</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`rounded border py-1.5 text-xs font-semibold transition-colors ${
                      role === 'admin' ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                    }`}
                  >
                    Administrator
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('user')}
                    className={`rounded border py-1.5 text-xs font-semibold transition-colors ${
                      role === 'user' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-300 bg-white text-gray-500 hover:border-gray-400'
                    }`}
                  >
                    Operator
                  </button>
                </div>
              </div>
              <button
                onClick={handleEnroll}
                disabled={!faceDetected || !name.trim() || enrolling}
                className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 transition-colors"
              >
                {enrolling ? 'Enrolling...' : 'Capture & Enroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Personnel List */}
      <div className="rounded-lg border border-gray-300 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-500 animate-pulse">Loading...</div>
        ) : faces.length === 0 ? (
          <div className="p-8 text-center text-xs text-gray-500">No personnel enrolled yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600">ID</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {faces.map(f => (
                <tr key={f.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-800 font-semibold">
                    {f.name}
                    {f.id === currentUser.id && <span className="ml-2 text-[10px] text-emerald-600">(you)</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                      f.role === 'admin' ? 'bg-red-600/80 text-white' : 'bg-blue-600/80 text-white'
                    }`}>
                      {f.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">{f.id.slice(0, 8)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {confirmDelete === f.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-[10px] text-red-500 font-semibold">Remove this person?</span>
                        <button onClick={() => handleRemove(f.id)} className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-500 transition-colors">Yes, Remove</button>
                        <button onClick={() => setConfirmDelete(null)} className="rounded bg-gray-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-gray-500 transition-colors">Cancel</button>
                      </div>
                    ) : f.id === currentUser.id ? (
                      <span className="text-[10px] text-gray-500 italic">You</span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(f.id)}
                        className="rounded bg-red-600/10 border border-red-600/30 px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  Download,
  Eye,
  Fingerprint,
  FlipHorizontal,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SwitchCamera,
  Touchpad,
  Upload,
  UserPlus,
  VideoOff,
  X,
} from 'lucide-react';
import type { Patient } from '../types/clinical';
import { encodePatientQrPayload, resolvePatientFromQrText } from '../lib/qrPayload';
import { generateFingerprintCode, generateMrn } from '../lib/seedPatients';
import { PatientAvatar } from './PatientAvatar';

interface BiometricScannerProps {
  patients: Patient[];
  onMatchFound: (patient: Patient, method?: 'biometric' | 'qr') => void;
  onEnrollUnknown: (capturedCode: string, mrnHint?: string) => void;
}

type CaptureMode = 'camera' | 'touch' | 'qr';

interface VideoDeviceOption {
  deviceId: string;
  label: string;
}

interface CameraDiagnosticReport {
  secureContext: boolean;
  mediaDevicesApi: boolean;
  permissionState: 'granted' | 'denied' | 'prompt' | 'unsupported';
  deviceCount: number;
  deviceLabels: string[];
  streamCheck: 'granted' | 'failed';
  errorName?: string;
  message: string;
  checkedAt: string;
}

export function BiometricScanner({
  patients,
  onMatchFound,
  onEnrollUnknown,
}: BiometricScannerProps) {
  const [mode, setMode] = useState<CaptureMode>('camera');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'off' | 'unavailable'>(
    'starting'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [videoDevices, setVideoDevices] = useState<VideoDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [mirrorPreview, setMirrorPreview] = useState(false);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(
    null
  );
  const [touchPreviewOpen, setTouchPreviewOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagReport, setDiagReport] = useState<CameraDiagnosticReport | null>(null);

  const [selectedSampleCode, setSelectedSampleCode] = useState<string>(
    () => patients[0]?.fingerprintCode || 'FP-UNKNOWN-NEW'
  );
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [unmatchedCode, setUnmatchedCode] = useState<string | null>(null);
  const [traumaFailureNotice, setTraumaFailureNotice] = useState<string | null>(null);

  // QR Fallback states
  const [qrInput, setQrInput] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrUnmatchedPayload, setQrUnmatchedPayload] = useState<string | null>(null);
  const [qrScanFramesCount, setQrScanFramesCount] = useState(0);
  const [qrPreviewPatientId, setQrPreviewPatientId] = useState<string>(
    () => patients[0]?.id || ''
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const qrLoopRef = useRef<number | null>(null);
  const qrLockedRef = useRef(false);

  useEffect(() => {
    if (
      selectedSampleCode !== 'UNREGISTERED_TEST' &&
      !patients.some((p) => p.fingerprintCode === selectedSampleCode) &&
      patients[0]
    ) {
      setSelectedSampleCode(patients[0].fingerprintCode);
    }
  }, [patients, selectedSampleCode]);

  useEffect(() => {
    if (!patients.some((p) => p.id === qrPreviewPatientId) && patients[0]) {
      setQrPreviewPatientId(patients[0].id);
    }
  }, [patients, qrPreviewPatientId]);

  const previewPatient = useMemo(
    () => patients.find((p) => p.id === qrPreviewPatientId) || patients[0] || null,
    [patients, qrPreviewPatientId]
  );

  // Generate real scannable QR code data URL for the selected emergency wristband preview
  useEffect(() => {
    if (!previewPatient) {
      setQrDataUrl(null);
      return;
    }
    const payload = encodePatientQrPayload(previewPatient);
    let cancelled = false;
    void QRCode.toDataURL(payload, {
      width: 240,
      margin: 2,
      color: { dark: '#0b1c30', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [previewPatient]);

  const attachStreamToVideo = useCallback(async (stream: MediaStream | null) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (!stream) {
      videoEl.srcObject = null;
      setVideoPlaying(false);
      return;
    }
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    try {
      await videoEl.play();
      setVideoPlaying(true);
    } catch {
      // Autoplay may wait for user interaction in strict browser modes
      setVideoPlaying(false);
    }
  }, []);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoPlaying(false);
    setVideoResolution(null);
  }, []);

  const refreshVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setVideoDevices(cams);
    } catch {
      // Ignore enumerateDevices errors
    }
  }, []);

  const startCamera = useCallback(
    async (overrideDeviceId?: string, overrideFacing?: 'environment' | 'user') => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('unavailable');
        setCameraError(
          'Camera API is unavailable in this browser or requires HTTPS. Use Touch Pad, Upload QR Image, or enter code below.'
        );
        return;
      }

      setCameraStatus('starting');
      setCameraError(null);
      stopCameraStream();

      const targetDeviceId =
        overrideDeviceId !== undefined ? overrideDeviceId : selectedDeviceId;
      const targetFacing = overrideFacing ?? facingMode;

      const primaryConstraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : {
              facingMode: { ideal: targetFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
        audio: false,
      };

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (primaryErr) {
        // Retry with minimal constraints in case facingMode or 720p is unsupported on this webcam
        const isPermissionDenied =
          primaryErr instanceof DOMException &&
          (primaryErr.name === 'NotAllowedError' || primaryErr.name === 'SecurityError');
        if (!isPermissionDenied) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } catch (fallbackErr) {
            setCameraStatus('unavailable');
            const msg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : 'No camera hardware detected or permission was blocked.';
            setCameraError(
              `${msg} Click "Turn Camera On" after granting browser permission, or use QR image upload / Touch Pad.`
            );
            return;
          }
        } else {
          setCameraStatus('unavailable');
          setCameraError(
            'Camera permission was denied by the browser. Allow camera access in your browser address bar, then click "Turn Camera On".'
          );
          return;
        }
      }

      streamRef.current = stream;
      setCameraStatus('active');
      await attachStreamToVideo(stream);
      await refreshVideoDevices();
    },
    [attachStreamToVideo, facingMode, refreshVideoDevices, selectedDeviceId, stopCameraStream]
  );

  const queryCameraPermissionState = useCallback(async (): Promise<
    'granted' | 'denied' | 'prompt' | 'unsupported'
  > => {
    if (!navigator.permissions?.query) return 'unsupported';
    try {
      const status = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      if (
        status.state === 'granted' ||
        status.state === 'denied' ||
        status.state === 'prompt'
      ) {
        return status.state;
      }
      return 'unsupported';
    } catch {
      return 'unsupported';
    }
  }, []);

  const readEnumeratedVideoDevices = useCallback(async (): Promise<VideoDeviceOption[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
    } catch {
      return [];
    }
  }, []);

  const runCameraPermissionDiagnostic = useCallback(async () => {
    setDiagLoading(true);
    const checkedAt = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
    const mediaDevicesApi = Boolean(
      typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia
    );
    const initialPermState = await queryCameraPermissionState();

    if (!mediaDevicesApi) {
      setCameraStatus('unavailable');
      const message = !secureContext
        ? 'Camera access requires a secure HTTPS origin (window.isSecureContext is false).'
        : 'Browser does not expose navigator.mediaDevices.getUserMedia in this environment.';
      setCameraError(message);
      setDiagReport({
        secureContext,
        mediaDevicesApi: false,
        permissionState: initialPermState,
        deviceCount: 0,
        deviceLabels: [],
        streamCheck: 'failed',
        errorName: 'MediaDevicesUnavailable',
        message,
        checkedAt,
      });
      setDiagLoading(false);
      return;
    }

    stopCameraStream();
    setCameraStatus('starting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      setCameraStatus('active');
      setCameraError(null);
      await attachStreamToVideo(stream);

      const cams = await readEnumeratedVideoDevices();
      setVideoDevices(cams);
      const postPermState = await queryCameraPermissionState();

      setDiagReport({
        secureContext,
        mediaDevicesApi: true,
        permissionState: postPermState === 'unsupported' ? 'granted' : postPermState,
        deviceCount: cams.length,
        deviceLabels: cams.map((c) => c.label),
        streamCheck: 'granted',
        message:
          'Camera permission granted and live video stream initialized successfully.',
        checkedAt,
      });
    } catch (err) {
      const cams = await readEnumeratedVideoDevices();
      setVideoDevices(cams);
      const postPermState = await queryCameraPermissionState();
      const errorName = err instanceof DOMException ? err.name : 'CameraError';

      let message =
        err instanceof Error && err.message
          ? err.message
          : 'Unable to initialize camera stream.';

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        message =
          'Camera access was denied by browser settings or iframe Permissions Policy. Click the camera/lock icon in the browser address bar to allow Camera, then re-run this check.';
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        message =
          'No camera hardware was detected on this device. Connect a webcam or use QR Image Upload / Touch Pad.';
      } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
        message =
          'Camera hardware is busy or locked by another application or browser tab. Close other video apps and re-run this check.';
      } else if (errorName === 'SecurityError') {
        message =
          'Camera blocked by browser security policy. Open the app in a top-level HTTPS tab to grant access.';
      }

      setCameraStatus('unavailable');
      setCameraError(message);
      setDiagReport({
        secureContext,
        mediaDevicesApi: true,
        permissionState:
          postPermState === 'unsupported' &&
          (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError')
            ? 'denied'
            : postPermState,
        deviceCount: cams.length,
        deviceLabels: cams.map((c) => c.label),
        streamCheck: 'failed',
        errorName,
        message,
        checkedAt,
      });
    } finally {
      setDiagLoading(false);
    }
  }, [
    attachStreamToVideo,
    queryCameraPermissionState,
    readEnumeratedVideoDevices,
    stopCameraStream,
  ]);

  // Start/stop camera automatically when camera/QR or Touch Pad Camera Preview is active
  useEffect(() => {
    if (mode === 'camera' || mode === 'qr' || (mode === 'touch' && touchPreviewOpen)) {
      if (streamRef.current) {
        setCameraStatus('active');
        void attachStreamToVideo(streamRef.current);
      } else {
        void startCamera();
      }
    } else {
      stopCameraStream();
      setCameraStatus('off');
    }
  }, [attachStreamToVideo, mode, startCamera, stopCameraStream, touchPreviewOpen]);

  // Clean up camera and timers only on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (qrLoopRef.current) window.clearInterval(qrLoopRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const handleToggleCamera = () => {
    if (cameraStatus === 'active' || cameraStatus === 'starting') {
      stopCameraStream();
      setCameraStatus('off');
      setCameraError(null);
    } else {
      void startCamera();
    }
  };

  const handleSwitchCamera = () => {
    if (videoDevices.length > 1) {
      const currIdx = videoDevices.findIndex((d) => d.deviceId === selectedDeviceId);
      const next = videoDevices[(currIdx + 1) % videoDevices.length];
      setSelectedDeviceId(next.deviceId);
      void startCamera(next.deviceId);
      return;
    }
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedDeviceId('');
    void startCamera('', nextFacing);
  };

  const handleQrPayloadMatch = useCallback(
    (rawPayload: string) => {
      const clean = rawPayload.trim();
      const { patient, parsedIdentifier } = resolvePatientFromQrText(clean, patients);
      if (patient) {
        setQrError(null);
        setQrUnmatchedPayload(null);
        setUnmatchedCode(null);
        setTraumaFailureNotice(null);
        onMatchFound(patient, 'qr');
        return true;
      }
      setQrUnmatchedPayload(clean);
      setQrError(
        `QR payload "${parsedIdentifier || clean}" is not registered in MedZex AI yet.`
      );
      return false;
    },
    [onMatchFound, patients]
  );

  // Live QR decoding loop using jsQR when mode === 'qr' and camera is active
  useEffect(() => {
    if (qrLoopRef.current) {
      window.clearInterval(qrLoopRef.current);
      qrLoopRef.current = null;
    }
    qrLockedRef.current = false;
    setQrScanFramesCount(0);

    if (mode !== 'qr' || cameraStatus !== 'active') {
      return;
    }

    qrLoopRef.current = window.setInterval(() => {
      if (qrLockedRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        return;
      }

      if (!qrCanvasRef.current) {
        qrCanvasRef.current = document.createElement('canvas');
      }
      const canvas = qrCanvasRef.current;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      setQrScanFramesCount((c) => c + 1);

      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code?.data) {
        qrLockedRef.current = true;
        const matched = handleQrPayloadMatch(code.data);
        if (!matched) {
          window.setTimeout(() => {
            qrLockedRef.current = false;
          }, 1600);
        }
      }
    }, 180);

    return () => {
      if (qrLoopRef.current) {
        window.clearInterval(qrLoopRef.current);
        qrLoopRef.current = null;
      }
    };
  }, [cameraStatus, handleQrPayloadMatch, mode]);

  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setQrError(null);
    setQrUnmatchedPayload(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setQrError('Unable to initialize image decoder context.');
          return;
        }
        ctx.drawImage(img, 0, 0, img.width, img.height);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (!decoded?.data) {
          setQrError(
            'No readable QR code was detected in the selected image. Ensure high contrast or enter the wristband code manually.'
          );
          return;
        }
        handleQrPayloadMatch(decoded.data);
      };
      img.onerror = () => {
        setQrError('Could not read the selected image file.');
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const completeScan = useCallback(
    (codeToCheck: string) => {
      setScanning(false);
      setProgress(100);

      if (codeToCheck === 'UNREGISTERED_TEST') {
        setUnmatchedCode(generateFingerprintCode('UNKN'));
        return;
      }

      const matched = patients.find((p) => p.fingerprintCode === codeToCheck);
      if (matched) {
        setUnmatchedCode(null);
        setTraumaFailureNotice(null);
        onMatchFound(matched, 'biometric');
      } else {
        setUnmatchedCode(codeToCheck || generateFingerprintCode('UNKN'));
      }
    },
    [onMatchFound, patients]
  );

  const runTimedScan = useCallback(
    (targetCode: string) => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      setUnmatchedCode(null);
      setTraumaFailureNotice(null);
      setScanning(true);
      setProgress(8);

      const started = Date.now();
      const durationMs = 1100;

      intervalRef.current = window.setInterval(() => {
        const elapsed = Date.now() - started;
        const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
        setProgress(pct);
        if (pct >= 100) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          completeScan(targetCode);
        }
      }, 45);
    },
    [completeScan]
  );

  const cancelTouchHold = () => {
    if (mode === 'touch' && scanning && progress < 100) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setScanning(false);
      setProgress(0);
    }
  };

  const triggerTraumaQrFallback = (reason?: string) => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setScanning(false);
    setProgress(0);
    setUnmatchedCode(null);
    setQrError(null);
    setQrUnmatchedPayload(null);
    setTraumaFailureNotice(
      reason ||
        'Fingerprint ridge capture failed due to physical trauma or severe abrasion. QR Wristband / Medical ID fallback is active.'
    );
    setMode('qr');
  };

  const handleEnrollFromQr = (rawPayload?: string | null) => {
    const clean = (rawPayload || '').trim();
    let mrnHint = generateMrn();
    let fpHint = generateFingerprintCode('QR');

    if (clean) {
      const upper = clean.toUpperCase();
      const mrnMatch = upper.match(/MRN-[0-9]{4,10}/);
      const fpMatch = upper.match(/FP-[A-Z0-9-]{4,32}/);
      if (mrnMatch) mrnHint = mrnMatch[0];
      if (fpMatch) fpHint = fpMatch[0];
    }
    onEnrollUnknown(fpHint, mrnHint);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Primary Focal Scanner Column */}
      <div className="lg:col-span-7 bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-7 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#0b1c30] tracking-tight">
              {mode === 'qr' ? 'QR Medical ID Fallback Scanner' : 'Emergency Biometric Scanner'}
            </h1>
            <p className="text-sm text-[#3f4850] mt-0.5">
              {mode === 'qr'
                ? 'Scan the patient’s emergency wristband QR code, upload a QR image, or enroll a new patient QR.'
                : 'Align unconscious patient’s index finger inside the optical reticle, hold sensor pad, or switch to QR fallback.'}
            </p>
          </div>

          <div className="inline-flex flex-wrap items-center p-1 rounded-full bg-[#eff4ff] border border-[#dce9ff] gap-0.5">
            <button
              type="button"
              onClick={() => setMode('camera')}
              className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'camera'
                  ? 'bg-[#0284C7] text-white shadow-xs'
                  : 'text-[#3f4850] hover:text-[#0b1c30]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              Camera
            </button>
            <button
              type="button"
              onClick={() => setMode('touch')}
              className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'touch'
                  ? 'bg-[#0284C7] text-white shadow-xs'
                  : 'text-[#3f4850] hover:text-[#0b1c30]'
              }`}
            >
              <Touchpad className="w-3.5 h-3.5" />
              Touch Pad
            </button>
            <button
              type="button"
              onClick={() => {
                setQrError(null);
                setQrUnmatchedPayload(null);
                setMode('qr');
              }}
              className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'qr'
                  ? 'bg-[#0A4572] text-white shadow-xs'
                  : 'text-[#0A4572] hover:bg-[#dce9ff]/60'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              QR Fallback
            </button>
          </div>
        </div>

        {/* Trauma Escalation Notice */}
        {traumaFailureNotice && (
          <div className="mb-4 p-3.5 rounded-2xl bg-[#FEF3C7] border border-[#F59E0B]/30 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
            <div className="text-xs text-[#0b1c30] leading-relaxed">
              <p className="font-bold text-[#92400E]">Biometric Bypass — QR Fallback Engaged</p>
              <p className="mt-0.5 text-[#3f4850]">{traumaFailureNotice}</p>
            </div>
          </div>
        )}

        {/* Unified Camera Viewport (Shared across Fingerprint Camera & QR Fallback Camera) */}
        {mode !== 'touch' ? (
          <div className="space-y-4">
            <div className="relative rounded-[1.5rem] overflow-hidden bg-[#0b1c30] aspect-[4/3] sm:aspect-[16/10] flex items-center justify-center border border-[#cbd5e1]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                      setVideoResolution({
                        width: videoRef.current.videoWidth,
                        height: videoRef.current.videoHeight,
                      });
                    }
                    void videoRef.current.play().catch(() => {});
                  }
                }}
                onPlaying={() => {
                  setVideoPlaying(true);
                  if (
                    videoRef.current &&
                    videoRef.current.videoWidth > 0 &&
                    videoRef.current.videoHeight > 0
                  ) {
                    setVideoResolution({
                      width: videoRef.current.videoWidth,
                      height: videoRef.current.videoHeight,
                    });
                  }
                }}
                className={`w-full h-full object-cover transition-opacity duration-200 ${
                  mirrorPreview ? '-scale-x-100' : ''
                } ${cameraStatus === 'active' ? 'opacity-100' : 'opacity-20'}`}
              />

              {/* Top Camera Preview Bar (Always interactive to Show/Turn Camera On, Mirror, or Switch Lens) */}
              <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2">
                <div className="px-3 py-1.5 rounded-full bg-[#0b1c30]/85 backdrop-blur-sm border border-white/15 text-white text-xs font-semibold flex items-center gap-2 tabular-nums">
                  <Camera
                    className={`w-3.5 h-3.5 ${
                      cameraStatus === 'active' || scanning ? 'text-[#4cd7f6]' : 'text-amber-300'
                    }`}
                  />
                  <span>
                    {cameraStatus === 'active'
                      ? mode === 'qr'
                        ? `Camera Preview · QR Scanning (${qrScanFramesCount})`
                        : scanning
                        ? `Camera Preview · Capturing (${progress}%)`
                        : videoPlaying
                        ? 'Camera Preview · Live Feed'
                        : 'Camera Preview · Active'
                      : scanning
                      ? `Camera Preview · Scanning (${progress}%)`
                      : cameraStatus === 'starting'
                      ? 'Starting Camera...'
                      : cameraStatus === 'off'
                      ? 'Camera Off'
                      : 'Camera Blocked / Unavailable'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {cameraStatus === 'active' && (
                    <>
                      <button
                        type="button"
                        aria-pressed={mirrorPreview}
                        onClick={() => setMirrorPreview((prev) => !prev)}
                        className={`min-h-[38px] px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                          mirrorPreview
                            ? 'bg-[#0284C7] text-white'
                            : 'bg-white/90 hover:bg-white text-[#0b1c30]'
                        }`}
                      >
                        <FlipHorizontal className="w-3.5 h-3.5" />
                        Mirror
                      </button>
                      <button
                        type="button"
                        onClick={handleSwitchCamera}
                        className="min-h-[38px] px-3 rounded-full bg-white/90 hover:bg-white text-[#0b1c30] text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <SwitchCamera className="w-3.5 h-3.5 text-[#0284C7]" />
                        Switch Camera
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleToggleCamera}
                    className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap shrink-0 ${
                      cameraStatus === 'active'
                        ? 'bg-[#0b1c30]/85 hover:bg-[#0b1c30] text-white border border-white/25'
                        : 'bg-[#0284C7] hover:bg-[#0369A1] text-white'
                    }`}
                  >
                    {cameraStatus === 'active' ? (
                      <>
                        <VideoOff className="w-3.5 h-3.5" />
                        Camera Off
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        Turn Camera On
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Optical Reticle & Unobstructed Camera Preview Overlay */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 pt-12 pb-14">
                {mode === 'qr' ? (
                  <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-3xl border-2 border-[#4cd7f6] bg-transparent flex items-center justify-center">
                    {cameraStatus !== 'active' && (
                      <QrCode className="w-16 h-16 text-white/65" />
                    )}
                    {cameraStatus === 'active' && (
                      <div className="absolute inset-x-3 top-3 bottom-3 overflow-hidden rounded-2xl">
                        <div className="w-full h-1 bg-[#4cd7f6] shadow-[0_0_16px_4px_rgba(76,215,246,0.7)] animate-scan-sweep" />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {(cameraStatus === 'active' || scanning) && (
                      <div className="mb-2 px-3 py-1 rounded-full bg-[#0b1c30]/80 backdrop-blur-sm border border-[#4cd7f6]/40 text-white text-[11px] font-semibold flex items-center gap-1.5">
                        <Crosshair className="w-3.5 h-3.5 text-[#4cd7f6]" />
                        <span>Camera Preview · Finger Alignment Target</span>
                      </div>
                    )}

                    <div
                      className={`relative w-40 h-52 sm:w-44 sm:h-56 rounded-[2rem] border transition-colors flex items-center justify-center bg-transparent ${
                        scanning
                          ? 'border-[#4cd7f6]'
                          : cameraStatus === 'active'
                          ? 'border-white/40 border-dashed'
                          : 'border-white/75 border-2'
                      }`}
                    >
                      {/* High-contrast corner alignment brackets for unobstructed finger positioning */}
                      <span
                        className={`absolute -top-0.5 -left-0.5 w-6 h-6 border-t-[3px] border-l-[3px] rounded-tl-[1.25rem] ${
                          scanning || cameraStatus === 'active'
                            ? 'border-[#4cd7f6]'
                            : 'border-white/85'
                        }`}
                      />
                      <span
                        className={`absolute -top-0.5 -right-0.5 w-6 h-6 border-t-[3px] border-r-[3px] rounded-tr-[1.25rem] ${
                          scanning || cameraStatus === 'active'
                            ? 'border-[#4cd7f6]'
                            : 'border-white/85'
                        }`}
                      />
                      <span
                        className={`absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-[3px] border-l-[3px] rounded-bl-[1.25rem] ${
                          scanning || cameraStatus === 'active'
                            ? 'border-[#4cd7f6]'
                            : 'border-white/85'
                        }`}
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-[3px] border-r-[3px] rounded-br-[1.25rem] ${
                          scanning || cameraStatus === 'active'
                            ? 'border-[#4cd7f6]'
                            : 'border-white/85'
                        }`}
                      />

                      {/* Center edge calibration ticks */}
                      <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-[#4cd7f6]/80 rounded-full" />
                      <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-[#4cd7f6]/80 rounded-full" />
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-0.5 w-2.5 bg-[#4cd7f6]/80 rounded-full" />
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-0.5 w-2.5 bg-[#4cd7f6]/80 rounded-full" />

                      {cameraStatus === 'active' || scanning ? (
                        <Crosshair className="w-6 h-6 text-[#4cd7f6]/60" />
                      ) : (
                        <Fingerprint className="w-20 h-20 text-white/75" />
                      )}

                      {scanning && (
                        <div className="absolute inset-x-3 top-4 bottom-4 overflow-hidden rounded-2xl">
                          <div className="w-full h-1 bg-[#4cd7f6] shadow-[0_0_16px_4px_rgba(76,215,246,0.7)] animate-scan-sweep" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Camera Preview Positioning Scrim */}
              <div className="absolute inset-x-0 bottom-0 z-10 px-4 pt-8 pb-3 bg-gradient-to-t from-[#0b1c30]/90 via-[#0b1c30]/55 to-transparent pointer-events-none flex flex-wrap items-end justify-between gap-2">
                <p className="text-xs font-medium text-white tabular-nums drop-shadow-xs">
                  {mode === 'qr'
                    ? cameraStatus === 'active'
                      ? 'Camera Preview · Hold wristband QR code steady inside square frame'
                      : 'Click "Turn Camera On" above, or upload a QR image below'
                    : scanning
                    ? `Camera Preview · Hold steady — extracting ridge minutiae (${progress}%)`
                    : cameraStatus === 'active'
                    ? 'Camera Preview · Position index finger pad inside brackets (4–6 cm from lens)'
                    : 'Click "Turn Camera On" above for live finger alignment preview'}
                </p>

                {cameraStatus === 'active' && videoResolution && (
                  <span className="text-[11px] font-mono text-white/85 tabular-nums">
                    {videoResolution.width}×{videoResolution.height}
                  </span>
                )}
              </div>

              {/* Prompt Button when Camera is Off or Unavailable */}
              {(cameraStatus === 'unavailable' || cameraStatus === 'off') && (
                <div className="absolute bottom-11 right-3 z-20">
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="min-h-[42px] px-4 rounded-full bg-white text-[#0b1c30] text-xs font-bold flex items-center gap-1.5 hover:bg-[#eff4ff] shadow-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#0284C7]" />
                    Show Camera On
                  </button>
                </div>
              )}
            </div>

            {/* Camera Hardware & Permission Diagnostic Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[#f8f9ff] border border-[#dce9ff]">
              <div className="text-xs text-[#3f4850] flex items-center gap-2 min-w-0">
                <Camera className="w-4 h-4 text-[#0284C7] shrink-0" />
                <span className="truncate tabular-nums">
                  {videoDevices.length > 0
                    ? `${videoDevices.length} camera input${videoDevices.length === 1 ? '' : 's'} detected`
                    : 'Camera permission & hardware readiness'}
                </span>
              </div>
              <button
                type="button"
                disabled={diagLoading}
                onClick={() => void runCameraPermissionDiagnostic()}
                className="min-h-[44px] px-4 rounded-full border border-[#0284C7]/35 bg-white hover:bg-[#eff4ff] text-[#0A4572] text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
              >
                {diagLoading ? (
                  <RefreshCw className="w-4 h-4 text-[#0284C7] animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-[#0284C7]" />
                )}
                {diagLoading ? 'Checking Permission...' : 'Check Camera Permission'}
              </button>
            </div>

            {cameraError && (
              <div className="p-3.5 rounded-2xl bg-[#FEF3C7] text-[#92400E] text-xs flex flex-wrap items-center justify-between gap-3">
                <span className="flex-1 min-w-[200px]">{cameraError}</span>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={diagLoading}
                    onClick={() => void runCameraPermissionDiagnostic()}
                    className="min-h-[38px] px-3.5 rounded-full bg-[#0A4572] hover:bg-[#083659] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Grant / Check Permission
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="min-h-[38px] px-3.5 rounded-full bg-[#D97706] text-white font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Retry Camera
                  </button>
                  {mode === 'camera' && (
                    <button
                      type="button"
                      onClick={() => setMode('touch')}
                      className="min-h-[38px] px-3 rounded-full border border-[#D97706]/40 font-semibold text-[#92400E] cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Touch Pad
                    </button>
                  )}
                </div>
              </div>
            )}

            {diagReport && (
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  diagReport.streamCheck === 'granted'
                    ? 'bg-[#DCFCE7]/45 border-[#15803D]/25'
                    : 'bg-[#FEE2E2]/45 border-[#DC2626]/25'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {diagReport.streamCheck === 'granted' ? (
                      <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="text-xs font-bold text-[#0b1c30]">
                        Camera Permission Diagnostic{' '}
                        <span className="font-normal text-[#3f4850] tabular-nums">
                          · {diagReport.checkedAt}
                        </span>
                      </p>
                      <p className="text-xs text-[#3f4850] mt-0.5 leading-relaxed">
                        {diagReport.message}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss camera diagnostic report"
                    onClick={() => setDiagReport(null)}
                    className="min-h-[36px] min-w-[36px] rounded-full hover:bg-black/5 flex items-center justify-center text-[#3f4850] cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-2.5 rounded-xl bg-white/90 border border-[#E2E8F0]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4850]">
                      Browser Permission
                    </p>
                    <p className="text-xs font-bold text-[#0b1c30] mt-0.5 capitalize">
                      {diagReport.permissionState}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/90 border border-[#E2E8F0]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4850]">
                      Live Stream
                    </p>
                    <p
                      className={`text-xs font-bold mt-0.5 ${
                        diagReport.streamCheck === 'granted'
                          ? 'text-[#15803D]'
                          : 'text-[#DC2626]'
                      }`}
                    >
                      {diagReport.streamCheck === 'granted'
                        ? 'Active'
                        : diagReport.errorName || 'Blocked'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/90 border border-[#E2E8F0]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4850]">
                      Secure Context
                    </p>
                    <p className="text-xs font-bold text-[#0b1c30] mt-0.5">
                      {diagReport.secureContext ? 'HTTPS Verified' : 'Insecure Origin'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/90 border border-[#E2E8F0]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4850]">
                      Video Inputs
                    </p>
                    <p className="text-xs font-bold text-[#0b1c30] mt-0.5 tabular-nums">
                      {diagReport.deviceCount} detected
                    </p>
                  </div>
                </div>

                {diagReport.deviceLabels.length > 0 && (
                  <p className="text-[11px] text-[#3f4850] font-mono truncate">
                    Devices: {diagReport.deviceLabels.join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* QR Upload, Manual Code & Add New Patient QR Controls */}
            {mode === 'qr' && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <div className="sm:col-span-4">
                    <input
                      ref={qrFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleQrImageUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => qrFileInputRef.current?.click()}
                      className="w-full min-h-[48px] px-4 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] border border-[#0284C7]/25 text-[#0A4572] text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-[#0284C7]" />
                      Upload QR Image
                    </button>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!qrInput.trim()) {
                        setQrError('Enter or scan a patient MRN or MEDZEX QR payload.');
                        return;
                      }
                      handleQrPayloadMatch(qrInput);
                    }}
                    className="sm:col-span-8 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                      placeholder="MEDZEX|MRN-409182|FP-... or MRN-409182"
                      aria-label="Enter or scan QR payload or MRN"
                      className="flex-1 min-w-0 h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-xs font-mono"
                    />
                    <button
                      type="submit"
                      className="min-h-[48px] px-5 rounded-full bg-[#0A4572] hover:bg-[#083659] text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Retrieve
                    </button>
                  </form>
                </div>

                {qrError && (
                  <div className="p-4 rounded-2xl bg-[#FEE2E2] border border-[#DC2626]/20 space-y-2.5">
                    <div className="flex items-start gap-2.5 text-xs font-medium text-[#93000a]">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{qrError}</span>
                    </div>
                    {qrUnmatchedPayload && (
                      <button
                        type="button"
                        onClick={() => handleEnrollFromQr(qrUnmatchedPayload)}
                        className="min-h-[40px] px-4 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add New Patient with This QR / MRN
                      </button>
                    )}
                  </div>
                )}

                <div className="p-3.5 rounded-2xl bg-[#f8f9ff] border border-[#dce9ff] flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[#3f4850]">
                    <p className="font-semibold text-[#0b1c30]">
                      New Unconscious Patient Without QR Wristband?
                    </p>
                    <p>Enroll a new patient record and auto-generate their emergency QR code.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEnrollFromQr()}
                    className="min-h-[42px] px-4 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-4 h-4" />
                    Add New Patient &amp; QR
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative rounded-[1.5rem] bg-[#eff4ff] border border-[#dce9ff] p-6 sm:p-10 flex flex-col items-center justify-center text-center">
            <div className="w-full flex items-center justify-end mb-4 sm:mb-0 sm:absolute sm:top-4 sm:right-4">
              <button
                type="button"
                aria-pressed={touchPreviewOpen}
                onClick={() => setTouchPreviewOpen((prev) => !prev)}
                className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  touchPreviewOpen
                    ? 'bg-[#0A4572] text-white'
                    : 'bg-white hover:bg-[#f0f9ff] text-[#0A4572] border border-[#0284C7]/30'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                {touchPreviewOpen ? 'Hide Camera Preview' : 'Camera Preview'}
              </button>
            </div>

            {touchPreviewOpen && (
              <div className="w-full max-w-[260px] mb-5 sm:mb-0 sm:absolute sm:top-16 sm:right-4 z-20 rounded-2xl overflow-hidden bg-[#0b1c30] border border-[#4cd7f6]/50 shadow-lg">
                <div className="px-3 py-1.5 bg-[#0b1c30]/95 text-white flex items-center justify-between gap-2 border-b border-white/10">
                  <span className="text-[11px] font-semibold flex items-center gap-1.5 truncate">
                    <Camera className="w-3 h-3 text-[#4cd7f6] shrink-0" />
                    Camera Preview
                  </span>
                  <button
                    type="button"
                    aria-label="Close camera preview overlay"
                    onClick={() => setTouchPreviewOpen(false)}
                    className="min-h-[36px] min-w-[36px] rounded-full hover:bg-white/10 flex items-center justify-center text-white/80 cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="relative aspect-[4/3] bg-[#0b1c30] flex items-center justify-center">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => {
                      if (videoRef.current) {
                        void videoRef.current.play().catch(() => {});
                      }
                    }}
                    onPlaying={() => setVideoPlaying(true)}
                    className={`w-full h-full object-cover ${
                      mirrorPreview ? '-scale-x-100' : ''
                    } ${cameraStatus === 'active' ? 'opacity-100' : 'opacity-25'}`}
                  />
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-3">
                    <div className="w-20 h-24 rounded-2xl border border-dashed border-[#4cd7f6]/80 flex items-center justify-center">
                      <Crosshair className="w-4 h-4 text-[#4cd7f6]/75" />
                    </div>
                  </div>
                  {cameraStatus === 'unavailable' && (
                    <button
                      type="button"
                      disabled={diagLoading}
                      onClick={() => void runCameraPermissionDiagnostic()}
                      className="absolute z-10 min-h-[36px] px-3 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-md cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Grant Camera
                    </button>
                  )}
                  <div className="absolute inset-x-0 bottom-0 px-2.5 py-1.5 bg-gradient-to-t from-[#0b1c30]/90 to-transparent pointer-events-none">
                    <p className="text-[10px] font-medium text-white text-center truncate tabular-nums">
                      {cameraStatus === 'active'
                        ? scanning
                          ? `Aligning finger · ${progress}%`
                          : 'Center finger over lens'
                        : cameraStatus === 'starting'
                        ? 'Initializing camera...'
                        : 'Camera unavailable'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onPointerDown={() => runTimedScan(selectedSampleCode)}
              onPointerUp={cancelTouchHold}
              onPointerLeave={cancelTouchHold}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  runTimedScan(selectedSampleCode);
                }
              }}
              aria-label="Hold finger on optical sensor pad to scan"
              className={`relative w-44 h-44 rounded-full flex flex-col items-center justify-center transition-all select-none cursor-pointer touch-none ${
                scanning
                  ? 'bg-[#0284C7] text-white scale-[0.97] shadow-[0_0_0_10px_rgba(2,132,199,0.18)]'
                  : 'bg-white text-[#0284C7] border-2 border-[#0284C7] hover:bg-[#f0f9ff] shadow-sm'
              }`}
            >
              <Fingerprint className="w-20 h-20 mb-1" />
              <span className="text-xs font-bold tabular-nums">
                {scanning ? `${progress}%` : 'HOLD SENSOR'}
              </span>
            </button>
            <p className="mt-4 text-sm font-medium text-[#0b1c30]">
              {scanning
                ? 'Capturing biometric ridge pattern...'
                : 'Press and hold sensor pad for 1.1 seconds'}
            </p>
            <p className="text-xs text-[#3f4850] mt-1">
              Works on any mobile touchscreen, tablet, or desktop pointer.
            </p>
          </div>
        )}

        {/* Primary Capture & Trauma Fallback Action Bar */}
        {mode !== 'qr' ? (
          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              disabled={scanning}
              onClick={() => runTimedScan(selectedSampleCode)}
              className="flex-1 min-h-[52px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Fingerprint className="w-5 h-5" />
              {scanning ? `Scanning Fingerprint (${progress}%)` : 'Capture & Match Fingerprint'}
            </button>

            <button
              type="button"
              onClick={() => triggerTraumaQrFallback()}
              className="min-h-[52px] px-5 rounded-full border-[1.5px] border-[#0A4572]/30 bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              Biometric Failed? Scan QR
            </button>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F1F5F9]">
            <p className="text-xs text-[#3f4850]">
              Secondary retrieval active for hand trauma, burns, or degraded biometric prints.
            </p>
            <button
              type="button"
              onClick={() => {
                setTraumaFailureNotice(null);
                setMode('camera');
              }}
              className="min-h-[42px] px-4 rounded-full border border-[#CBD5E1] hover:bg-[#eff4ff] text-xs font-semibold text-[#0b1c30] flex items-center gap-1.5 cursor-pointer"
            >
              <Fingerprint className="w-4 h-4 text-[#0284C7]" />
              Return to Fingerprint Scanner
            </button>
          </div>
        )}

        {/* Unmatched Biometric Alert (with direct QR Fallback escalation) */}
        {unmatchedCode && (
          <div className="mt-5 p-4 rounded-2xl bg-[#FEF3C7] border border-[#F59E0B]/30 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-[#0b1c30]">
                  Fingerprint Unmatched or Damaged
                </p>
                <p className="text-xs text-[#3f4850] mt-0.5">
                  Captured template{' '}
                  <span className="font-mono font-semibold tabular-nums">{unmatchedCode}</span>{' '}
                  could not be matched. If the patient has finger trauma or wears an emergency
                  wristband, switch to QR Fallback or enroll as a new patient.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  triggerTraumaQrFallback(
                    `Fingerprint read (${unmatchedCode}) failed to match. Switched to QR Medical ID fallback.`
                  )
                }
                className="min-h-[44px] px-4 rounded-full bg-[#0A4572] hover:bg-[#083659] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                Switch to QR Fallback
              </button>
              <button
                type="button"
                onClick={() => onEnrollUnknown(unmatchedCode)}
                className="min-h-[44px] px-5 rounded-full bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                Enroll Patient Now
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Simulated Finger Input & Emergency QR Wristband Profiles */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base sm:text-lg font-bold text-[#0b1c30]">
              {mode === 'qr'
                ? 'Patient Emergency QR Wristbands'
                : 'Optical Finger Simulation Profiles'}
            </h2>
            <button
              type="button"
              onClick={() => handleEnrollFromQr()}
              className="min-h-[36px] px-3 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add New
            </button>
          </div>
          <p className="text-xs text-[#3f4850] leading-relaxed mb-4">
            {mode === 'qr'
              ? 'Select a patient to view or download their scannable wristband QR code, or tap Scan QR to retrieve their record.'
              : 'Select which finger sample is presented to the camera or sensor pad, or tap Scan for an immediate emergency check.'}
          </p>

          <div className="space-y-2.5">
            {patients.map((patient) => {
              const isSelected =
                mode === 'qr'
                  ? previewPatient?.id === patient.id
                  : selectedSampleCode === patient.fingerprintCode;
              return (
                <div
                  key={patient.id}
                  className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-2.5 ${
                    isSelected
                      ? 'border-[#0284C7] bg-[#eff4ff]'
                      : 'border-[#E2E8F0] bg-white hover:bg-[#f8f9ff]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSampleCode(patient.fingerprintCode);
                      setQrPreviewPatientId(patient.id);
                    }}
                    className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <PatientAvatar src={patient.avatarUrl} name={patient.fullName} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#0b1c30] truncate">
                          {patient.fullName}
                        </p>
                        <span className="text-xs font-bold text-[#DC2626] tabular-nums shrink-0">
                          {patient.bloodType}
                        </span>
                      </div>
                      <p className="text-xs text-[#3f4850] font-mono tabular-nums truncate">
                        {patient.fingerprintCode} · {patient.mrn}
                      </p>
                    </div>
                  </button>

                  {mode === 'qr' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQrPreviewPatientId(patient.id);
                        handleQrPayloadMatch(encodePatientQrPayload(patient));
                      }}
                      className="min-h-[40px] px-3.5 rounded-full bg-[#0A4572] hover:bg-[#083659] text-white text-xs font-semibold shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scan QR
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSampleCode(patient.fingerprintCode);
                        setQrPreviewPatientId(patient.id);
                        runTimedScan(patient.fingerprintCode);
                      }}
                      className="min-h-[40px] px-3.5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold shrink-0 flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      Scan
                    </button>
                  )}
                </div>
              );
            })}

            {mode !== 'qr' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSampleCode('UNREGISTERED_TEST');
                    runTimedScan('UNREGISTERED_TEST');
                  }}
                  className={`w-full p-3.5 rounded-2xl border border-dashed text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    selectedSampleCode === 'UNREGISTERED_TEST'
                      ? 'border-[#D97706] bg-[#FEF3C7]/40'
                      : 'border-[#cbd5e1] hover:bg-[#f8f9ff]'
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0b1c30]">
                      Test Unknown / Unregistered Finger
                    </p>
                    <p className="text-xs text-[#3f4850]">
                      Simulates an unidentified patient with no prior biometric record
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#D97706] shrink-0">Simulate</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    triggerTraumaQrFallback(
                      'Simulated severe hand trauma / thermal abrasion preventing optical ridge capture. Switched to QR Medical ID fallback.'
                    )
                  }
                  className="w-full p-3.5 rounded-2xl border border-dashed border-[#0A4572]/35 bg-[#f8f9ff] hover:bg-[#eff4ff] text-left flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#0A4572]">
                      Simulate Physical Trauma (Escalate to QR)
                    </p>
                    <p className="text-xs text-[#3f4850]">
                      Demonstrates instant fallback when fingerprint ridges are unreadable
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#0A4572] shrink-0">QR Fallback</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Emergency QR Wristband Preview Card */}
        {previewPatient && qrDataUrl && (
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#0284C7]" />
                  Emergency Wristband QR Code
                </h3>
                <p className="text-xs text-[#3f4850] mt-0.5 tabular-nums">
                  {previewPatient.fullName} · {previewPatient.mrn} · Blood {previewPatient.bloodType}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="p-2.5 rounded-2xl border border-[#E2E8F0] bg-white shrink-0">
                <img
                  src={qrDataUrl}
                  alt={`Emergency QR code for ${previewPatient.fullName}`}
                  className="w-32 h-32 block"
                />
              </div>
              <div className="space-y-2.5 flex-1 w-full">
                <p className="text-xs text-[#3f4850] leading-relaxed">
                  Scan this QR code with the camera or download and upload it via{' '}
                  <span className="font-semibold text-[#0b1c30]">Upload QR Image</span> to verify
                  live decoding.
                </p>
                <p className="text-[11px] font-mono text-[#0A4572] break-all bg-[#f8f9ff] px-3 py-1.5 rounded-xl border border-[#E2E8F0]">
                  {encodePatientQrPayload(previewPatient)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={qrDataUrl}
                    download={`MedZex-QR-${previewPatient.mrn}.png`}
                    className="min-h-[40px] px-3.5 rounded-full border border-[#CBD5E1] hover:bg-[#eff4ff] text-xs font-semibold text-[#0b1c30] inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PNG
                  </a>
                  <button
                    type="button"
                    onClick={() => handleQrPayloadMatch(encodePatientQrPayload(previewPatient))}
                    className="min-h-[40px] px-3.5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Retrieve via QR
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

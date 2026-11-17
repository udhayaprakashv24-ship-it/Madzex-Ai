import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertOctagon,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardList,
  Droplets,
  FileClock,
  Fingerprint,
  Lock,
  Mail,
  PhoneCall,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Touchpad,
  Unlock,
  Upload,
  VideoOff,
} from 'lucide-react';
import { ADMIN_EMAIL, parseHistorySummary } from '../lib/adminConfig';
import type { ClinicalVaultDossier, DoctorBiometricLink, HistoryCategory } from '../types/clinical';
import { PatientAvatar } from './PatientAvatar';
import { SendGmailCopyModal } from './SendGmailCopyModal';

interface DoctorBiometricPortalProps {
  userEmail: string;
  doctorLinks: DoctorBiometricLink[];
  onVerifyBiometricLink: (link: DoctorBiometricLink) => Promise<void>;
  onLoadUnlockedDossier: (link: DoctorBiometricLink) => Promise<ClinicalVaultDossier | null>;
}

const CATEGORY_LABELS: Record<HistoryCategory, string> = {
  SURGERY: 'Surgery',
  HOSPITALIZATION: 'Hospitalization',
  LAB_REPORT: 'Lab Baseline',
  IMMUNIZATION: 'Immunization',
  TRAUMA_ER: 'Prior ER / Trauma',
  DIAGNOSIS: 'Diagnosis',
};

export function DoctorBiometricPortal({
  userEmail,
  doctorLinks,
  onVerifyBiometricLink,
  onLoadUnlockedDossier,
}: DoctorBiometricPortalProps) {
  const activeLinks = doctorLinks.filter((l) => l.status === 'ACTIVE');
  const [selectedLinkId, setSelectedLinkId] = useState<string>(
    () => activeLinks[0]?.id || ''
  );
  const [mode, setMode] = useState<'camera' | 'touch' | 'qr'>('touch');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [presentedPrint, setPresentedPrint] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [unlockedDossier, setUnlockedDossier] = useState<ClinicalVaultDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const qrLoopRef = useRef<number | null>(null);

  const selectedLink =
    activeLinks.find((l) => l.id === selectedLinkId) || activeLinks[0] || null;

  useEffect(() => {
    if (selectedLink && !presentedPrint) {
      setPresentedPrint(selectedLink.fingerprintCode);
    }
  }, [selectedLink, presentedPrint]);

  useEffect(() => {
    setUnlockedDossier(null);
    setScanError(null);
    if (selectedLink && selectedLink.biometricVerified) {
      setLoadingDossier(true);
      void onLoadUnlockedDossier(selectedLink)
        .then((dossier) => setUnlockedDossier(dossier))
        .catch((err) => {
          setScanError(
            err instanceof Error ? err.message : 'Unable to fetch unlocked patient dossier.'
          );
        })
        .finally(() => setLoadingDossier(false));
    }
  }, [onLoadUnlockedDossier, selectedLink]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraActive(false);
      setCameraError('Camera API unavailable in this browser. Use Touch Pad or QR image upload.');
      return;
    }
    setCameraError(null);
    stopCamera();

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (primaryErr) {
      const denied =
        primaryErr instanceof DOMException &&
        (primaryErr.name === 'NotAllowedError' || primaryErr.name === 'SecurityError');
      if (!denied) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (fallbackErr) {
          setCameraError(
            fallbackErr instanceof Error
              ? fallbackErr.message
              : 'No camera hardware detected or permission declined.'
          );
          setCameraActive(false);
          return;
        }
      } else {
        setCameraError('Camera permission denied. Allow camera access and click "Turn Camera On".');
        setCameraActive(false);
        return;
      }
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => {});
    }
    setCameraActive(true);
  }, [stopCamera]);

  useEffect(() => {
    if (mode === 'camera' || mode === 'qr') {
      if (streamRef.current && videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        void videoRef.current.play().catch(() => {});
        setCameraActive(true);
      } else {
        void startCamera();
      }
    } else {
      stopCamera();
    }
  }, [mode, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (qrLoopRef.current) window.clearInterval(qrLoopRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const unlockLinkWithVerification = useCallback(
    async (link: DoctorBiometricLink) => {
      setLoadingDossier(true);
      try {
        await onVerifyBiometricLink(link);
        const dossier = await onLoadUnlockedDossier({
          ...link,
          biometricVerified: true,
        });
        setUnlockedDossier(dossier);
      } catch (err) {
        setScanError(err instanceof Error ? err.message : 'Verification failed.');
      } finally {
        setLoadingDossier(false);
      }
    },
    [onLoadUnlockedDossier, onVerifyBiometricLink]
  );

  const handleQrDecodedForLink = useCallback(
    (rawText: string) => {
      if (!selectedLink) return false;
      const upper = rawText.trim().toUpperCase();
      const matchesLink =
        upper.includes(selectedLink.patientMrn.toUpperCase()) ||
        upper.includes(selectedLink.fingerprintCode.toUpperCase());
      if (!matchesLink) {
        setScanError(
          `QR code "${rawText.trim()}" does not match linked patient ${selectedLink.patientMrn}.`
        );
        return false;
      }
      setScanError(null);
      void unlockLinkWithVerification(selectedLink);
      return true;
    },
    [selectedLink, unlockLinkWithVerification]
  );

  useEffect(() => {
    if (qrLoopRef.current) {
      window.clearInterval(qrLoopRef.current);
      qrLoopRef.current = null;
    }
    if (mode !== 'qr' || !cameraActive || !selectedLink || selectedLink.biometricVerified) {
      return;
    }
    qrLoopRef.current = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;
      if (!qrCanvasRef.current) qrCanvasRef.current = document.createElement('canvas');
      const canvas = qrCanvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (code?.data) {
        if (handleQrDecodedForLink(code.data) && qrLoopRef.current) {
          window.clearInterval(qrLoopRef.current);
          qrLoopRef.current = null;
        }
      }
    }, 200);
    return () => {
      if (qrLoopRef.current) {
        window.clearInterval(qrLoopRef.current);
        qrLoopRef.current = null;
      }
    };
  }, [cameraActive, handleQrDecodedForLink, mode, selectedLink]);

  const handleQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (!decoded?.data) {
          setScanError('No QR code detected in the uploaded image.');
          return;
        }
        handleQrDecodedForLink(decoded.data);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleBiometricScan = () => {
    if (!selectedLink || scanning) return;
    if (timerRef.current) window.clearInterval(timerRef.current);

    setScanError(null);
    setScanning(true);
    setProgress(10);
    const start = Date.now();
    const duration = 1100;

    timerRef.current = window.setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / duration) * 100));
      setProgress(pct);
      if (pct >= 100) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setScanning(false);

        const cleanInput = presentedPrint.trim().toUpperCase();
        if (cleanInput !== selectedLink.fingerprintCode.toUpperCase()) {
          setScanError(
            `Biometric mismatch: captured signature (${cleanInput || 'EMPTY'}) does not match patient ${selectedLink.patientMrn}.`
          );
          return;
        }

        void (async () => {
          setLoadingDossier(true);
          try {
            await onVerifyBiometricLink(selectedLink);
            const dossier = await onLoadUnlockedDossier({
              ...selectedLink,
              biometricVerified: true,
            });
            setUnlockedDossier(dossier);
          } catch (err) {
            setScanError(
              err instanceof Error ? err.message : 'Biometric verification failed.'
            );
          } finally {
            setLoadingDossier(false);
          }
        })();
      }
    }, 45);
  };

  const parsedHistory = (unlockedDossier?.historySummaries || []).map(parseHistorySummary);

  return (
    <div className="space-y-6">
      {/* Restricted Doctor Banner */}
      <section className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center shrink-0">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#0A4572] mb-1">
                Doctor Biometric-to-Mail Gate
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0b1c30]">
                Signed in as {userEmail}
              </h1>
              <p className="text-sm text-[#3f4850] mt-1">
                Master patient details are private to Admin ({ADMIN_EMAIL}). To inspect a
                patient&apos;s dossier linked to your Gmail, verify the patient&apos;s biometric
                fingerprint below.
              </p>
            </div>
          </div>
          <span className="px-4 py-2 rounded-full bg-[#eff4ff] text-[#0A4572] text-xs font-bold tabular-nums shrink-0 self-start md:self-center">
            {activeLinks.length} Linked Patient{activeLinks.length === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      {activeLinks.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8 sm:p-12 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-[#0b1c30] mb-2">
            Restricted Clinical Vault — No Patient Biometric Linked
          </h2>
          <p className="text-sm text-[#3f4850] leading-relaxed">
            No patient biometric signatures are currently connected to{' '}
            <span className="font-mono font-semibold text-[#0b1c30]">{userEmail}</span>. Ask Admin (
            <span className="font-mono font-semibold text-[#0A4572]">{ADMIN_EMAIL}</span>) to
            connect a patient&apos;s biometric record to your Gmail ID.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Assigned Biometric Locks */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-3">
              <h2 className="text-base font-bold text-[#0b1c30]">
                Patients Linked to Your Mail
              </h2>
              {activeLinks.map((link) => {
                const isSelected = selectedLink?.id === link.id;
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => {
                      setSelectedLinkId(link.id);
                      setPresentedPrint(link.fingerprintCode);
                    }}
                    className={`w-full p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#0284C7] bg-[#eff4ff]'
                        : 'border-[#E2E8F0] hover:bg-[#f8f9ff]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#0A4572] tabular-nums">
                        {link.patientMrn}
                      </span>
                      {link.biometricVerified ? (
                        <span className="text-xs font-bold text-[#059669] flex items-center gap-1">
                          <Unlock className="w-3.5 h-3.5" />
                          Unlocked
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-[#D97706] flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" />
                          Scan Needed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#3f4850]">
                      Linked to <span className="font-mono">{link.doctorEmail}</span>
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Biometric Verification or Unlocked Patient Dossier */}
          <div className="lg:col-span-8">
            {selectedLink && !selectedLink.biometricVerified ? (
              <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-7 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-[#0b1c30]">
                      Scan Patient Biometric to Connect &amp; Unlock Dossier
                    </h2>
                    <p className="text-xs text-[#3f4850] mt-0.5">
                      Patient {selectedLink.patientMrn} requires live biometric fingerprint
                      confirmation before medical details are released to {userEmail}.
                    </p>
                  </div>
                  <div className="inline-flex flex-wrap p-1 rounded-full bg-[#eff4ff] border border-[#dce9ff] gap-0.5">
                    <button
                      type="button"
                      onClick={() => setMode('camera')}
                      className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                        mode === 'camera' ? 'bg-[#0284C7] text-white' : 'text-[#3f4850]'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('touch')}
                      className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                        mode === 'touch' ? 'bg-[#0284C7] text-white' : 'text-[#3f4850]'
                      }`}
                    >
                      <Touchpad className="w-3.5 h-3.5" />
                      Touch Pad
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('qr')}
                      className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                        mode === 'qr' ? 'bg-[#0A4572] text-white' : 'text-[#0A4572]'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      QR Fallback
                    </button>
                  </div>
                </div>

                {mode !== 'touch' ? (
                  <div className="space-y-3">
                    <div className="relative rounded-[1.5rem] overflow-hidden bg-[#0b1c30] aspect-[16/9] flex items-center justify-center border border-[#cbd5e1]">
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
                        className={`w-full h-full object-cover ${
                          cameraActive ? 'opacity-100' : 'opacity-20'
                        }`}
                      />
                      <div className="absolute top-3 right-3 z-10">
                        <button
                          type="button"
                          onClick={() => (cameraActive ? stopCamera() : void startCamera())}
                          className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                            cameraActive
                              ? 'bg-[#0b1c30]/85 text-white border border-white/25'
                              : 'bg-[#0284C7] text-white'
                          }`}
                        >
                          {cameraActive ? (
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
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        {mode === 'qr' ? (
                          <div className="w-44 h-44 rounded-3xl border-2 border-[#4cd7f6] flex items-center justify-center">
                            <QrCode className="w-16 h-16 text-white/75" />
                          </div>
                        ) : (
                          <Fingerprint
                            className={`w-24 h-24 ${
                              scanning ? 'text-[#4cd7f6]' : 'text-white/80'
                            }`}
                          />
                        )}
                        <span className="mt-3 px-4 py-1.5 rounded-full bg-[#0b1c30]/80 text-white text-xs font-semibold tabular-nums">
                          {mode === 'qr'
                            ? cameraActive
                              ? 'Point camera at patient wristband QR code'
                              : 'Click "Turn Camera On" or upload QR image below'
                            : scanning
                            ? `Verifying Biometric Signature... ${progress}%`
                            : cameraActive
                            ? 'Camera On · Place patient finger in reticle'
                            : 'Click "Turn Camera On" above'}
                        </span>
                      </div>
                    </div>

                    {cameraError && (
                      <p className="text-xs font-medium text-[#D97706]">{cameraError}</p>
                    )}

                    {mode === 'qr' && (
                      <div>
                        <input
                          ref={qrFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleQrFile}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => qrFileInputRef.current?.click()}
                          className="min-h-[44px] px-4 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                        >
                          <Upload className="w-4 h-4" />
                          Upload Wristband QR Image
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-[1.5rem] bg-[#eff4ff] border border-[#dce9ff] p-8 flex flex-col items-center justify-center text-center">
                    <button
                      type="button"
                      onClick={handleBiometricScan}
                      disabled={scanning}
                      className={`w-36 h-36 rounded-full flex flex-col items-center justify-center transition-all cursor-pointer ${
                        scanning
                          ? 'bg-[#0284C7] text-white shadow-[0_0_0_10px_rgba(2,132,199,0.18)]'
                          : 'bg-white text-[#0284C7] border-2 border-[#0284C7] hover:bg-[#f0f9ff]'
                      }`}
                    >
                      <Fingerprint className="w-16 h-16 mb-1" />
                      <span className="text-xs font-bold tabular-nums">
                        {scanning ? `${progress}%` : 'TAP TO SCAN'}
                      </span>
                    </button>
                    <p className="mt-3 text-xs font-medium text-[#3f4850]">
                      Optical finger sensor verifies patient print against your Gmail authorization
                    </p>
                  </div>
                )}

                <label className="block">
                  <span className="text-xs font-semibold text-[#3f4850]">
                    Captured Patient Biometric Code
                  </span>
                  <input
                    type="text"
                    value={presentedPrint}
                    onChange={(e) => setPresentedPrint(e.target.value)}
                    placeholder="FP-..."
                    className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] font-mono text-sm focus:border-[#0284C7] focus:outline-none"
                  />
                </label>

                {scanError && (
                  <div className="p-3.5 rounded-2xl bg-[#FEE2E2] text-[#93000a] text-xs font-medium">
                    {scanError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={scanning}
                  onClick={handleBiometricScan}
                  className="w-full min-h-[48px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Fingerprint className="w-5 h-5" />
                  {scanning ? `Verifying Biometric (${progress}%)...` : 'Verify Biometric & View Patient Details'}
                </button>
              </div>
            ) : loadingDossier ? (
              <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8 text-center">
                <RefreshCw className="w-6 h-6 text-[#0284C7] animate-spin mx-auto mb-2" />
                <p className="text-sm font-semibold text-[#0b1c30]">
                  Unlocking Biometric-Verified Patient Dossier...
                </p>
              </div>
            ) : unlockedDossier ? (
              <div className="space-y-5">
                <section className="rounded-[2rem] bg-[#FEE2E2] border border-[#DC2626]/25 p-5 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <PatientAvatar src="" name={unlockedDossier.fullName} size="lg" />
                      <div>
                        <p className="text-xs font-bold text-[#059669] flex items-center gap-1 mb-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Biometric Verified for {userEmail}
                        </p>
                        <h2 className="text-2xl font-bold text-[#0b1c30]">
                          {unlockedDossier.fullName}
                        </h2>
                        <p className="text-sm text-[#7F1D1D] font-medium tabular-nums">
                          {unlockedDossier.age} yrs · {unlockedDossier.sex} · {unlockedDossier.mrn} ·{' '}
                          {unlockedDossier.fingerprintCode}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 self-start">
                      <button
                        type="button"
                        onClick={() => setGmailModalOpen(true)}
                        className="min-h-[46px] px-4 rounded-full bg-white hover:bg-[#eff4ff] border border-[#0284C7]/30 text-[#0A4572] font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                      >
                        <Mail className="w-4 h-4 text-[#0284C7]" />
                        Send Copy to My Gmail
                      </button>
                      <div className="px-5 py-3 rounded-3xl bg-white border border-[#DC2626]/20 text-center">
                        <p className="text-[11px] font-bold uppercase text-[#93000a]">Blood Type</p>
                        <p className="text-2xl font-extrabold text-[#DC2626] tabular-nums flex items-center gap-1 justify-center">
                          <Droplets className="w-5 h-5" />
                          {unlockedDossier.bloodType}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-white/90 rounded-2xl p-4">
                      <p className="text-xs font-bold uppercase text-[#DC2626] flex items-center gap-1.5 mb-2">
                        <AlertOctagon className="w-4 h-4" />
                        Severe Allergies
                      </p>
                      {unlockedDossier.allergies.length > 0 ? (
                        <ul className="space-y-1 text-sm font-semibold text-[#0b1c30]">
                          {unlockedDossier.allergies.map((a, i) => (
                            <li key={i}>• {a}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-[#3f4850]">No known allergies recorded.</p>
                      )}
                    </div>

                    <div className="bg-white/90 rounded-2xl p-4">
                      <p className="text-xs font-bold uppercase text-[#DC2626] flex items-center gap-1.5 mb-2">
                        <AlertTriangle className="w-4 h-4" />
                        Critical Alerts
                      </p>
                      {unlockedDossier.criticalAlerts.length > 0 ? (
                        <ul className="space-y-1 text-sm font-semibold text-[#0b1c30]">
                          {unlockedDossier.criticalAlerts.map((f, i) => (
                            <li key={i}>• {f}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-[#3f4850]">No critical flags.</p>
                      )}
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-2 mb-2">
                        <ClipboardList className="w-4 h-4 text-[#0284C7]" />
                        Medications &amp; Conditions
                      </h3>
                      <ul className="space-y-1 text-xs text-[#0b1c30] mb-3">
                        {unlockedDossier.medications.map((m, i) => (
                          <li key={i}>• {m}</li>
                        ))}
                      </ul>
                      <ul className="space-y-1 text-xs text-[#3f4850]">
                        {unlockedDossier.conditions.map((c, i) => (
                          <li key={i}>• {c}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-3 border-t border-[#F1F5F9]">
                      <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-2 mb-1">
                        <PhoneCall className="w-4 h-4 text-[#0284C7]" />
                        Emergency Contact
                      </h3>
                      <p className="text-xs font-semibold text-[#0b1c30]">
                        {unlockedDossier.emergencyContactName} (
                        {unlockedDossier.emergencyContactRelation})
                      </p>
                      <p className="text-xs font-mono text-[#0A4572] tabular-nums">
                        {unlockedDossier.emergencyContactPhone}
                      </p>
                      <p className="text-xs text-[#3f4850] mt-2">
                        Code Status: {unlockedDossier.dnrStatus ? 'DNR' : 'Full Code'} · Organ
                        Donor: {unlockedDossier.organDonor ? 'Yes' : 'No'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5">
                    <h3 className="text-sm font-bold text-[#0b1c30] flex items-center gap-2 mb-3">
                      <FileClock className="w-4 h-4 text-[#0284C7]" />
                      Patient Historical Details
                    </h3>
                    {parsedHistory.length === 0 ? (
                      <p className="text-xs text-[#707881]">
                        No historical clinical events attached.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#F1F5F9]">
                        {parsedHistory.map((item, idx) => (
                          <div key={idx} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                            <p className="text-xs text-[#3f4850] tabular-nums">
                              <span className="font-mono font-semibold text-[#0A4572]">
                                {item.eventDate}
                              </span>{' '}
                              · <span className="font-semibold text-[#0284C7]">{CATEGORY_LABELS[item.category]}</span> ·{' '}
                              {item.facility}
                            </p>
                            <p className="text-xs font-bold text-[#0b1c30]">{item.title}</p>
                            {item.notes && (
                              <p className="text-xs text-[#3f4850] leading-relaxed">{item.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8 text-center">
                <p className="text-sm font-semibold text-[#0b1c30]">
                  {scanError || 'Select a linked patient above to unlock their clinical dossier.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {unlockedDossier && (
        <SendGmailCopyModal
          open={gmailModalOpen}
          onClose={() => setGmailModalOpen(false)}
          senderEmail={userEmail}
          defaultRecipient={userEmail}
          patient={{
            fullName: unlockedDossier.fullName,
            mrn: unlockedDossier.mrn,
            age: unlockedDossier.age,
            sex: unlockedDossier.sex,
            bloodType: unlockedDossier.bloodType,
            fingerprintCode: unlockedDossier.fingerprintCode,
            allergies: unlockedDossier.allergies,
            medications: unlockedDossier.medications,
            conditions: unlockedDossier.conditions,
            criticalAlerts: unlockedDossier.criticalAlerts,
            emergencyContactName: unlockedDossier.emergencyContactName,
            emergencyContactRelation: unlockedDossier.emergencyContactRelation,
            emergencyContactPhone: unlockedDossier.emergencyContactPhone,
            dnrStatus: unlockedDossier.dnrStatus,
            organDonor: unlockedDossier.organDonor,
            histories: parsedHistory,
            latestTriage: null,
          }}
        />
      )}
    </div>
  );
}

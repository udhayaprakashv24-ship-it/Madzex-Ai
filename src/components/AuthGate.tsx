import { useState } from 'react';
import { Fingerprint, ShieldCheck, Siren, Sparkles } from 'lucide-react';
import { signInWithGoogleWorkspace } from '../lib/firebase';

export function AuthGate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogleWorkspace();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in was cancelled or failed.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-10">
      <div className="max-w-5xl w-full mx-auto bg-white rounded-[2rem] border border-[#E2E8F0] shadow-[0_10px_15px_-3px_rgba(2,132,199,0.08)] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-6 relative min-h-[260px] lg:min-h-[540px] bg-[#0A4572]">
          <img
            src="/src/assets/images/er_clinical_banner_1794917009160.jpg"
            alt="Emergency department triage station"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1c30]/85 via-[#0A4572]/35 to-transparent flex flex-col justify-end p-6 sm:p-8 text-white">
            <p className="text-xs font-semibold tracking-wider uppercase text-[#93ccff] mb-2">
              Emergency Triage Network
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight text-balance">
              Zero-latency patient retrieval when every second counts.
            </h2>
          </div>
        </div>

        <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-2xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center">
                <Fingerprint className="w-6 h-6" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight text-[#0A4572]">MedZex AI</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#0b1c30] leading-tight mb-3 text-balance">
              MedZex AI Biometric Emergency Triage
            </h1>
            <p className="text-sm sm:text-base text-[#3f4850] leading-relaxed mb-6">
              Sign in with Google. Master patient records and historical clinical vaults are restricted to Admin, while authorized doctors unlock linked patients by scanning their biometric fingerprint.
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center shrink-0">
                  <Siren className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0b1c30]">Unconscious Critical Dossier</p>
                  <p className="text-xs text-[#3f4850]">
                    Immediate blood type, anaphylaxis warnings, active anticoagulants, and emergency contacts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0b1c30]">AI Emergency Triage Synthesis</p>
                  <p className="text-xs text-[#3f4850]">
                    Synthesizes historical surgeries, medications, and allergies with live field vitals.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#D1FAE5] text-[#059669] flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0b1c30]">Admin-Locked &amp; Biometric-to-Mail Sharing</p>
                  <p className="text-xs text-[#3f4850]">
                    Master database access is locked to Admin, with biometric-gated patient sharing for doctors.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            {error && (
              <div className="mb-4 p-3.5 rounded-2xl bg-[#FEE2E2] text-[#93000a] text-xs font-medium">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="w-full min-h-[52px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] active:scale-[0.99] text-white font-semibold text-sm sm:text-base transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer disabled:opacity-60"
            >
              <ShieldCheck className="w-5 h-5" />
              {loading ? 'Authenticating Google Account...' : 'Sign In with Google (Admin / Doctor)'}
            </button>
            <p className="mt-3 text-xs text-[#707881] text-center">
              Verified Google authentication required. Unauthorized accounts cannot browse patient records.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

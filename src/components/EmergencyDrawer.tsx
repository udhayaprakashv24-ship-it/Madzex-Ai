import { AlertTriangle, Droplets, Phone, ShieldAlert, X } from 'lucide-react';
import type { Patient } from '../types/clinical';
import { PatientAvatar } from './PatientAvatar';

interface EmergencyDrawerProps {
  open: boolean;
  onClose: () => void;
  patient: Patient | null;
  onOpenFullDossier: () => void;
  onNotifyContact: (patient: Patient) => Promise<void>;
  notifying: boolean;
}

export function EmergencyDrawer({
  open,
  onClose,
  patient,
  onOpenFullDossier,
  onNotifyContact,
  notifying,
}: EmergencyDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-start">
      <div
        className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[4px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Emergency Quick-Access Drawer"
        className="relative z-10 w-full max-w-2xl mx-auto bg-white rounded-b-[2rem] border-b border-x border-[#E2E8F0] shadow-[0_20px_25px_-5px_rgba(15,23,42,0.12)] p-5 sm:p-7"
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Emergency Critical Override</h2>
              <p className="text-xs text-[#3f4850]">Immediate zero-latency unconscious patient vitals & contacts</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close emergency drawer"
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#f8f9ff] hover:bg-[#e5eeff] text-[#0b1c30] flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!patient ? (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-[#0b1c30] mb-1">No Active Patient Scanned</p>
            <p className="text-xs text-[#3f4850]">
              Scan a patient fingerprint or select a record from the registry to populate emergency override data.
            </p>
          </div>
        ) : (
          <div className="pt-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <PatientAvatar src={patient.avatarUrl} name={patient.fullName} size="md" />
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-[#0b1c30] truncate">{patient.fullName}</h3>
                  <p className="text-xs text-[#3f4850] tabular-nums">
                    {patient.age} yrs · {patient.sex} · {patient.mrn}
                  </p>
                </div>
              </div>

              <div className="px-4 py-2 rounded-full bg-[#FEE2E2] text-[#DC2626] font-extrabold text-lg tabular-nums flex items-center gap-1.5 shrink-0">
                <Droplets className="w-4 h-4" />
                {patient.bloodType}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#FEE2E2]/70 border border-[#DC2626]/20">
              <div className="flex items-center gap-2 text-xs font-bold text-[#DC2626] uppercase tracking-wide mb-2">
                <AlertTriangle className="w-4 h-4" />
                Severe Allergies & Alerts
              </div>
              <ul className="space-y-1 text-sm font-semibold text-[#7F1D1D]">
                {patient.allergies.length > 0 ? (
                  patient.allergies.map((item, idx) => <li key={idx}>• {item}</li>)
                ) : (
                  <li>• No known drug allergies recorded</li>
                )}
                {patient.criticalAlerts.map((alert, idx) => (
                  <li key={`alert-${idx}`}>• {alert}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-2xl bg-[#eff4ff] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#3f4850]">Primary Emergency Contact</p>
                <p className="text-sm font-bold text-[#0b1c30]">
                  {patient.emergencyContactName} ({patient.emergencyContactRelation})
                </p>
                <p className="text-xs font-mono text-[#0A4572] tabular-nums">
                  {patient.emergencyContactPhone}
                </p>
              </div>
              <button
                type="button"
                disabled={notifying}
                onClick={() => void onNotifyContact(patient)}
                className="min-h-[44px] px-4 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <Phone className="w-3.5 h-3.5" />
                {notifying ? 'Logging Alert...' : 'Log Contact Notification'}
              </button>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullDossier();
                }}
                className="min-h-[48px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold cursor-pointer"
              >
                Open Full Emergency Triage Dossier
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

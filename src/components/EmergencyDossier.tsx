import { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Droplets,
  FileClock,
  HeartPulse,
  KeyRound,
  Mail,
  PhoneCall,
  Plus,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import type {
  AuditLog,
  HistoryCategory,
  LiveVitals,
  MedicalHistoryDraft,
  MedicalHistoryEntry,
  Patient,
  TriageAssessment,
} from '../types/clinical';
import { CLINICAL_CONSTRAINTS } from '../lib/seedPatients';
import { PatientAvatar } from './PatientAvatar';
import { SendGmailCopyModal } from './SendGmailCopyModal';

interface EmergencyDossierProps {
  patient: Patient | null;
  assessments: TriageAssessment[];
  auditLogs: AuditLog[];
  medicalHistories: MedicalHistoryEntry[];
  senderEmail: string;
  onRunAiTriage: (patient: Patient, vitals: LiveVitals) => Promise<void>;
  onNotifyContact: (patient: Patient) => Promise<void>;
  onAddHistory: (patientId: string, entry: MedicalHistoryDraft) => Promise<void>;
  onDeleteHistory: (historyId: string) => Promise<void>;
  onCreateDoctorLink: (
    patient: Patient,
    doctorName: string,
    doctorEmail: string
  ) => Promise<void>;
  onGmailCopySent?: (patient: Patient, recipientEmail: string) => Promise<void> | void;
  onGoToScanner: () => void;
  triageLoading: boolean;
  triageError: string | null;
  notifying: boolean;
}

const VITAL_PRESETS: Array<{ label: string; vitals: LiveVitals }> = [
  {
    label: 'Unresponsive / Syncope',
    vitals: {
      heartRate: 112,
      spo2: 91,
      bpSystolic: 88,
      bpDiastolic: 56,
      gcsScore: 6,
      chiefComplaint: 'Found unconscious on arrival; non-verbal, responsive only to painful stimuli.',
    },
  },
  {
    label: 'Anaphylaxis / Airway',
    vitals: {
      heartRate: 128,
      spo2: 86,
      bpSystolic: 78,
      bpDiastolic: 48,
      gcsScore: 8,
      chiefComplaint: 'Suspected severe allergic reaction with stridor, facial edema, and hypotension.',
    },
  },
  {
    label: 'Blunt Trauma / Bleed',
    vitals: {
      heartRate: 122,
      spo2: 93,
      bpSystolic: 84,
      bpDiastolic: 52,
      gcsScore: 7,
      chiefComplaint: 'Motor vehicle trauma with suspected head injury and active extremity bleeding.',
    },
  },
];

const CATEGORY_LABELS: Record<HistoryCategory, string> = {
  SURGERY: 'Surgery',
  HOSPITALIZATION: 'Hospitalization',
  LAB_REPORT: 'Lab Baseline',
  IMMUNIZATION: 'Immunization',
  TRAUMA_ER: 'Prior ER / Trauma',
  DIAGNOSIS: 'Diagnosis',
};

export function EmergencyDossier({
  patient,
  assessments,
  auditLogs,
  medicalHistories,
  senderEmail,
  onRunAiTriage,
  onNotifyContact,
  onAddHistory,
  onDeleteHistory,
  onCreateDoctorLink,
  onGmailCopySent,
  onGoToScanner,
  triageLoading,
  triageError,
  notifying,
}: EmergencyDossierProps) {
  const [vitals, setVitals] = useState<LiveVitals>(VITAL_PRESETS[0].vitals);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | HistoryCategory>('ALL');
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [historyFormError, setHistoryFormError] = useState<string | null>(null);
  const [doctorNameInput, setDoctorNameInput] = useState('');
  const [doctorEmailInput, setDoctorEmailInput] = useState('');
  const [linkingDoctor, setLinkingDoctor] = useState(false);
  const [doctorLinkMsg, setDoctorLinkMsg] = useState<string | null>(null);
  const [gmailModalOpen, setGmailModalOpen] = useState(false);
  const [newHistory, setNewHistory] = useState<MedicalHistoryDraft>({
    category: 'HOSPITALIZATION',
    eventDate: new Date().toISOString().slice(0, 10),
    title: '',
    facility: '',
    clinician: '',
    notes: '',
  });

  const allPatientHistories = useMemo(() => {
    if (!patient) return [];
    return medicalHistories
      .filter((h) => h.patientId === patient.id)
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [medicalHistories, patient]);

  const patientHistories = useMemo(() => {
    return allPatientHistories.filter(
      (h) => historyFilter === 'ALL' || h.category === historyFilter
    );
  }, [allPatientHistories, historyFilter]);

  if (!patient) {
    return (
      <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-8 sm:p-12 text-center max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-3xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center mx-auto mb-4">
          <Stethoscope className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#0b1c30] mb-2">No Active Unconscious Patient Selected</h2>
        <p className="text-sm text-[#3f4850] leading-relaxed mb-6">
          Scan a patient&apos;s fingerprint at the Biometric Scanner or select an enrolled patient from the Registry to pull up critical alerts and run AI emergency triage.
        </p>
        <button
          type="button"
          onClick={onGoToScanner}
          className="min-h-[48px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-sm cursor-pointer"
        >
          Go to Fingerprint Scanner
        </button>
      </div>
    );
  }

  const patientAssessments = assessments.filter((a) => a.patientId === patient.id);
  const latestAssessment = patientAssessments[0] || null;
  const patientAudits = auditLogs.filter((l) => l.patientId === patient.id).slice(0, 4);

  const esiBadgeStyle = (level: number) => {
    if (level <= 2) {
      return 'bg-[#FEE2E2] text-[#DC2626] border border-[#DC2626]/25';
    }
    if (level === 3) {
      return 'bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/25';
    }
    return 'bg-[#D1FAE5] text-[#059669] border border-[#059669]/25';
  };

  const handleCreateHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    setHistoryFormError(null);

    const title = newHistory.title.trim();
    const facility = newHistory.facility.trim();
    const clinician = newHistory.clinician.trim();
    const notes = newHistory.notes.trim();

    if (!CLINICAL_CONSTRAINTS.EVENT_DATE_REGEX.test(newHistory.eventDate)) {
      setHistoryFormError('Date must use YYYY-MM-DD format.');
      return;
    }
    if (title.length < 2 || title.length > CLINICAL_CONSTRAINTS.MAX_HISTORY_TITLE) {
      setHistoryFormError('Record title must be between 2 and 160 characters.');
      return;
    }
    if (facility.length < 2 || facility.length > CLINICAL_CONSTRAINTS.MAX_HISTORY_FACILITY) {
      setHistoryFormError('Facility name must be between 2 and 160 characters.');
      return;
    }
    if (notes.length < 1 || notes.length > CLINICAL_CONSTRAINTS.MAX_HISTORY_NOTES) {
      setHistoryFormError('Clinical notes are required (max 800 characters).');
      return;
    }

    setSavingHistory(true);
    try {
      await onAddHistory(patient.id, {
        category: newHistory.category,
        eventDate: newHistory.eventDate,
        title,
        facility,
        clinician: clinician.slice(0, CLINICAL_CONSTRAINTS.MAX_HISTORY_CLINICIAN),
        notes,
      });
      setNewHistory({
        category: 'HOSPITALIZATION',
        eventDate: new Date().toISOString().slice(0, 10),
        title: '',
        facility: '',
        clinician: '',
        notes: '',
      });
      setShowAddHistory(false);
    } catch (err) {
      setHistoryFormError(err instanceof Error ? err.message : 'Unable to save historical record.');
    } finally {
      setSavingHistory(false);
    }
  };

  const handleQuickDoctorConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setDoctorLinkMsg(null);
    const cleanName = doctorNameInput.trim();
    const cleanEmail = doctorEmailInput.trim().toLowerCase();
    if (cleanName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setDoctorLinkMsg('Enter a valid doctor name and Gmail ID.');
      return;
    }
    setLinkingDoctor(true);
    try {
      await onCreateDoctorLink(patient, cleanName, cleanEmail);
      setDoctorLinkMsg(`Connected biometric ${patient.fingerprintCode} to ${cleanEmail}.`);
      setDoctorNameInput('');
      setDoctorEmailInput('');
    } catch (err) {
      setDoctorLinkMsg(err instanceof Error ? err.message : 'Unable to connect doctor mail.');
    } finally {
      setLinkingDoctor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Critical Emergency Banner */}
      <section
        aria-label="Critical Medical Alerts"
        className="rounded-[2rem] bg-[#FEE2E2] border border-[#DC2626]/25 p-5 sm:p-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <PatientAvatar src={patient.avatarUrl} name={patient.fullName} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DC2626] text-white text-xs font-bold">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  UNCONSCIOUS EMERGENCY DOSSIER
                </span>
                {patient.dnrStatus && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#0b1c30] text-white text-xs font-bold">
                    DNR ON FILE
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#0b1c30] tracking-tight">
                {patient.fullName}
              </h1>
              <p className="text-sm text-[#7F1D1D] font-medium tabular-nums">
                {patient.age} yrs · {patient.sex} · {patient.mrn} · Print {patient.fingerprintCode}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start md:self-center">
            <button
              type="button"
              onClick={() => setGmailModalOpen(true)}
              className="min-h-[48px] px-5 rounded-full bg-white hover:bg-[#eff4ff] border border-[#0284C7]/30 text-[#0A4572] font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4 text-[#0284C7]" />
              Send Copy to Gmail
            </button>
            <div className="px-5 py-3 rounded-3xl bg-white border border-[#DC2626]/20 text-center shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#93000a]">Blood Type</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#DC2626] tabular-nums flex items-center justify-center gap-1">
                <Droplets className="w-5 h-5" />
                {patient.bloodType}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white/90 rounded-2xl p-4 border border-[#DC2626]/15">
            <p className="text-xs font-bold uppercase tracking-wider text-[#DC2626] flex items-center gap-1.5 mb-2">
              <AlertOctagon className="w-4 h-4" />
              Severe Allergies
            </p>
            {patient.allergies.length > 0 ? (
              <ul className="space-y-1 text-sm font-semibold text-[#0b1c30]">
                {patient.allergies.map((allergy, i) => (
                  <li key={i}>• {allergy}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#3f4850]">No known drug allergies recorded.</p>
            )}
          </div>

          <div className="bg-white/90 rounded-2xl p-4 border border-[#DC2626]/15">
            <p className="text-xs font-bold uppercase tracking-wider text-[#DC2626] flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-4 h-4" />
              Immediate Critical Flags
            </p>
            {patient.criticalAlerts.length > 0 ? (
              <ul className="space-y-1 text-sm font-semibold text-[#0b1c30]">
                {patient.criticalAlerts.map((flag, i) => (
                  <li key={i}>• {flag}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#3f4850]">No critical hardware or bleed flags.</p>
            )}
          </div>
        </div>
      </section>

      {/* Main Clinical Split: History + Field Vitals / AI Triage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Medications, Conditions, Emergency Contact & Audit */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-5">
            <div>
              <h2 className="text-base font-bold text-[#0b1c30] flex items-center gap-2 mb-2.5">
                <ClipboardList className="w-4 h-4 text-[#0284C7]" />
                Active Medications
              </h2>
              {patient.medications.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-[#0b1c30] divide-y divide-[#F1F5F9]">
                  {patient.medications.map((med, i) => (
                    <li key={i} className="pt-1.5 first:pt-0">
                      {med}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#3f4850]">None recorded</p>
              )}
            </div>

            <div className="pt-4 border-t border-[#F1F5F9]">
              <h2 className="text-base font-bold text-[#0b1c30] mb-2.5">Chronic Conditions</h2>
              {patient.conditions.length > 0 ? (
                <ul className="space-y-1.5 text-sm text-[#3f4850]">
                  {patient.conditions.map((cond, i) => (
                    <li key={i}>• {cond}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#3f4850]">None recorded</p>
              )}
              <div className="mt-3 text-xs text-[#3f4850] flex items-center gap-3">
                <span>Organ Donor: {patient.organDonor ? 'Yes' : 'No'}</span>
                <span aria-hidden="true">·</span>
                <span>Code Status: {patient.dnrStatus ? 'DNR' : 'Full Code'}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-[#F1F5F9]">
              <h2 className="text-base font-bold text-[#0b1c30] mb-2">Emergency Contact</h2>
              <p className="text-sm font-semibold text-[#0b1c30]">
                {patient.emergencyContactName} ({patient.emergencyContactRelation})
              </p>
              <p className="text-sm font-mono text-[#0A4572] tabular-nums mb-3">
                {patient.emergencyContactPhone}
              </p>
              <button
                type="button"
                disabled={notifying}
                onClick={() => void onNotifyContact(patient)}
                className="w-full min-h-[44px] px-4 rounded-full border border-[#0284C7] text-[#0284C7] hover:bg-[#0284C7]/10 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <PhoneCall className="w-4 h-4" />
                {notifying ? 'Dispatching Notification...' : 'Notify Emergency Contact & Log'}
              </button>
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
            <h2 className="text-sm font-bold text-[#0b1c30] mb-3">Recent Clinical Audit Trail</h2>
            {patientAudits.length === 0 ? (
              <p className="text-xs text-[#707881]">No audit events logged yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {patientAudits.map((log) => (
                  <li key={log.id} className="text-xs border-b border-[#F1F5F9] last:border-none pb-2 last:pb-0">
                    <p className="font-semibold text-[#0b1c30]">{log.summary}</p>
                    <p className="text-[#707881] tabular-nums mt-0.5">
                      {log.actionType === 'RECORD_UPDATED' &&
                      log.summary.startsWith('Sent clinical dossier copy via Gmail')
                        ? 'GMAIL COPY SENT (READ-ONLY)'
                        : log.actionType.replace(/_/g, ' ')}{' '}
                      ·{' '}
                      {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString() : 'Just now'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Connect Patient Biometric to Doctor Mail (Admin Quick Action) */}
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-3">
            <h2 className="text-sm font-bold text-[#0b1c30] flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#0284C7]" />
              Connect Patient Biometric to Doctor Mail
            </h2>
            <p className="text-xs text-[#3f4850] leading-relaxed">
              Authorize an external doctor&apos;s Gmail to unlock {patient.fullName}&apos;s details
              after scanning print <span className="font-mono font-semibold">{patient.fingerprintCode}</span>.
            </p>
            <form onSubmit={(e) => void handleQuickDoctorConnect(e)} className="space-y-2.5">
              <input
                type="text"
                required
                maxLength={120}
                value={doctorNameInput}
                onChange={(e) => setDoctorNameInput(e.target.value)}
                placeholder="Doctor Name (e.g., Dr. R. Sharma)"
                className="w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] text-xs focus:border-[#0284C7] focus:outline-none"
              />
              <input
                type="email"
                required
                maxLength={95}
                value={doctorEmailInput}
                onChange={(e) => setDoctorEmailInput(e.target.value)}
                placeholder="doctor.email@gmail.com"
                className="w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] text-xs font-mono focus:border-[#0284C7] focus:outline-none"
              />
              <button
                type="submit"
                disabled={linkingDoctor}
                className="w-full min-h-[44px] px-4 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {linkingDoctor ? 'Connecting Mail...' : 'Connect Biometric to Doctor Mail'}
              </button>
            </form>
            {doctorLinkMsg && (
              <p className="text-xs font-medium text-[#0A4572]">{doctorLinkMsg}</p>
            )}
          </div>
        </div>

        {/* Right: Field Vitals Input, AI Triage & Database Medical History */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#0b1c30] flex items-center gap-2">
                  <HeartPulse className="w-5 h-5 text-[#0284C7]" />
                  Live Field Vitals & AI Triage
                </h2>
                <p className="text-xs text-[#3f4850] mt-0.5">
                  Synthesizes active meds, allergies, and historical records with live vitals.
                </p>
              </div>
            </div>

            {/* Scenario Preset Buttons */}
            <div className="flex flex-wrap gap-2 mb-5">
              {VITAL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setVitals(preset.vitals)}
                  className="min-h-[36px] px-3.5 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Numeric Vitals Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">HR (bpm)</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={vitals.heartRate}
                  onChange={(e) => setVitals({ ...vitals, heartRate: Number(e.target.value) })}
                  className="mt-1 w-full h-12 px-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none font-mono font-semibold text-sm tabular-nums"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">SpO2 (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={vitals.spo2}
                  onChange={(e) => setVitals({ ...vitals, spo2: Number(e.target.value) })}
                  className="mt-1 w-full h-12 px-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none font-mono font-semibold text-sm tabular-nums"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Systolic BP</span>
                <input
                  type="number"
                  min={0}
                  max={320}
                  value={vitals.bpSystolic}
                  onChange={(e) => setVitals({ ...vitals, bpSystolic: Number(e.target.value) })}
                  className="mt-1 w-full h-12 px-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none font-mono font-semibold text-sm tabular-nums"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Diastolic BP</span>
                <input
                  type="number"
                  min={0}
                  max={220}
                  value={vitals.bpDiastolic}
                  onChange={(e) => setVitals({ ...vitals, bpDiastolic: Number(e.target.value) })}
                  className="mt-1 w-full h-12 px-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none font-mono font-semibold text-sm tabular-nums"
                />
              </label>

              <label className="block col-span-2 sm:col-span-1">
                <span className="text-xs font-semibold text-[#3f4850]">GCS (3–15)</span>
                <input
                  type="number"
                  min={3}
                  max={15}
                  value={vitals.gcsScore}
                  onChange={(e) =>
                    setVitals({ ...vitals, gcsScore: Math.min(15, Math.max(3, Number(e.target.value) || 3)) })
                  }
                  className="mt-1 w-full h-12 px-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none font-mono font-semibold text-sm tabular-nums"
                />
              </label>
            </div>

            <label className="block mb-4">
              <span className="text-xs font-semibold text-[#3f4850]">Field Presentation / Trauma Note</span>
              <textarea
                rows={2}
                maxLength={500}
                value={vitals.chiefComplaint}
                onChange={(e) => setVitals({ ...vitals, chiefComplaint: e.target.value })}
                className="mt-1 w-full p-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
                placeholder="Describe unconscious state, mechanism of injury, or observed symptoms..."
              />
            </label>

            {triageError && (
              <div className="mb-4 p-3.5 rounded-2xl bg-[#FEE2E2] text-[#93000a] text-xs font-medium">
                {triageError}
              </div>
            )}

            <button
              type="button"
              disabled={triageLoading || !vitals.chiefComplaint.trim()}
              onClick={() => void onRunAiTriage(patient, vitals)}
              className="w-full min-h-[48px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              {triageLoading ? 'Synthesizing AI Emergency Triage...' : 'Generate AI Emergency Triage Brief'}
            </button>
          </div>

          {/* Latest AI Triage Output */}
          {triageLoading ? (
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-6 space-y-3 animate-pulse">
              <div className="h-5 w-44 bg-[#e5eeff] rounded-full" />
              <div className="h-4 w-full bg-[#eff4ff] rounded-full" />
              <div className="h-4 w-5/6 bg-[#eff4ff] rounded-full" />
            </div>
          ) : latestAssessment ? (
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Activity className="w-5 h-5 text-[#0284C7]" />
                  <h3 className="text-lg font-bold text-[#0b1c30]">AI Triage Handoff Summary</h3>
                </div>
                <span
                  className={`px-3.5 py-1 rounded-full text-xs font-bold tabular-nums ${esiBadgeStyle(
                    latestAssessment.esiLevel
                  )}`}
                >
                  ESI LEVEL {latestAssessment.esiLevel}
                </span>
              </div>

              <p className="text-sm text-[#0b1c30] leading-relaxed">{latestAssessment.clinicalSynopsis}</p>

              {latestAssessment.contraindications.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#FEE2E2]/80 border border-[#DC2626]/20">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#DC2626] mb-1.5">
                    Contraindicated Medications & Procedures
                  </p>
                  <ul className="space-y-1 text-sm font-semibold text-[#7F1D1D]">
                    {latestAssessment.contraindications.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-[#eff4ff]">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0A4572] mb-2">
                  Prioritized Stabilization Protocol
                </p>
                <ul className="space-y-2 text-sm text-[#0b1c30]">
                  {latestAssessment.immediateActions.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="text-xs text-[#707881] tabular-nums flex flex-wrap gap-2 pt-1">
                <span>HR {latestAssessment.heartRate} bpm</span>
                <span aria-hidden="true">·</span>
                <span>SpO2 {latestAssessment.spo2}%</span>
                <span aria-hidden="true">·</span>
                <span>
                  BP {latestAssessment.bpSystolic}/{latestAssessment.bpDiastolic}
                </span>
                <span aria-hidden="true">·</span>
                <span>GCS {latestAssessment.gcsScore}/15</span>
              </div>
            </div>
          ) : null}

          {/* Patient Historical Clinical Details (Cloud Firestore) */}
          <section
            aria-label="Patient Historical Clinical Records"
            className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileClock className="w-5 h-5 text-[#0284C7]" />
                <div>
                  <h3 className="text-lg font-bold text-[#0b1c30]">Patient Historical Details</h3>
                  <p className="text-xs text-[#3f4850]">
                    Surgeries, hospitalizations, baseline lab reports, and prior ER visits
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddHistory((prev) => !prev)}
                className="min-h-[40px] px-4 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {showAddHistory ? 'Cancel' : 'Add Historical Record'}
              </button>
            </div>

            {showAddHistory && (
              <form
                onSubmit={(e) => void handleCreateHistory(e)}
                className="p-4 rounded-2xl bg-[#f8f9ff] border border-[#dce9ff] space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-[#3f4850]">Record Category</span>
                    <select
                      value={newHistory.category}
                      onChange={(e) =>
                        setNewHistory({ ...newHistory, category: e.target.value as HistoryCategory })
                      }
                      className="mt-1 w-full h-11 px-3.5 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs font-semibold focus:border-[#0284C7] focus:outline-none"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-[#3f4850]">Event Date</span>
                    <input
                      type="date"
                      required
                      value={newHistory.eventDate}
                      onChange={(e) => setNewHistory({ ...newHistory, eventDate: e.target.value })}
                      className="mt-1 w-full h-11 px-3.5 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs font-mono tabular-nums focus:border-[#0284C7] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-[#3f4850]">Procedure / Event Title</span>
                  <input
                    type="text"
                    required
                    maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_TITLE}
                    value={newHistory.title}
                    onChange={(e) => setNewHistory({ ...newHistory, title: e.target.value })}
                    placeholder="e.g., Appendectomy / ICU Admission for Sepsis"
                    className="mt-1 w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-[#3f4850]">Hospital / Facility</span>
                    <input
                      type="text"
                      required
                      maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_FACILITY}
                      value={newHistory.facility}
                      onChange={(e) => setNewHistory({ ...newHistory, facility: e.target.value })}
                      placeholder="e.g., City General Hospital"
                      className="mt-1 w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-[#3f4850]">Attending Clinician</span>
                    <input
                      type="text"
                      maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_CLINICIAN}
                      value={newHistory.clinician}
                      onChange={(e) => setNewHistory({ ...newHistory, clinician: e.target.value })}
                      placeholder="e.g., Dr. R. Patel, MD"
                      className="mt-1 w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-[#3f4850]">Clinical Summary & Notes</span>
                  <textarea
                    rows={2}
                    required
                    maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_NOTES}
                    value={newHistory.notes}
                    onChange={(e) => setNewHistory({ ...newHistory, notes: e.target.value })}
                    placeholder="Key findings, anesthesia reactions, discharge meds, or baseline values..."
                    className="mt-1 w-full p-3 rounded-2xl border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
                  />
                </label>

                {historyFormError && (
                  <p className="text-xs font-semibold text-[#DC2626]">{historyFormError}</p>
                )}

                <button
                  type="submit"
                  disabled={savingHistory}
                  className="min-h-[44px] px-5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingHistory ? 'Saving to Database...' : 'Save Historical Record'}
                </button>
              </form>
            )}

            {/* Category Filter Buttons */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'All Records' },
                  { id: 'SURGERY', label: 'Surgeries' },
                  { id: 'HOSPITALIZATION', label: 'Hospitalizations' },
                  { id: 'LAB_REPORT', label: 'Labs' },
                  { id: 'TRAUMA_ER', label: 'Prior ER' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setHistoryFilter(chip.id)}
                  className={`min-h-[34px] px-3 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    historyFilter === chip.id
                      ? 'bg-[#0284C7] text-white'
                      : 'bg-[#eff4ff] text-[#3f4850] hover:bg-[#dce9ff]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {patientHistories.length === 0 ? (
              <p className="text-xs text-[#707881] py-2">
                No historical records match this filter for {patient.fullName}.
              </p>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {patientHistories.map((entry) => (
                  <article key={entry.id} className="py-3.5 first:pt-1 last:pb-0 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#3f4850]">
                        <span className="font-mono font-semibold text-[#0A4572] tabular-nums">
                          {entry.eventDate}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#0284C7]">
                          {CATEGORY_LABELS[entry.category]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{entry.facility}</span>
                      </div>
                      <h4 className="text-sm font-bold text-[#0b1c30]">{entry.title}</h4>
                      <p className="text-xs text-[#3f4850] leading-relaxed">{entry.notes}</p>
                      {entry.clinician && (
                        <p className="text-[11px] text-[#707881]">Attending: {entry.clinician}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void onDeleteHistory(entry.id)}
                      aria-label={`Delete historical entry ${entry.title}`}
                      className="min-h-[36px] min-w-[36px] rounded-full text-[#707881] hover:bg-[#FEE2E2] hover:text-[#DC2626] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <SendGmailCopyModal
        open={gmailModalOpen}
        onClose={() => setGmailModalOpen(false)}
        senderEmail={senderEmail}
        defaultRecipient={senderEmail}
        patient={{
          fullName: patient.fullName,
          mrn: patient.mrn,
          age: patient.age,
          sex: patient.sex,
          bloodType: patient.bloodType,
          fingerprintCode: patient.fingerprintCode,
          allergies: patient.allergies,
          medications: patient.medications,
          conditions: patient.conditions,
          criticalAlerts: patient.criticalAlerts,
          emergencyContactName: patient.emergencyContactName,
          emergencyContactRelation: patient.emergencyContactRelation,
          emergencyContactPhone: patient.emergencyContactPhone,
          dnrStatus: patient.dnrStatus,
          organDonor: patient.organDonor,
          histories: allPatientHistories.map(
            ({ category, eventDate, title, facility, clinician, notes }) => ({
              category,
              eventDate,
              title,
              facility,
              clinician,
              notes,
            })
          ),
          latestTriage: latestAssessment,
        }}
        onSent={(recipientEmail) => onGmailCopySent?.(patient, recipientEmail)}
      />
    </div>
  );
}

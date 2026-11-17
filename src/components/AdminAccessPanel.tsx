import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Database,
  Fingerprint,
  History,
  KeyRound,
  Lock,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { ADMIN_EMAIL } from '../lib/adminConfig';
import type { AuditLog, DoctorBiometricLink, Patient } from '../types/clinical';

interface AdminAccessPanelProps {
  adminEmail: string;
  patients: Patient[];
  doctorLinks: DoctorBiometricLink[];
  auditLogs: AuditLog[];
  onCreateDoctorLink: (
    patient: Patient,
    doctorName: string,
    doctorEmail: string
  ) => Promise<void>;
  onToggleLinkStatus: (link: DoctorBiometricLink) => Promise<void>;
  onResetBiometricVerification: (link: DoctorBiometricLink) => Promise<void>;
  onDeleteDoctorLink: (link: DoctorBiometricLink) => Promise<void>;
}

type AdminSubTab = 'access' | 'history';
type ActorFilter = 'ALL' | 'ADMIN' | 'DOCTOR';

interface BiometricMatchRow {
  id: string;
  timestampMs: number;
  dateLabel: string;
  timeLabel: string;
  actorName: string;
  actorEmail: string;
  actorRole: 'ADMIN' | 'DOCTOR';
  patientName: string;
  patientMrn: string;
  bloodType: string;
  fingerprintCode: string;
  summary: string;
}

const STORAGE_COLLECTIONS = [
  {
    name: 'patients',
    access: 'Admin Master Read/Write · Biometric-Verified Doctor Single-Get',
    contents:
      'Patient demographics, blood type, allergies, active medications, chronic conditions, critical alerts, DNR/organ donor directives, emergency contacts, and fingerprint signature (FP-...).',
  },
  {
    name: 'medicalHistories',
    access: 'Admin Only',
    contents:
      'Persistent clinical timeline records: past surgeries, ICU/hospital admissions, baseline lab reports, immunizations, and prior trauma/ER visits.',
  },
  {
    name: 'triageAssessments',
    access: 'Admin Only',
    contents:
      'Gemini AI emergency triage evaluations including ESI level (1–5), clinical synopsis, contraindications, stabilization protocol, and field vitals.',
  },
  {
    name: 'auditLogs',
    access: 'Admin Read · Actor-Attributed Accountability Trail',
    contents:
      'Immutable record of who scanned which patient fingerprint and when (both Admin emergency scans and Doctor biometric-to-mail verifications), plus enrollment and notification events.',
  },
  {
    name: 'doctorBiometricLinks + vault/clinicalDossier',
    access: 'Admin Managed · Doctor Biometric Gate',
    contents:
      'Links a patient fingerprint signature to an authorized doctor Gmail ID. The nested clinicalDossier vault stays locked until the doctor verifies the patient biometric scan.',
  },
] as const;

export function AdminAccessPanel({
  adminEmail,
  patients,
  doctorLinks,
  auditLogs,
  onCreateDoctorLink,
  onToggleLinkStatus,
  onResetBiometricVerification,
  onDeleteDoctorLink,
}: AdminAccessPanelProps) {
  const [subTab, setSubTab] = useState<AdminSubTab>('access');
  const [historySearch, setHistorySearch] = useState('');
  const [actorFilter, setActorFilter] = useState<ActorFilter>('ALL');

  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    () => patients[0]?.id || ''
  );
  const [doctorName, setDoctorName] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedMailto, setLastCreatedMailto] = useState<{
    email: string;
    patientName: string;
    fingerprintCode: string;
    mrn: string;
  } | null>(null);

  const activePatient =
    patients.find((p) => p.id === selectedPatientId) || patients[0] || null;

  const matchRows = useMemo<BiometricMatchRow[]>(() => {
    const patientMap = new Map(patients.map((p) => [p.id, p]));
    const rows: BiometricMatchRow[] = [];

    const formatTimestamp = (ts?: { toDate?: () => Date; toMillis?: () => number } | null) => {
      if (!ts || typeof ts.toDate !== 'function') {
        const now = new Date();
        return {
          ms: now.getTime(),
          dateLabel: now.toISOString().slice(0, 10),
          timeLabel: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
      }
      const d = ts.toDate();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return {
        ms: d.getTime(),
        dateLabel: `${yyyy}-${mm}-${dd}`,
        timeLabel: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    };

    const loggedDoctorVerifications = new Set<string>();

    auditLogs.forEach((log) => {
      if (log.actionType !== 'SCAN_MATCH' && log.actionType !== 'DOCTOR_BIOMETRIC_MATCH') {
        return;
      }
      const patient = patientMap.get(log.patientId);
      const { ms, dateLabel, timeLabel } = formatTimestamp(log.createdAt);
      const isDoctor = log.actionType === 'DOCTOR_BIOMETRIC_MATCH' || log.actorRole === 'DOCTOR';
      const actorEmail = (log.actorEmail || (isDoctor ? 'doctor@medzex.local' : adminEmail)).toLowerCase();
      const actorName = log.actorName || (isDoctor ? 'Authorized Doctor' : 'MedZex Admin');

      if (isDoctor) {
        loggedDoctorVerifications.add(`${log.patientId}__${actorEmail}`);
      }

      rows.push({
        id: log.id,
        timestampMs: ms,
        dateLabel,
        timeLabel,
        actorName,
        actorEmail,
        actorRole: isDoctor ? 'DOCTOR' : 'ADMIN',
        patientName: patient?.fullName || 'Removed Patient Record',
        patientMrn: patient?.mrn || 'MRN-RECORD',
        bloodType: patient?.bloodType || '—',
        fingerprintCode: log.fingerprintCode || patient?.fingerprintCode || 'FP-VERIFIED',
        summary: log.summary,
      });
    });

    // Include any doctor biometric verifications completed prior to audit-log expansion
    doctorLinks.forEach((link) => {
      if (!link.biometricVerified) return;
      const key = `${link.patientId}__${link.doctorEmail.toLowerCase()}`;
      if (loggedDoctorVerifications.has(key)) return;

      const patient = patientMap.get(link.patientId);
      const { ms, dateLabel, timeLabel } = formatTimestamp(link.updatedAt);
      rows.push({
        id: `link-${link.id}`,
        timestampMs: ms,
        dateLabel,
        timeLabel,
        actorName: link.doctorName,
        actorEmail: link.doctorEmail,
        actorRole: 'DOCTOR',
        patientName: patient?.fullName || link.patientMrn,
        patientMrn: patient?.mrn || link.patientMrn,
        bloodType: patient?.bloodType || '—',
        fingerprintCode: link.fingerprintCode,
        summary: `Doctor biometric verification unlocked ${link.patientMrn}.`,
      });
    });

    return rows.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [adminEmail, auditLogs, doctorLinks, patients]);

  const filteredMatches = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return matchRows.filter((row) => {
      if (actorFilter !== 'ALL' && row.actorRole !== actorFilter) return false;
      if (!q) return true;
      return (
        row.patientName.toLowerCase().includes(q) ||
        row.patientMrn.toLowerCase().includes(q) ||
        row.fingerprintCode.toLowerCase().includes(q) ||
        row.actorName.toLowerCase().includes(q) ||
        row.actorEmail.toLowerCase().includes(q)
      );
    });
  }, [actorFilter, historySearch, matchRows]);

  const historyStats = useMemo(() => {
    const adminCount = matchRows.filter((r) => r.actorRole === 'ADMIN').length;
    const doctorCount = matchRows.filter((r) => r.actorRole === 'DOCTOR').length;
    const uniquePatients = new Set(matchRows.map((r) => r.patientMrn)).size;
    return {
      total: matchRows.length,
      adminCount,
      doctorCount,
      uniquePatients,
    };
  }, [matchRows]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!activePatient) {
      setError('Enroll at least one patient before creating a doctor biometric link.');
      return;
    }

    const cleanName = doctorName.trim();
    const cleanEmail = doctorEmail.trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 120) {
      setError('Doctor name must be between 2 and 120 characters.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 95) {
      setError('Enter a valid Gmail / email address (max 95 characters).');
      return;
    }
    if (cleanEmail === ADMIN_EMAIL) {
      setError('Admin already holds full access to all patient records.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateDoctorLink(activePatient, cleanName, cleanEmail);
      setLastCreatedMailto({
        email: cleanEmail,
        patientName: activePatient.fullName,
        fingerprintCode: activePatient.fingerprintCode,
        mrn: activePatient.mrn,
      });
      setDoctorName('');
      setDoctorEmail('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to connect doctor mail to biometric record.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Authority Banner + Sub-Tab Navigation */}
      <section className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-7 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="px-3 py-1 rounded-full bg-[#0A4572] text-white text-xs font-bold">
                  MASTER ADMIN VAULT
                </span>
                <span className="text-xs font-semibold text-[#059669] flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Private Owner Access Enforced
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0b1c30] tracking-tight">
                Admin Access &amp; Accountability Center
              </h1>
              <p className="text-sm text-[#3f4850] mt-1">
                Signed in as{' '}
                <span className="font-mono font-semibold text-[#0A4572]">{adminEmail}</span>.
                Manage doctor biometric-to-mail permissions and audit every biometric patient scan
                across your emergency network.
              </p>
            </div>
          </div>
        </div>

        {/* Admin Section Tabs */}
        <div
          role="tablist"
          aria-label="Admin Section Tabs"
          className="inline-flex flex-wrap items-center gap-2 p-1.5 rounded-full bg-[#eff4ff] border border-[#dce9ff]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'access'}
            onClick={() => setSubTab('access')}
            className={`min-h-[40px] px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              subTab === 'access'
                ? 'bg-[#0284C7] text-white shadow-xs'
                : 'text-[#3f4850] hover:text-[#0b1c30]'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Doctor Links &amp; Storage
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'history'}
            onClick={() => setSubTab('history')}
            className={`min-h-[40px] px-4 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
              subTab === 'history'
                ? 'bg-[#0284C7] text-white shadow-xs'
                : 'text-[#3f4850] hover:text-[#0b1c30]'
            }`}
          >
            <History className="w-4 h-4" />
            Biometric Match History
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                subTab === 'history'
                  ? 'bg-white/20 text-white'
                  : 'bg-white text-[#0A4572]'
              }`}
            >
              {matchRows.length}
            </span>
          </button>
        </div>
      </section>

      {subTab === 'history' ? (
        <div className="space-y-6">
          {/* Accountability Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-[1.5rem] border border-[#E2E8F0] p-4 sm:p-5">
              <p className="text-xs font-semibold text-[#3f4850]">Total Biometric Matches</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] tabular-nums mt-1">
                {historyStats.total}
              </p>
            </div>
            <div className="bg-white rounded-[1.5rem] border border-[#E2E8F0] p-4 sm:p-5">
              <p className="text-xs font-semibold text-[#3f4850]">Admin Emergency Scans</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#0284C7] tabular-nums mt-1">
                {historyStats.adminCount}
              </p>
            </div>
            <div className="bg-white rounded-[1.5rem] border border-[#E2E8F0] p-4 sm:p-5">
              <p className="text-xs font-semibold text-[#3f4850]">Doctor Biometric Unlocks</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#059669] tabular-nums mt-1">
                {historyStats.doctorCount}
              </p>
            </div>
            <div className="bg-white rounded-[1.5rem] border border-[#E2E8F0] p-4 sm:p-5">
              <p className="text-xs font-semibold text-[#3f4850]">Unique Patients Scanned</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-[#0A4572] tabular-nums mt-1">
                {historyStats.uniquePatients}
              </p>
            </div>
          </div>

          {/* Search & Role Filters */}
          <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#707881] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search by scanner name/email, patient name, MRN, or fingerprint..."
                className="w-full h-12 pl-11 pr-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'ALL', label: 'All Events' },
                  { id: 'ADMIN', label: 'Admin Scans' },
                  { id: 'DOCTOR', label: 'Doctor Unlocks' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActorFilter(item.id)}
                  className={`min-h-[38px] px-4 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    actorFilter === item.id
                      ? 'bg-[#0284C7] text-white'
                      : 'bg-[#eff4ff] text-[#3f4850] hover:bg-[#dce9ff]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Detailed Biometric Matching Audit Log */}
          <section className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <Fingerprint className="w-5 h-5 text-[#0284C7]" />
                <div>
                  <h2 className="text-lg font-bold text-[#0b1c30]">
                    Biometric Matching Accountability Log
                  </h2>
                  <p className="text-xs text-[#3f4850]">
                    Chronological trail showing who scanned each patient&apos;s biometric print and
                    the exact time of the match.
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-[#0A4572] tabular-nums">
                Showing {filteredMatches.length} of {matchRows.length} events
              </span>
            </div>

            {filteredMatches.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#f8f9ff] border border-dashed border-[#cbd5e1] text-center">
                <Clock className="w-8 h-8 text-[#0284C7] mx-auto mb-2" />
                <p className="text-sm font-bold text-[#0b1c30]">
                  No Biometric Matching Events Recorded Yet
                </p>
                <p className="text-xs text-[#3f4850] mt-1">
                  Run a scan on the Biometric Scan tab or have a linked doctor verify a patient
                  fingerprint to populate this accountability log.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[11px] font-bold uppercase tracking-wider text-[#707881]">
                        <th className="py-3 pr-4">Date &amp; Time</th>
                        <th className="py-3 pr-4">Scanned By (Who)</th>
                        <th className="py-3 pr-4">Matched Patient</th>
                        <th className="py-3 pr-4">Biometric Print</th>
                        <th className="py-3">Match Event</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-xs">
                      {filteredMatches.map((row) => (
                        <tr key={row.id} className="hover:bg-[#f8f9ff]">
                          <td className="py-3.5 pr-4 whitespace-nowrap font-mono tabular-nums text-[#0b1c30]">
                            <p className="font-semibold">{row.dateLabel}</p>
                            <p className="text-[#707881]">{row.timeLabel}</p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <p className="font-bold text-[#0b1c30]">
                              {row.actorName}{' '}
                              <span
                                className={`ml-1 font-semibold ${
                                  row.actorRole === 'DOCTOR'
                                    ? 'text-[#059669]'
                                    : 'text-[#0284C7]'
                                }`}
                              >
                                ({row.actorRole === 'DOCTOR' ? 'Doctor' : 'Admin'})
                              </span>
                            </p>
                            <p className="font-mono text-[#3f4850]">{row.actorEmail}</p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <p className="font-bold text-[#0b1c30]">
                              {row.patientName}{' '}
                              <span className="text-[#DC2626] font-extrabold tabular-nums">
                                {row.bloodType}
                              </span>
                            </p>
                            <p className="font-mono text-[#707881] tabular-nums">
                              {row.patientMrn}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4 whitespace-nowrap font-mono font-semibold text-[#0A4572] tabular-nums">
                            {row.fingerprintCode}
                          </td>
                          <td className="py-3.5 text-[#3f4850] max-w-xs">
                            <p className="font-semibold text-[#0b1c30]">
                              {row.actorRole === 'DOCTOR'
                                ? 'Doctor Biometric-to-Mail Unlock'
                                : 'Emergency Biometric Scan Match'}
                            </p>
                            <p className="text-[11px] text-[#707881] truncate" title={row.summary}>
                              {row.summary}
                            </p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-[#F1F5F9]">
                  {filteredMatches.map((row) => (
                    <article key={row.id} className="py-4 first:pt-1 last:pb-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#0b1c30] tabular-nums">
                          {row.dateLabel} · {row.timeLabel}
                        </span>
                        <span
                          className={`font-bold ${
                            row.actorRole === 'DOCTOR' ? 'text-[#059669]' : 'text-[#0284C7]'
                          }`}
                        >
                          {row.actorRole === 'DOCTOR' ? 'Doctor' : 'Admin'}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-[#0b1c30]">
                        {row.patientName} ({row.bloodType}) ·{' '}
                        <span className="font-mono text-xs text-[#0A4572]">{row.patientMrn}</span>
                      </p>
                      <p className="text-xs text-[#3f4850]">
                        Scanned by <span className="font-semibold text-[#0b1c30]">{row.actorName}</span>{' '}
                        (<span className="font-mono">{row.actorEmail}</span>)
                      </p>
                      <p className="text-xs font-mono text-[#0284C7] tabular-nums">
                        Print: {row.fingerprintCode}
                      </p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Connect Doctor Mail to Patient Biometric */}
          <section className="lg:col-span-5 bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-2.5 mb-2">
              <KeyRound className="w-5 h-5 text-[#0284C7]" />
              <h2 className="text-lg font-bold text-[#0b1c30]">
                Connect Patient Biometric to Doctor Mail
              </h2>
            </div>
            <p className="text-xs text-[#3f4850] leading-relaxed mb-5">
              Bind a patient&apos;s biometric fingerprint signature to an external doctor&apos;s
              Gmail account. The doctor must scan that patient&apos;s biometric print after signing
              in to unlock the dossier.
            </p>

            <form onSubmit={(e) => void handleConnect(e)} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">
                  Select Patient &amp; Biometric Signature
                </span>
                <select
                  value={activePatient?.id || ''}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-sm font-medium focus:border-[#0284C7] focus:outline-none"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} · {p.mrn} · {p.fingerprintCode}
                    </option>
                  ))}
                </select>
              </label>

              {activePatient && (
                <div className="p-3.5 rounded-2xl bg-[#eff4ff] border border-[#dce9ff] flex items-center gap-3">
                  <Fingerprint className="w-6 h-6 text-[#0284C7] shrink-0" />
                  <div className="min-w-0 text-xs">
                    <p className="font-bold text-[#0b1c30] truncate">{activePatient.fullName}</p>
                    <p className="font-mono text-[#0A4572] tabular-nums">
                      {activePatient.fingerprintCode} · {activePatient.mrn}
                    </p>
                  </div>
                </div>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Doctor Full Name</span>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                  placeholder="e.g., Dr. Kavya Nair, MD"
                  className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Doctor Gmail ID</span>
                <input
                  type="email"
                  required
                  maxLength={95}
                  value={doctorEmail}
                  onChange={(e) => setDoctorEmail(e.target.value)}
                  placeholder="doctor.name@gmail.com"
                  className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm font-mono"
                />
              </label>

              {error && (
                <div className="p-3 rounded-2xl bg-[#FEE2E2] text-[#93000a] text-xs font-medium">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !activePatient}
                className="w-full min-h-[48px] px-5 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <UserCheck className="w-4 h-4" />
                {submitting ? 'Linking Biometric to Mail...' : 'Connect Biometric to Doctor Mail'}
              </button>
            </form>

            {lastCreatedMailto && (
              <div className="mt-4 p-4 rounded-2xl bg-[#D1FAE5]/60 border border-[#059669]/25 space-y-2">
                <p className="text-xs font-bold text-[#065F46] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Biometric Link Ready for {lastCreatedMailto.email}
                </p>
                <p className="text-xs text-[#065F46]">
                  When the doctor signs in with Google, they must verify fingerprint{' '}
                  <span className="font-mono font-bold">{lastCreatedMailto.fingerprintCode}</span>{' '}
                  to unlock {lastCreatedMailto.patientName}&apos;s clinical dossier.
                </p>
                <a
                  href={`mailto:${encodeURIComponent(lastCreatedMailto.email)}?subject=${encodeURIComponent(
                    `MedZex AI Biometric Access Ready (${lastCreatedMailto.mrn})`
                  )}&body=${encodeURIComponent(
                    `Hello Doctor,\n\nAdmin (${adminEmail}) has linked patient ${lastCreatedMailto.mrn} (Biometric Signature: ${lastCreatedMailto.fingerprintCode}) to your Gmail account (${lastCreatedMailto.email}).\n\nSign in to MedZex AI with your Gmail account and complete the patient biometric fingerprint scan to view the emergency dossier and historical clinical details.\n`
                  )}`}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-4 rounded-full bg-white text-[#065F46] border border-[#059669]/30 text-xs font-semibold hover:bg-[#ECFDF5]"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Compose Email Notice to Doctor
                </a>
              </div>
            )}
          </section>

          {/* Connected Doctor Biometric Links List + Storage Reference */}
          <section className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#0b1c30]">
                    Doctor Biometric-to-Mail Connections
                  </h2>
                  <p className="text-xs text-[#3f4850]">
                    Track which doctors have verified patient biometrics and revoke access anytime.
                  </p>
                </div>
                <span className="text-xs font-bold text-[#0284C7] tabular-nums">
                  {doctorLinks.length} Linked
                </span>
              </div>

              {doctorLinks.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#f8f9ff] border border-dashed border-[#cbd5e1] text-center">
                  <p className="text-sm font-semibold text-[#0b1c30]">
                    No External Doctor Mail Links Created Yet
                  </p>
                  <p className="text-xs text-[#3f4850] mt-1">
                    Currently only your Admin account ({adminEmail}) can view patient records. Use
                    the form on the left to connect a patient biometric print to a doctor&apos;s
                    Gmail.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F1F5F9]">
                  {doctorLinks.map((link) => {
                    const patient = patients.find((p) => p.id === link.patientId);
                    return (
                      <article
                        key={link.id}
                        className="py-4 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-[#0b1c30] text-sm">
                              {link.doctorName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[#0A4572]">{link.doctorEmail}</span>
                          </div>
                          <p className="text-xs text-[#3f4850] tabular-nums">
                            Patient:{' '}
                            <span className="font-semibold text-[#0b1c30]">
                              {patient?.fullName || link.patientMrn}
                            </span>{' '}
                            · {link.patientMrn} ·{' '}
                            <span className="font-mono">{link.fingerprintCode}</span>
                          </p>
                          <p className="text-xs font-semibold">
                            {link.status === 'REVOKED' ? (
                              <span className="text-[#DC2626]">Access Revoked by Admin</span>
                            ) : link.biometricVerified ? (
                              <span className="text-[#059669]">
                                Biometric Verified · Doctor Can View Scoped Dossier
                              </span>
                            ) : (
                              <span className="text-[#D97706]">
                                Pending Doctor Biometric Fingerprint Scan
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {link.biometricVerified && link.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => void onResetBiometricVerification(link)}
                              className="min-h-[38px] px-3 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              title="Require doctor to scan patient biometric again"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Re-Lock
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onToggleLinkStatus(link)}
                            className={`min-h-[38px] px-3.5 rounded-full text-xs font-semibold cursor-pointer ${
                              link.status === 'ACTIVE'
                                ? 'bg-[#FEE2E2] hover:bg-[#FECACA] text-[#DC2626]'
                                : 'bg-[#D1FAE5] hover:bg-[#A7F3D0] text-[#065F46]'
                            }`}
                          >
                            {link.status === 'ACTIVE' ? 'Revoke' : 'Restore'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteDoctorLink(link)}
                            aria-label={`Remove doctor link for ${link.doctorEmail}`}
                            className="min-h-[38px] min-w-[38px] rounded-full border border-[#E2E8F0] hover:bg-[#FEE2E2] hover:text-[#DC2626] text-[#707881] flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cloud Storage Architecture Reference */}
            <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2.5 mb-2">
                <Database className="w-5 h-5 text-[#0284C7]" />
                <h2 className="text-base sm:text-lg font-bold text-[#0b1c30]">
                  Where Patient Details Are Stored (Cloud Firestore)
                </h2>
              </div>
              <p className="text-xs text-[#3f4850] mb-4">
                Database ID:{' '}
                <span className="font-mono font-semibold text-[#0A4572]">
                  ai-studio-e2b4c5f5-8a05-4f24-8c8d-bb0b4bf8b477
                </span>
              </p>
              <div className="divide-y divide-[#F1F5F9]">
                {STORAGE_COLLECTIONS.map((col) => (
                  <div key={col.name} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#0284C7]">/{col.name}</span>
                      <span className="text-[11px] font-semibold text-[#0A4572]">{col.access}</span>
                    </div>
                    <p className="text-xs text-[#3f4850] leading-relaxed">{col.contents}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

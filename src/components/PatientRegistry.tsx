import { useMemo, useState } from 'react';
import { AlertTriangle, Droplets, Search, Siren, Trash2 } from 'lucide-react';
import type { AuditLog, Patient } from '../types/clinical';
import { PatientAvatar } from './PatientAvatar';
import { RegistryActivityChart } from './RegistryActivityChart';

interface PatientRegistryProps {
  patients: Patient[];
  auditLogs: AuditLog[];
  onOpenEmergency: (patient: Patient) => void;
  onDeletePatient: (patient: Patient) => Promise<void>;
  onGoToEnroll: () => void;
}

type FilterKey = 'all' | 'critical' | 'o_neg' | 'dnr';

export function PatientRegistry({
  patients,
  auditLogs,
  onOpenEmergency,
  onDeletePatient,
  onGoToEnroll,
}: PatientRegistryProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return patients.filter((p) => {
      if (filter === 'critical' && p.criticalAlerts.length === 0 && p.allergies.length === 0) {
        return false;
      }
      if (filter === 'o_neg' && p.bloodType !== 'O-') {
        return false;
      }
      if (filter === 'dnr' && !p.dnrStatus) {
        return false;
      }
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.fingerprintCode.toLowerCase().includes(q)
      );
    });
  }, [patients, query, filter]);

  return (
    <div className="space-y-5">
      {/* Monthly Biometric Scans vs Enrollments Data Visualization */}
      <RegistryActivityChart patients={patients} auditLogs={auditLogs} />

      {/* Search & Filter Controls */}
      <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-4 sm:p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#707881] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient name, MRN, or fingerprint hash..."
            className="w-full h-12 pl-11 pr-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: 'All Patients' },
              { id: 'critical', label: 'Critical Alerts' },
              { id: 'o_neg', label: 'O- Blood' },
              { id: 'dnr', label: 'DNR' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-[38px] px-4 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                filter === item.id
                  ? 'bg-[#0284C7] text-white'
                  : 'bg-[#eff4ff] text-[#3f4850] hover:bg-[#dce9ff]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-10 text-center">
          <p className="text-base font-bold text-[#0b1c30] mb-1">No Matching Patient Records</p>
          <p className="text-sm text-[#3f4850] mb-5">
            Adjust your search filter or enroll a new patient biometric profile.
          </p>
          <button
            type="button"
            onClick={onGoToEnroll}
            className="min-h-[44px] px-5 rounded-full bg-[#0284C7] text-white text-xs font-semibold cursor-pointer"
          >
            Enroll New Patient
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((patient) => (
            <article
              key={patient.id}
              className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <PatientAvatar src={patient.avatarUrl} name={patient.fullName} size="md" />
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-[#0b1c30] truncate">{patient.fullName}</h3>
                      <p className="text-xs text-[#3f4850] tabular-nums">
                        {patient.age} yrs · {patient.sex} · {patient.mrn}
                      </p>
                      <p className="text-xs font-mono text-[#0284C7] tabular-nums mt-0.5">
                        {patient.fingerprintCode}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#FEE2E2] text-[#DC2626] text-xs font-extrabold tabular-nums shrink-0">
                    <Droplets className="w-3.5 h-3.5" />
                    {patient.bloodType}
                  </span>
                </div>

                {patient.allergies.length > 0 && (
                  <div className="p-3 rounded-2xl bg-[#FEE2E2]/55 text-xs text-[#7F1D1D] font-semibold flex items-start gap-2 mb-2.5">
                    <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
                    <span>Allergies: {patient.allergies.join(' · ')}</span>
                  </div>
                )}

                <p className="text-xs text-[#3f4850] leading-relaxed">
                  <span className="font-semibold text-[#0b1c30]">Medications:</span>{' '}
                  {patient.medications.length > 0 ? patient.medications.join(', ') : 'None recorded'}
                </p>
              </div>

              <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onOpenEmergency(patient)}
                  className="flex-1 min-h-[44px] px-4 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Siren className="w-4 h-4" />
                  Open Emergency Triage
                </button>

                <button
                  type="button"
                  disabled={deletingId === patient.id}
                  onClick={async () => {
                    setDeletingId(patient.id);
                    try {
                      await onDeletePatient(patient);
                    } finally {
                      setDeletingId(null);
                    }
                  }}
                  aria-label={`Delete ${patient.fullName}`}
                  className="min-h-[44px] min-w-[44px] rounded-full border border-[#E2E8F0] hover:bg-[#FEE2E2] hover:text-[#DC2626] text-[#707881] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

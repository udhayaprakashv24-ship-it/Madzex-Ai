import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AuditLog, Patient } from '../types/clinical';

interface RegistryActivityChartProps {
  patients: Patient[];
  auditLogs: AuditLog[];
}

interface MonthlyBucket {
  key: string;
  monthLabel: string;
  scans: number;
  enrollments: number;
}

function toDateSafe(ts?: { toDate?: () => Date } | null): Date | null {
  if (ts && typeof ts.toDate === 'function') {
    return ts.toDate();
  }
  return null;
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function RegistryActivityChart({ patients, auditLogs }: RegistryActivityChartProps) {
  const [rangeMonths, setRangeMonths] = useState<6 | 12>(6);

  const { chartData, totalScans, totalEnrollments } = useMemo(() => {
    const now = new Date();
    const buckets: MonthlyBucket[] = [];
    const bucketMap = new Map<string, MonthlyBucket>();

    for (let offset = rangeMonths - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = monthKey(date);
      const monthLabel = date.toLocaleDateString('en-US', {
        month: 'short',
        year: rangeMonths === 12 ? '2-digit' : undefined,
      });
      const entry: MonthlyBucket = {
        key,
        monthLabel,
        scans: 0,
        enrollments: 0,
      };
      buckets.push(entry);
      bucketMap.set(key, entry);
    }

    const scanPatientIdsByMonth = new Map<string, number>();
    const enrolledAuditByMonth = new Map<string, number>();

    for (const log of auditLogs) {
      const d = toDateSafe(log.createdAt);
      if (!d) continue;
      const key = monthKey(d);
      if (!bucketMap.has(key)) continue;

      if (log.actionType === 'SCAN_MATCH' || log.actionType === 'DOCTOR_BIOMETRIC_MATCH') {
        scanPatientIdsByMonth.set(key, (scanPatientIdsByMonth.get(key) ?? 0) + 1);
      } else if (log.actionType === 'RECORD_ENROLLED') {
        enrolledAuditByMonth.set(key, (enrolledAuditByMonth.get(key) ?? 0) + 1);
      }
    }

    const patientCreatedByMonth = new Map<string, number>();
    for (const patient of patients) {
      const d = toDateSafe(patient.createdAt);
      if (!d) continue;
      const key = monthKey(d);
      if (!bucketMap.has(key)) continue;
      patientCreatedByMonth.set(key, (patientCreatedByMonth.get(key) ?? 0) + 1);
    }

    let scansSum = 0;
    let enrollmentsSum = 0;

    for (const bucket of buckets) {
      bucket.scans = scanPatientIdsByMonth.get(bucket.key) ?? 0;
      bucket.enrollments = Math.max(
        patientCreatedByMonth.get(bucket.key) ?? 0,
        enrolledAuditByMonth.get(bucket.key) ?? 0
      );
      scansSum += bucket.scans;
      enrollmentsSum += bucket.enrollments;
    }

    return {
      chartData: buckets,
      totalScans: scansSum,
      totalEnrollments: enrollmentsSum,
    };
  }, [auditLogs, patients, rangeMonths]);

  return (
    <section
      aria-label="Monthly Biometric Scans vs Patient Enrollments"
      className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#0b1c30]">
              Monthly Biometric Activity
            </h2>
            <p className="text-xs text-[#3f4850]">
              Successful fingerprint scan matches compared against new patient enrollments
            </p>
          </div>
        </div>

        <div className="inline-flex items-center p-1 rounded-full bg-[#eff4ff] border border-[#dce9ff] self-start sm:self-center">
          <button
            type="button"
            onClick={() => setRangeMonths(6)}
            className={`min-h-[36px] px-3.5 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              rangeMonths === 6
                ? 'bg-[#0284C7] text-white'
                : 'text-[#3f4850] hover:text-[#0b1c30]'
            }`}
          >
            6 Months
          </button>
          <button
            type="button"
            onClick={() => setRangeMonths(12)}
            className={`min-h-[36px] px-3.5 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              rangeMonths === 12
                ? 'bg-[#0284C7] text-white'
                : 'text-[#3f4850] hover:text-[#0b1c30]'
            }`}
          >
            12 Months
          </button>
        </div>
      </div>

      {/* Summary Readouts & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-[#F1F5F9]">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-xs font-semibold text-[#707881]">Successful Biometric Scans</p>
            <p className="text-xl font-bold text-[#0284C7] tabular-nums">{totalScans}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#707881]">New Patient Enrollments</p>
            <p className="text-xl font-bold text-[#0A4572] tabular-nums">{totalEnrollments}</p>
          </div>
        </div>

        <div className="flex items-center gap-5 text-xs font-semibold text-[#3f4850]">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#0284C7]" aria-hidden="true" />
            Successful Scans
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#0A4572]" aria-hidden="true" />
            New Enrollments
          </span>
        </div>
      </div>

      {/* Recharts BarChart */}
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="monthLabel"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#3f4850', fontSize: 12, fontWeight: 600 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#707881', fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: '#eff4ff', radius: 12 }}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const scans = payload.find((p) => p.dataKey === 'scans')?.value ?? 0;
                const enrollments = payload.find((p) => p.dataKey === 'enrollments')?.value ?? 0;
                return (
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_10px_15px_-3px_rgba(15,23,42,0.08)] px-3.5 py-2.5 text-xs">
                    <p className="font-bold text-[#0b1c30] mb-1.5">{label}</p>
                    <div className="space-y-1 tabular-nums">
                      <p className="flex items-center justify-between gap-4 text-[#0284C7] font-semibold">
                        <span>Successful Scans</span>
                        <span>{scans}</span>
                      </p>
                      <p className="flex items-center justify-between gap-4 text-[#0A4572] font-semibold">
                        <span>New Enrollments</span>
                        <span>{enrollments}</span>
                      </p>
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="scans"
              name="Successful Scans"
              fill="#0284C7"
              radius={[8, 8, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="enrollments"
              name="New Enrollments"
              fill="#0A4572"
              radius={[8, 8, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {totalScans === 0 && (
        <p className="mt-3 text-xs text-[#707881]">
          No fingerprint scan matches logged yet. Run a scan in the Biometric Scan tab to watch live scan telemetry update here.
        </p>
      )}
    </section>
  );
}

import type { HistoryCategory, MedicalHistoryDraft } from '../types/clinical';

export const ADMIN_EMAIL = 'udhayaprakashv.24@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export function sanitizeEmailForId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function buildDoctorLinkId(patientId: string, doctorEmail: string): string {
  return `${patientId}__${sanitizeEmailForId(doctorEmail)}`;
}

const HISTORY_DELIMITER = ' •::• ';

export function formatHistorySummary(entry: MedicalHistoryDraft): string {
  const clean = (val: string, max: number) =>
    val.replaceAll(HISTORY_DELIMITER, ' · ').trim().slice(0, max);

  return [
    clean(entry.eventDate, 10),
    entry.category,
    clean(entry.title, 140),
    clean(entry.facility, 120),
    clean(entry.clinician, 80),
    clean(entry.notes, 500),
  ].join(HISTORY_DELIMITER);
}

export function parseHistorySummary(raw: string): MedicalHistoryDraft {
  const parts = raw.split(HISTORY_DELIMITER);
  const category = (parts[1] || 'DIAGNOSIS') as HistoryCategory;
  return {
    eventDate: parts[0] || '',
    category,
    title: parts[2] || raw,
    facility: parts[3] || 'Verified Clinical Facility',
    clinician: parts[4] || '',
    notes: parts[5] || '',
  };
}

import type { Patient } from '../types/clinical';

export function encodePatientQrPayload(
  patient: Pick<Patient, 'mrn' | 'fingerprintCode'>
): string {
  return `MEDZEX|${patient.mrn}|${patient.fingerprintCode}`;
}

export function resolvePatientFromQrText(
  rawText: string,
  patients: Patient[]
): { patient: Patient | null; parsedIdentifier: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { patient: null, parsedIdentifier: '' };
  }

  let candidateMrn = '';
  let candidatePrint = '';
  let candidateId = '';

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        mrn?: string;
        fingerprintCode?: string;
        id?: string;
      };
      candidateMrn = (parsed.mrn || '').trim();
      candidatePrint = (parsed.fingerprintCode || '').trim();
      candidateId = (parsed.id || '').trim();
    } catch {
      // Fallback to delimited or direct matching
    }
  } else if (trimmed.toUpperCase().startsWith('MEDZEX|') || trimmed.toUpperCase().startsWith('MEDZEX:')) {
    const separator = trimmed.includes('|') ? '|' : ':';
    const parts = trimmed.split(separator).map((p) => p.trim());
    // Supports MEDZEX|<mrn>|<fingerprintCode> or MEDZEX:v1:<mrn>:<fingerprintCode>
    if (parts[1]?.toLowerCase() === 'v1') {
      candidateMrn = parts[2] || '';
      candidatePrint = parts[3] || '';
    } else {
      candidateMrn = parts[1] || '';
      candidatePrint = parts[2] || '';
    }
  }

  const normalizedRaw = trimmed.toUpperCase();
  const normalizedMrn = candidateMrn.toUpperCase();
  const normalizedPrint = candidatePrint.toUpperCase();

  const matched =
    patients.find((p) => {
      const pMrn = p.mrn.toUpperCase();
      const pPrint = p.fingerprintCode.toUpperCase();
      const pId = p.id.toUpperCase();
      return (
        (normalizedMrn && pMrn === normalizedMrn) ||
        (normalizedPrint && pPrint === normalizedPrint) ||
        (candidateId && pId === candidateId.toUpperCase()) ||
        pMrn === normalizedRaw ||
        pPrint === normalizedRaw ||
        pId === normalizedRaw
      );
    }) || null;

  return {
    patient: matched,
    parsedIdentifier: candidateMrn || candidatePrint || trimmed,
  };
}

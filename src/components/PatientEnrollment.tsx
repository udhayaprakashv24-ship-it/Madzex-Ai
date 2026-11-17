import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CheckCircle2, Download, Fingerprint, Plus, QrCode, Trash2, UserPlus } from 'lucide-react';
import type { BloodType, HistoryCategory, MedicalHistoryDraft, PatientDraft, Sex } from '../types/clinical';
import { encodePatientQrPayload } from '../lib/qrPayload';
import {
  CLINICAL_CONSTRAINTS,
  generateFingerprintCode,
  generateMrn,
} from '../lib/seedPatients';

interface PatientEnrollmentProps {
  initialFingerprintCode?: string | null;
  initialMrn?: string | null;
  onEnrollPatient: (draft: PatientDraft, initialHistories: MedicalHistoryDraft[]) => Promise<void>;
  saving: boolean;
}

const BLOOD_TYPES: BloodType[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
const SEX_OPTIONS: Sex[] = ['Female', 'Male', 'Other'];

export function PatientEnrollment({
  initialFingerprintCode,
  initialMrn,
  onEnrollPatient,
  saving,
}: PatientEnrollmentProps) {
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState<number>(32);
  const [sex, setSex] = useState<Sex>('Female');
  const [bloodType, setBloodType] = useState<BloodType>('O+');
  const [mrn, setMrn] = useState(() => initialMrn || generateMrn());
  const [fingerprintCode, setFingerprintCode] = useState(
    () => initialFingerprintCode || ''
  );
  const [capturingPrint, setCapturingPrint] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);

  const [allergyInput, setAllergyInput] = useState('');
  const [allergies, setAllergies] = useState<string[]>([]);

  const [medInput, setMedInput] = useState('');
  const [medications, setMedications] = useState<string[]>([]);

  const [conditionInput, setConditionInput] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);

  const [alertInput, setAlertInput] = useState('');
  const [criticalAlerts, setCriticalAlerts] = useState<string[]>([]);

  const [historyCategory, setHistoryCategory] = useState<HistoryCategory>('SURGERY');
  const [historyDate, setHistoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [historyTitle, setHistoryTitle] = useState('');
  const [historyFacility, setHistoryFacility] = useState('');
  const [historyNotes, setHistoryNotes] = useState('');
  const [initialHistories, setInitialHistories] = useState<MedicalHistoryDraft[]>([]);

  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('Spouse');
  const [contactPhone, setContactPhone] = useState('');
  const [dnrStatus, setDnrStatus] = useState(false);
  const [organDonor, setOrganDonor] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (initialFingerprintCode) {
      setFingerprintCode(initialFingerprintCode);
    }
  }, [initialFingerprintCode]);

  useEffect(() => {
    if (initialMrn) {
      setMrn(initialMrn);
    }
  }, [initialMrn]);

  useEffect(() => {
    const cleanMrn = mrn.trim().toUpperCase();
    const cleanFp = fingerprintCode.trim().toUpperCase();
    if (!CLINICAL_CONSTRAINTS.MRN_REGEX.test(cleanMrn) || !CLINICAL_CONSTRAINTS.FP_REGEX.test(cleanFp)) {
      setQrPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(encodePatientQrPayload({ mrn: cleanMrn, fingerprintCode: cleanFp }), {
      width: 180,
      margin: 2,
      color: { dark: '#0b1c30', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setQrPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fingerprintCode, mrn]);

  const handleCaptureFingerprint = () => {
    setCapturingPrint(true);
    window.setTimeout(() => {
      setFingerprintCode(generateFingerprintCode(fullName || 'PATIENT'));
      setCapturingPrint(false);
    }, 650);
  };

  const addItem = (
    value: string,
    list: string[],
    max: number,
    setter: (items: string[]) => void,
    clearInput: () => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed || list.length >= max) return;
    setter([...list, trimmed]);
    clearInput();
  };

  const handleAddInitialHistory = () => {
    const title = historyTitle.trim();
    const facility = historyFacility.trim() || 'Primary Care / Regional Clinic';
    const notes = historyNotes.trim() || title;
    if (title.length < 2 || !CLINICAL_CONSTRAINTS.EVENT_DATE_REGEX.test(historyDate)) return;

    setInitialHistories((prev) => [
      ...prev,
      {
        category: historyCategory,
        eventDate: historyDate,
        title: title.slice(0, CLINICAL_CONSTRAINTS.MAX_HISTORY_TITLE),
        facility: facility.slice(0, CLINICAL_CONSTRAINTS.MAX_HISTORY_FACILITY),
        clinician: '',
        notes: notes.slice(0, CLINICAL_CONSTRAINTS.MAX_HISTORY_NOTES),
      },
    ]);
    setHistoryTitle('');
    setHistoryFacility('');
    setHistoryNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = fullName.trim();
    const cleanFp = fingerprintCode.trim().toUpperCase();
    const cleanMrn = mrn.trim().toUpperCase();

    if (cleanName.length < 2 || cleanName.length > CLINICAL_CONSTRAINTS.MAX_FULL_NAME) {
      setFormError('Patient full name must be between 2 and 120 characters.');
      return;
    }
    if (!CLINICAL_CONSTRAINTS.FP_REGEX.test(cleanFp)) {
      setFormError('Capture a valid biometric fingerprint signature before saving.');
      return;
    }
    if (!CLINICAL_CONSTRAINTS.MRN_REGEX.test(cleanMrn)) {
      setFormError('MRN must follow format MRN-123456.');
      return;
    }
    if (!contactName.trim() || !contactPhone.trim()) {
      setFormError('Emergency contact name and phone number are required.');
      return;
    }

    try {
      await onEnrollPatient(
        {
          mrn: cleanMrn,
          fingerprintCode: cleanFp,
          fullName: cleanName,
          age: Math.min(130, Math.max(0, Math.round(age))),
          sex,
          bloodType,
          avatarUrl: '',
          allergies: allergies.slice(0, CLINICAL_CONSTRAINTS.MAX_ALLERGIES),
          medications: medications.slice(0, CLINICAL_CONSTRAINTS.MAX_MEDICATIONS),
          conditions: conditions.slice(0, CLINICAL_CONSTRAINTS.MAX_CONDITIONS),
          criticalAlerts: criticalAlerts.slice(0, CLINICAL_CONSTRAINTS.MAX_CRITICAL_ALERTS),
          emergencyContactName: contactName.trim().slice(0, CLINICAL_CONSTRAINTS.MAX_CONTACT_NAME),
          emergencyContactRelation:
            contactRelation.trim().slice(0, CLINICAL_CONSTRAINTS.MAX_CONTACT_RELATION) || 'Family',
          emergencyContactPhone: contactPhone.trim().slice(0, CLINICAL_CONSTRAINTS.MAX_CONTACT_PHONE),
          dnrStatus,
          organDonor,
        },
        initialHistories
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save patient enrollment.');
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Biometric Print Capture & Demographics */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)]">
          <h1 className="text-xl font-bold text-[#0b1c30] mb-1">Biometric Patient Enrollment</h1>
          <p className="text-xs text-[#3f4850] mb-5">
            Capture the patient&apos;s fingerprint during conscious intake to link emergency medical history.
          </p>

          <div className="p-5 rounded-3xl bg-[#eff4ff] border border-[#dce9ff] text-center mb-5">
            <button
              type="button"
              onClick={handleCaptureFingerprint}
              disabled={capturingPrint}
              className={`w-28 h-28 rounded-full mx-auto flex flex-col items-center justify-center transition-all cursor-pointer ${
                fingerprintCode
                  ? 'bg-[#D1FAE5] text-[#059669] border-2 border-[#059669]'
                  : 'bg-white text-[#0284C7] border-2 border-[#0284C7] hover:bg-[#f0f9ff]'
              }`}
            >
              {fingerprintCode && !capturingPrint ? (
                <CheckCircle2 className="w-10 h-10 mb-1" />
              ) : (
                <Fingerprint className="w-10 h-10 mb-1" />
              )}
              <span className="text-[11px] font-bold">
                {capturingPrint ? 'SCANNING...' : fingerprintCode ? 'CAPTURED' : 'CAPTURE PRINT'}
              </span>
            </button>

            <p className="mt-3 text-xs font-mono font-semibold text-[#0A4572] tabular-nums">
              {fingerprintCode || 'Tap sensor above to bind fingerprint hash'}
            </p>
          </div>

          {qrPreviewUrl && (
            <div className="mb-5 p-4 rounded-2xl bg-[#f8f9ff] border border-[#dce9ff] flex items-center gap-4">
              <img
                src={qrPreviewUrl}
                alt="Generated emergency QR fallback code"
                className="w-20 h-20 rounded-xl border border-[#E2E8F0] bg-white p-1 shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-xs font-bold text-[#0b1c30] flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-[#0284C7]" />
                  Emergency QR Fallback Ready
                </p>
                <p className="text-[11px] font-mono text-[#0A4572] truncate">
                  {encodePatientQrPayload({
                    mrn: mrn.trim().toUpperCase(),
                    fingerprintCode: fingerprintCode.trim().toUpperCase(),
                  })}
                </p>
                <a
                  href={qrPreviewUrl}
                  download={`MedZex-QR-${mrn.trim().toUpperCase()}.png`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Wristband QR
                </a>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-[#3f4850]">Patient Full Name</span>
              <input
                type="text"
                required
                maxLength={CLINICAL_CONSTRAINTS.MAX_FULL_NAME}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Jordan Alvarez"
                className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Age</span>
                <input
                  type="number"
                  min={0}
                  max={130}
                  required
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm font-mono tabular-nums"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">MRN</span>
                <input
                  type="text"
                  required
                  value={mrn}
                  onChange={(e) => setMrn(e.target.value.toUpperCase())}
                  className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm font-mono tabular-nums"
                />
              </label>
            </div>

            <div>
              <span className="text-xs font-semibold text-[#3f4850] block mb-1.5">Sex</span>
              <div className="grid grid-cols-3 gap-2">
                {SEX_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSex(opt)}
                    className={`min-h-[42px] rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                      sex === opt
                        ? 'bg-[#0284C7] text-white border-[#0284C7]'
                        : 'bg-white text-[#3f4850] border-[#CBD5E1] hover:bg-[#f8f9ff]'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-[#3f4850] block mb-1.5">Blood Type</span>
              <div className="grid grid-cols-4 gap-2">
                {BLOOD_TYPES.map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => setBloodType(bt)}
                    className={`min-h-[42px] rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                      bloodType === bt
                        ? 'bg-[#DC2626] text-white border-[#DC2626]'
                        : 'bg-white text-[#0b1c30] border-[#CBD5E1] hover:bg-[#FEE2E2]/40'
                    }`}
                  >
                    {bt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Critical Clinical Details & Emergency Contact */}
      <div className="lg:col-span-7 bg-white rounded-[2rem] border border-[#E2E8F0] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(15,23,42,0.05)] space-y-5">
        <h2 className="text-lg font-bold text-[#0b1c30]">Emergency Medical Details</h2>

        {/* Allergies Builder */}
        <div>
          <span className="text-xs font-semibold text-[#3f4850]">Severe Allergies (up to 12)</span>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem(allergyInput, allergies, CLINICAL_CONSTRAINTS.MAX_ALLERGIES, setAllergies, () =>
                    setAllergyInput('')
                  );
                }
              }}
              placeholder="e.g., Penicillin (Anaphylaxis)"
              className="flex-1 h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
            />
            <button
              type="button"
              onClick={() =>
                addItem(allergyInput, allergies, CLINICAL_CONSTRAINTS.MAX_ALLERGIES, setAllergies, () =>
                  setAllergyInput('')
                )
              }
              className="min-h-[48px] px-4 rounded-full bg-[#eff4ff] text-[#0A4572] font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
          {allergies.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {allergies.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#FEE2E2]/60 text-xs font-semibold text-[#7F1D1D]"
                >
                  <span>{item}</span>
                  <button
                    type="button"
                    onClick={() => setAllergies(allergies.filter((_, i) => i !== idx))}
                    aria-label="Remove allergy"
                    className="p-1 text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Medications Builder */}
        <div>
          <span className="text-xs font-semibold text-[#3f4850]">Active Medications</span>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={medInput}
              onChange={(e) => setMedInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem(medInput, medications, CLINICAL_CONSTRAINTS.MAX_MEDICATIONS, setMedications, () =>
                    setMedInput('')
                  );
                }
              }}
              placeholder="e.g., Warfarin 5mg Daily"
              className="flex-1 h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
            />
            <button
              type="button"
              onClick={() =>
                addItem(medInput, medications, CLINICAL_CONSTRAINTS.MAX_MEDICATIONS, setMedications, () =>
                  setMedInput('')
                )
              }
              className="min-h-[48px] px-4 rounded-full bg-[#eff4ff] text-[#0A4572] font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
          {medications.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {medications.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#eff4ff] text-xs font-medium text-[#0b1c30]"
                >
                  <span>{item}</span>
                  <button
                    type="button"
                    onClick={() => setMedications(medications.filter((_, i) => i !== idx))}
                    aria-label="Remove medication"
                    className="p-1 text-[#707881] hover:text-[#DC2626] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Chronic Conditions & Critical Alerts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-xs font-semibold text-[#3f4850]">Chronic Conditions</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={conditionInput}
                onChange={(e) => setConditionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(
                      conditionInput,
                      conditions,
                      CLINICAL_CONSTRAINTS.MAX_CONDITIONS,
                      setConditions,
                      () => setConditionInput('')
                    );
                  }
                }}
                placeholder="e.g., Type 1 Diabetes"
                className="flex-1 h-11 px-3.5 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  addItem(conditionInput, conditions, CLINICAL_CONSTRAINTS.MAX_CONDITIONS, setConditions, () =>
                    setConditionInput('')
                  )
                }
                className="min-h-[44px] px-3 rounded-full bg-[#eff4ff] text-[#0A4572] text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
            {conditions.length > 0 && (
              <div className="mt-2 space-y-1">
                {conditions.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-[#3f4850] px-2">
                    <span>• {c}</span>
                    <button
                      type="button"
                      onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                      className="text-[#707881] hover:text-[#DC2626] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-xs font-semibold text-[#3f4850]">Critical Paramedic Alerts</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={alertInput}
                onChange={(e) => setAlertInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(
                      alertInput,
                      criticalAlerts,
                      CLINICAL_CONSTRAINTS.MAX_CRITICAL_ALERTS,
                      setCriticalAlerts,
                      () => setAlertInput('')
                    );
                  }
                }}
                placeholder="e.g., Pacemaker Implanted"
                className="flex-1 h-11 px-3.5 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  addItem(
                    alertInput,
                    criticalAlerts,
                    CLINICAL_CONSTRAINTS.MAX_CRITICAL_ALERTS,
                    setCriticalAlerts,
                    () => setAlertInput('')
                  )
                }
                className="min-h-[44px] px-3 rounded-full bg-[#FEE2E2] text-[#DC2626] text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
            {criticalAlerts.length > 0 && (
              <div className="mt-2 space-y-1">
                {criticalAlerts.map((a, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-[#DC2626] px-2">
                    <span>• {a}</span>
                    <button
                      type="button"
                      onClick={() => setCriticalAlerts(criticalAlerts.filter((_, i) => i !== idx))}
                      className="text-[#707881] hover:text-[#DC2626] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Historical Clinical Records (Optional during intake) */}
        <div className="pt-4 border-t border-[#F1F5F9]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-[#0b1c30]">
                Patient Historical Details (Optional)
              </h3>
              <p className="text-xs text-[#3f4850]">
                Log prior surgeries, hospitalizations, baseline lab panels, or trauma visits into Firestore.
              </p>
            </div>
            <span className="text-xs font-semibold text-[#0284C7] tabular-nums">
              {initialHistories.length} queued
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#f8f9ff] border border-[#dce9ff] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Record Category</span>
                <select
                  value={historyCategory}
                  onChange={(e) => setHistoryCategory(e.target.value as HistoryCategory)}
                  className="mt-1 w-full h-11 px-3.5 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs font-semibold focus:border-[#0284C7] focus:outline-none"
                >
                  <option value="SURGERY">Surgery</option>
                  <option value="HOSPITALIZATION">Hospitalization</option>
                  <option value="LAB_REPORT">Lab Baseline</option>
                  <option value="IMMUNIZATION">Immunization</option>
                  <option value="TRAUMA_ER">Prior ER / Trauma</option>
                  <option value="DIAGNOSIS">Diagnosis</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Event Date</span>
                <input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  className="mt-1 w-full h-11 px-3.5 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs font-mono tabular-nums focus:border-[#0284C7] focus:outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Procedure / Event Title</span>
                <input
                  type="text"
                  maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_TITLE}
                  value={historyTitle}
                  onChange={(e) => setHistoryTitle(e.target.value)}
                  placeholder="e.g., Laparoscopic Appendectomy"
                  className="mt-1 w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-[#3f4850]">Hospital / Facility</span>
                <input
                  type="text"
                  maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_FACILITY}
                  value={historyFacility}
                  onChange={(e) => setHistoryFacility(e.target.value)}
                  placeholder="e.g., Metro General Hospital"
                  className="mt-1 w-full h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={CLINICAL_CONSTRAINTS.MAX_HISTORY_NOTES}
                value={historyNotes}
                onChange={(e) => setHistoryNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInitialHistory();
                  }
                }}
                placeholder="Clinical notes, complications, or baseline lab results..."
                className="flex-1 h-11 px-4 rounded-full border-[1.5px] border-[#CBD5E1] bg-white text-xs focus:border-[#0284C7] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddInitialHistory}
                disabled={historyTitle.trim().length < 2}
                className="min-h-[44px] px-4 rounded-full bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0A4572] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Queue Record
              </button>
            </div>

            {initialHistories.length > 0 && (
              <ul className="divide-y divide-[#E2E8F0] pt-1">
                {initialHistories.map((entry, idx) => (
                  <li key={`${entry.eventDate}-${idx}`} className="py-2 flex items-start justify-between gap-3">
                    <div className="text-xs min-w-0">
                      <p className="font-semibold text-[#0b1c30]">
                        <span className="font-mono text-[#0A4572] tabular-nums">{entry.eventDate}</span> ·{' '}
                        {entry.category.replace(/_/g, ' ')} · {entry.title}
                      </p>
                      <p className="text-[#3f4850] truncate">
                        {entry.facility} — {entry.notes}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInitialHistories(initialHistories.filter((_, i) => i !== idx))}
                      aria-label={`Remove queued record ${entry.title}`}
                      className="min-h-[36px] min-w-[36px] rounded-full text-[#707881] hover:bg-[#FEE2E2] hover:text-[#DC2626] flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="pt-4 border-t border-[#F1F5F9]">
          <h3 className="text-sm font-bold text-[#0b1c30] mb-3">Emergency Contact & Directives</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <label className="block">
              <span className="text-xs font-semibold text-[#3f4850]">Contact Name</span>
              <input
                type="text"
                required
                maxLength={CLINICAL_CONSTRAINTS.MAX_CONTACT_NAME}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Full name"
                className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[#3f4850]">Relation</span>
              <input
                type="text"
                required
                maxLength={CLINICAL_CONSTRAINTS.MAX_CONTACT_RELATION}
                value={contactRelation}
                onChange={(e) => setContactRelation(e.target.value)}
                placeholder="Spouse / Parent"
                className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[#3f4850]">Phone</span>
              <input
                type="tel"
                required
                maxLength={CLINICAL_CONSTRAINTS.MAX_CONTACT_PHONE}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="mt-1 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm font-mono tabular-nums"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={dnrStatus}
                onChange={(e) => setDnrStatus(e.target.checked)}
                className="w-5 h-5 rounded-md accent-[#0284C7]"
              />
              <span className="text-sm font-medium text-[#0b1c30]">Active DNR Directive</span>
            </label>

            <label className="inline-flex items-center gap-2.5 cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={organDonor}
                onChange={(e) => setOrganDonor(e.target.checked)}
                className="w-5 h-5 rounded-md accent-[#0284C7]"
              />
              <span className="text-sm font-medium text-[#0b1c30]">Registered Organ Donor</span>
            </label>
          </div>
        </div>

        {formError && (
          <div className="p-3.5 rounded-2xl bg-[#FEE2E2] text-[#93000a] text-xs font-medium">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[52px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
        >
          <UserPlus className="w-5 h-5" />
          {saving ? 'Saving Biometric Record to Cloud...' : 'Save Biometric Patient Profile'}
        </button>
      </div>
    </form>
  );
}

import type { MedicalHistoryDraft, PatientDraft } from '../types/clinical';

export const CLINICAL_CONSTRAINTS = {
  MRN_REGEX: /^MRN-[0-9]{4,10}$/,
  FP_REGEX: /^FP-[A-Z0-9-]{4,32}$/,
  EVENT_DATE_REGEX: /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
  MAX_FULL_NAME: 120,
  MAX_ALLERGIES: 12,
  MAX_MEDICATIONS: 15,
  MAX_CONDITIONS: 12,
  MAX_CRITICAL_ALERTS: 10,
  MAX_CONTACT_NAME: 120,
  MAX_CONTACT_RELATION: 60,
  MAX_CONTACT_PHONE: 40,
  MAX_HISTORY_TITLE: 160,
  MAX_HISTORY_FACILITY: 160,
  MAX_HISTORY_CLINICIAN: 120,
  MAX_HISTORY_NOTES: 800,
} as const;

export const SEED_PATIENT_TEMPLATES: PatientDraft[] = [
  {
    mrn: 'MRN-409182',
    fingerprintCode: 'FP-8841-ELENA',
    fullName: 'Elena Rostova',
    age: 34,
    sex: 'Female',
    bloodType: 'O-',
    avatarUrl: '/src/assets/images/patient_avatar_elena_1794917005816.jpg',
    allergies: ['Penicillin (Severe — Anaphylaxis)', 'Natural Rubber Latex'],
    medications: ['EpiPen Auto-Injector 0.3mg PRN', 'Albuterol Sulfate HFA 90mcg'],
    conditions: ['Moderate Persistent Asthma', 'History of Anaphylactic Shock'],
    criticalAlerts: [
      'SEVERE PENICILLIN ANAPHYLAXIS',
      'LATEX-FREE PRECAUTIONS REQUIRED',
      'UNIVERSAL DONOR O-NEGATIVE',
    ],
    emergencyContactName: 'Viktor Rostov',
    emergencyContactRelation: 'Spouse',
    emergencyContactPhone: '+1 (555) 234-8891',
    dnrStatus: false,
    organDonor: true,
  },
  {
    mrn: 'MRN-512840',
    fingerprintCode: 'FP-3392-MARCUS',
    fullName: 'Marcus Vance',
    age: 58,
    sex: 'Male',
    bloodType: 'A+',
    avatarUrl: '/src/assets/images/patient_avatar_marcus_1794917007129.jpg',
    allergies: ['Sulfonamides (Severe Rash)', 'Aspirin (Bronchospasm)'],
    medications: ['Warfarin Sodium 5mg Daily', 'Metoprolol Succinate 50mg', 'Lisinopril 10mg'],
    conditions: ['Atrial Fibrillation', 'Dual-Chamber Pacemaker (2024)', 'Hypertension'],
    criticalAlerts: [
      'ON WARFARIN — HIGH INTRACRANIAL BLEED RISK',
      'IMPLANTED PACEMAKER (NO MONOPOLAR CAUTERY)',
    ],
    emergencyContactName: 'Claire Vance',
    emergencyContactRelation: 'Spouse',
    emergencyContactPhone: '+1 (555) 891-4402',
    dnrStatus: false,
    organDonor: false,
  },
  {
    mrn: 'MRN-684219',
    fingerprintCode: 'FP-7720-PRIYA',
    fullName: 'Priya Nair',
    age: 28,
    sex: 'Female',
    bloodType: 'B-',
    avatarUrl: '/src/assets/images/patient_avatar_priya_1794917007852.jpg',
    allergies: ['Ibuprofen / NSAIDs (Angioedema)', 'Peanuts (Anaphylaxis)'],
    medications: ['Insulin Aspart (Continuous Pump)', 'Glucagon Emergency Kit'],
    conditions: ['Type 1 Diabetes Mellitus', 'Hypoglycemia Unawareness'],
    criticalAlerts: [
      'INSULIN PUMP ATTACHED — CHECK BLOOD GLUCOSE IMMEDIATELY',
      'NSAID ANGIOEDEMA RISK',
    ],
    emergencyContactName: 'Arjun Nair',
    emergencyContactRelation: 'Brother',
    emergencyContactPhone: '+1 (555) 640-3117',
    dnrStatus: false,
    organDonor: true,
  },
  {
    mrn: 'MRN-739104',
    fingerprintCode: 'FP-1904-DAVID',
    fullName: 'David Thorne',
    age: 71,
    sex: 'Male',
    bloodType: 'AB+',
    avatarUrl: '/src/assets/images/patient_avatar_david_1794917008262.jpg',
    allergies: ['Iodinated Contrast Dye (Anaphylaxis)'],
    medications: ['Clopidogrel 75mg Daily', 'Atorvastatin 40mg', 'Nitroglycerin 0.4mg SL PRN'],
    conditions: ['Coronary Artery Disease (Stent LAD 2023)', 'Chronic Kidney Disease Stage 3'],
    criticalAlerts: [
      'IODINATED CONTRAST ANAPHYLAXIS',
      'ANTIPLATELET THERAPY (CLOPIDOGREL)',
    ],
    emergencyContactName: 'Hannah Thorne',
    emergencyContactRelation: 'Daughter',
    emergencyContactPhone: '+1 (555) 472-9908',
    dnrStatus: false,
    organDonor: true,
  },
];

export const SEED_MEDICAL_HISTORIES: Record<string, MedicalHistoryDraft[]> = {
  'MRN-409182': [
    {
      category: 'HOSPITALIZATION',
      eventDate: '2025-11-18',
      title: 'ICU Admission — Grade IV Anaphylaxis',
      facility: 'Metro General Hospital ER',
      clinician: 'Dr. S. Lin, MD',
      notes:
        'Developed airway edema and hypotension 12 minutes after oral amoxicillin dose. Responded to IM epinephrine 0.3mg x2 and IV methylprednisolone. Discharged after 24h observation.',
    },
    {
      category: 'LAB_REPORT',
      eventDate: '2026-03-04',
      title: 'Pulmonary Function & IgE Baseline',
      facility: 'Pacific Allergy & Asthma Clinic',
      clinician: 'Dr. M. Alvarez, MD',
      notes:
        'FEV1 82% predicted post-bronchodilator. Confirmed severe latex and beta-lactam hypersensitivity; prescribed dual EpiPen carry protocol.',
    },
    {
      category: 'IMMUNIZATION',
      eventDate: '2026-08-12',
      title: 'Tdap Booster Immunization',
      facility: 'City Urgent Care North',
      clinician: 'R. Gomez, RN',
      notes: 'Administered without incident using latex-free syringe and stopper.',
    },
  ],
  'MRN-512840': [
    {
      category: 'SURGERY',
      eventDate: '2024-06-22',
      title: 'Dual-Chamber Pacemaker Implantation',
      facility: "St. Mary's Heart & Vascular Center",
      clinician: 'Dr. K. Takahashi, MD',
      notes:
        'Medtronic dual-chamber pacemaker implanted via left subclavian vein for symptomatic sick sinus syndrome. Avoid MRI without cardiology clearance and avoid monopolar electrosurgery.',
    },
    {
      category: 'LAB_REPORT',
      eventDate: '2026-09-29',
      title: 'Coagulation Panel (INR / PT)',
      facility: 'Mercy Anticoagulation Lab',
      clinician: 'Dr. H. Patel, MD',
      notes:
        'INR 2.6 (therapeutic range 2.0–3.0 on Warfarin 5mg daily). High hemorrhage risk in cranial or abdominal trauma; reverse with 4F-PCC + Vitamin K if intracranial bleed suspected.',
    },
    {
      category: 'HOSPITALIZATION',
      eventDate: '2023-12-09',
      title: 'Cardioversion & Telemetry Observation',
      facility: 'County Regional Medical Center',
      clinician: 'Dr. E. Brooks, MD',
      notes:
        'Admitted for rapid ventricular response atrial fibrillation (HR 154 bpm). Rate-controlled on metoprolol succinate.',
    },
  ],
  'MRN-684219': [
    {
      category: 'TRAUMA_ER',
      eventDate: '2025-07-14',
      title: 'ER Resuscitation — Severe Hypoglycemia (BG 31 mg/dL)',
      facility: 'Harborview Emergency Department',
      clinician: 'Dr. A. Morales, MD',
      notes:
        'Brought in unresponsive due to overnight insulin pump basal mismatch. Rapidly regained consciousness following 25g IV D50W bolus.',
    },
    {
      category: 'HOSPITALIZATION',
      eventDate: '2024-02-05',
      title: 'Angioedema Observation post-Ibuprofen',
      facility: 'Westside Community Hospital',
      clinician: 'Dr. P. Chen, MD',
      notes:
        'Presented with periorbital and lip swelling 40 minutes after ibuprofen 400mg. Strictly avoid all NSAIDs including ketorolac in trauma pain management.',
    },
    {
      category: 'LAB_REPORT',
      eventDate: '2026-10-03',
      title: 'HbA1c & Renal Baseline Panel',
      facility: 'Endocrine Care Associates',
      clinician: 'Dr. N. Kapoor, MD',
      notes: 'HbA1c 6.9%, serum creatinine 0.8 mg/dL, normal electrolytes.',
    },
  ],
  'MRN-739104': [
    {
      category: 'SURGERY',
      eventDate: '2023-09-11',
      title: 'PCI & Drug-Eluting Stent (Proximal LAD)',
      facility: 'University Cardiac Catheterization Lab',
      clinician: 'Dr. R. Sterling, MD',
      notes:
        'Successful percutaneous coronary intervention of 90% proximal LAD stenosis. Maintained on Clopidogrel 75mg daily; do not abruptly discontinue antiplatelet therapy without cardiology review.',
    },
    {
      category: 'HOSPITALIZATION',
      eventDate: '2025-04-17',
      title: 'Contrast-Induced Anaphylactoid Reaction',
      facility: 'Memorial Diagnostic Center',
      clinician: 'Dr. J. Okafor, MD',
      notes:
        'Experienced bronchospasm and hypotension during CT angiography with iodinated contrast. Use non-contrast CT or ultrasound for emergent imaging.',
    },
    {
      category: 'LAB_REPORT',
      eventDate: '2026-08-25',
      title: 'Comprehensive Metabolic & Renal Panel',
      facility: 'Senior Care Diagnostics',
      clinician: 'Dr. L. Novak, MD',
      notes: 'Baseline Creatinine 1.65 mg/dL, eGFR 44 mL/min/1.73m2 (CKD Stage 3b). Adjust renal-cleared IV medications accordingly.',
    },
  ],
};

export function generateMrn(): string {
  const digits = Math.floor(100000 + Math.random() * 899999);
  return `MRN-${digits}`;
}

export function generateFingerprintCode(nameHint?: string): string {
  const cleanHint = (nameHint || 'BIO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6) || 'BIO';
  const suffix = Math.floor(1000 + Math.random() * 8999);
  return `FP-${suffix}-${cleanHint}`;
}

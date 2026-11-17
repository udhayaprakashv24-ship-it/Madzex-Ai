import type { Timestamp } from 'firebase/firestore';

export type BloodType = 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-';
export type Sex = 'Male' | 'Female' | 'Other';
export type ResponderRole = 'ADMIN' | 'DOCTOR' | 'PARAMEDIC' | 'ER_PHYSICIAN' | 'TRIAGE_NURSE';
export type AuditActionType =
  | 'SCAN_MATCH'
  | 'DOCTOR_BIOMETRIC_MATCH'
  | 'EMERGENCY_CONTACT_NOTIFIED'
  | 'RECORD_ENROLLED'
  | 'RECORD_UPDATED'
  | 'DOCTOR_LINK_CREATED'
  | 'DOCTOR_LINK_REVOKED';

export type HistoryCategory =
  | 'SURGERY'
  | 'HOSPITALIZATION'
  | 'LAB_REPORT'
  | 'IMMUNIZATION'
  | 'TRAUMA_ER'
  | 'DIAGNOSIS';

export type DoctorLinkStatus = 'ACTIVE' | 'REVOKED';

export interface Responder {
  uid: string;
  displayName: string;
  email: string;
  role: ResponderRole;
  seeded: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Patient {
  id: string;
  ownerId: string;
  mrn: string;
  fingerprintCode: string;
  fullName: string;
  age: number;
  sex: Sex;
  bloodType: BloodType;
  avatarUrl: string;
  allergies: string[];
  medications: string[];
  conditions: string[];
  criticalAlerts: string[];
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  dnrStatus: boolean;
  organDonor: boolean;
  lastScannedAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PatientDraft {
  mrn: string;
  fingerprintCode: string;
  fullName: string;
  age: number;
  sex: Sex;
  bloodType: BloodType;
  avatarUrl: string;
  allergies: string[];
  medications: string[];
  conditions: string[];
  criticalAlerts: string[];
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  dnrStatus: boolean;
  organDonor: boolean;
}

export interface MedicalHistoryDraft {
  category: HistoryCategory;
  eventDate: string;
  title: string;
  facility: string;
  clinician: string;
  notes: string;
}

export interface MedicalHistoryEntry extends MedicalHistoryDraft {
  id: string;
  ownerId: string;
  patientId: string;
  createdAt: Timestamp;
}

export interface DoctorBiometricLink {
  id: string;
  adminUid: string;
  adminEmail: string;
  doctorEmail: string;
  doctorName: string;
  patientId: string;
  patientMrn: string;
  fingerprintCode: string;
  status: DoctorLinkStatus;
  biometricVerified: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ClinicalVaultDossier {
  adminUid: string;
  patientId: string;
  doctorEmail: string;
  fullName: string;
  age: number;
  sex: Sex;
  bloodType: BloodType;
  mrn: string;
  fingerprintCode: string;
  allergies: string[];
  medications: string[];
  conditions: string[];
  criticalAlerts: string[];
  historySummaries: string[];
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  dnrStatus: boolean;
  organDonor: boolean;
  updatedAt: Timestamp;
}

export interface LiveVitals {
  heartRate: number;
  spo2: number;
  bpSystolic: number;
  bpDiastolic: number;
  gcsScore: number;
  chiefComplaint: string;
}

export interface AiTriageResult {
  esiLevel: number;
  clinicalSynopsis: string;
  immediateActions: string[];
  contraindications: string[];
}

export interface TriageAssessment {
  id: string;
  ownerId: string;
  patientId: string;
  heartRate: number;
  spo2: number;
  bpSystolic: number;
  bpDiastolic: number;
  gcsScore: number;
  chiefComplaint: string;
  esiLevel: number;
  clinicalSynopsis: string;
  immediateActions: string[];
  contraindications: string[];
  createdAt: Timestamp;
}

export interface AuditLog {
  id: string;
  ownerId: string;
  patientId: string;
  actionType: AuditActionType;
  summary: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: ResponderRole;
  fingerprintCode?: string;
  createdAt: Timestamp;
}

export type AppTab = 'scan' | 'emergency' | 'enroll' | 'registry' | 'admin';

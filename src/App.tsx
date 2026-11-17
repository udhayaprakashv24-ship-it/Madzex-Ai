import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  ClipboardList,
  Fingerprint,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserPlus,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  ADMIN_EMAIL,
  buildDoctorLinkId,
  formatHistorySummary,
  isAdminEmail,
} from './lib/adminConfig';
import { SEED_MEDICAL_HISTORIES, SEED_PATIENT_TEMPLATES } from './lib/seedPatients';
import type {
  AppTab,
  AiTriageResult,
  AuditActionType,
  AuditLog,
  ClinicalVaultDossier,
  DoctorBiometricLink,
  LiveVitals,
  MedicalHistoryDraft,
  MedicalHistoryEntry,
  Patient,
  PatientDraft,
  TriageAssessment,
} from './types/clinical';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthGate } from './components/AuthGate';
import { BiometricScanner } from './components/BiometricScanner';
import { EmergencyDossier } from './components/EmergencyDossier';
import { PatientEnrollment } from './components/PatientEnrollment';
import { PatientRegistry } from './components/PatientRegistry';
import { EmergencyDrawer } from './components/EmergencyDrawer';
import { AdminAccessPanel } from './components/AdminAccessPanel';
import { DoctorBiometricPortal } from './components/DoctorBiometricPortal';

function BioPulseWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<TriageAssessment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [medicalHistories, setMedicalHistories] = useState<MedicalHistoryEntry[]>([]);
  const [doctorLinks, setDoctorLinks] = useState<DoctorBiometricLink[]>([]);
  const historyBackfilledRef = useRef(false);

  const [activeTab, setActiveTab] = useState<AppTab>('scan');
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [pendingFingerprint, setPendingFingerprint] = useState<string | null>(null);
  const [pendingMrn, setPendingMrn] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [savingEnrollment, setSavingEnrollment] = useState(false);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isAdmin = isAdminEmail(user?.email);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

  // Auth listener + Admin/Doctor profile initialization & Admin-only patient seeding
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        setPatients([]);
        setAssessments([]);
        setAuditLogs([]);
        setMedicalHistories([]);
        setDoctorLinks([]);
        setActivePatientId(null);
        historyBackfilledRef.current = false;
        return;
      }

      const adminUser = isAdminEmail(nextUser.email);
      const responderRef = doc(db, 'responders', nextUser.uid);

      try {
        const responderSnap = await getDoc(responderRef);
        if (!responderSnap.exists()) {
          await setDoc(responderRef, {
            uid: nextUser.uid,
            displayName: (
              nextUser.displayName || (adminUser ? 'MedZex Admin' : 'Attending Doctor')
            ).slice(0, 120),
            email: (nextUser.email || 'user@medzex.local').toLowerCase().slice(0, 160),
            role: adminUser ? 'ADMIN' : 'DOCTOR',
            seeded: adminUser,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          if (adminUser) {
            const seededRefs: Array<{ patientId: string; mrn: string }> = [];
            const batch = writeBatch(db);
            SEED_PATIENT_TEMPLATES.forEach((tpl) => {
              const pRef = doc(collection(db, 'patients'));
              seededRefs.push({ patientId: pRef.id, mrn: tpl.mrn });
              batch.set(pRef, {
                ...tpl,
                ownerId: nextUser.uid,
                lastScannedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            });
            await batch.commit();

            const historyBatch = writeBatch(db);
            let hasSeedHistories = false;
            seededRefs.forEach(({ patientId, mrn }) => {
              const entries = SEED_MEDICAL_HISTORIES[mrn] || [];
              entries.forEach((entry) => {
                hasSeedHistories = true;
                const hRef = doc(collection(db, 'medicalHistories'));
                historyBatch.set(hRef, {
                  ...entry,
                  ownerId: nextUser.uid,
                  patientId,
                  createdAt: serverTimestamp(),
                });
              });
            });
            if (hasSeedHistories) {
              await historyBatch.commit();
            }
          }
        } else if (adminUser) {
          const currentRole = responderSnap.data()?.role;
          if (currentRole !== 'ADMIN') {
            await updateDoc(responderRef, {
              role: 'ADMIN',
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `responders/${nextUser.uid}`);
      }
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore listeners (strictly partitioned: Admin master vault vs Doctor scoped links)
  useEffect(() => {
    if (!authReady || !user) return;

    const toMillis = (ts?: { toMillis?: () => number } | null) =>
      ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;

    if (!isAdmin) {
      setPatients([]);
      setAssessments([]);
      setAuditLogs([]);
      setMedicalHistories([]);

      const doctorEmail = (user.email || '').trim().toLowerCase();
      if (!doctorEmail) return;

      const doctorLinksQuery = query(
        collection(db, 'doctorBiometricLinks'),
        where('doctorEmail', '==', doctorEmail)
      );

      const unsubDoctorLinks = onSnapshot(
        doctorLinksQuery,
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<DoctorBiometricLink, 'id'>) }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
          setDoctorLinks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'doctorBiometricLinks')
      );

      return () => {
        unsubDoctorLinks();
      };
    }

    const patientsQuery = query(
      collection(db, 'patients'),
      where('ownerId', '==', user.uid)
    );

    const unsubPatients = onSnapshot(
      patientsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Patient, 'id'>) }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setPatients(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'patients')
    );

    const triageQuery = query(
      collection(db, 'triageAssessments'),
      where('ownerId', '==', user.uid)
    );

    const unsubTriage = onSnapshot(
      triageQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TriageAssessment, 'id'>),
          }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setAssessments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'triageAssessments')
    );

    const auditQuery = query(
      collection(db, 'auditLogs'),
      where('ownerId', '==', user.uid)
    );

    const unsubAudit = onSnapshot(
      auditQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setAuditLogs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
    );

    const historiesQuery = query(
      collection(db, 'medicalHistories'),
      where('ownerId', '==', user.uid)
    );

    const unsubHistories = onSnapshot(
      historiesQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MedicalHistoryEntry, 'id'>) }))
          .sort((a, b) => {
            const dateOrder = b.eventDate.localeCompare(a.eventDate);
            return dateOrder !== 0 ? dateOrder : toMillis(b.createdAt) - toMillis(a.createdAt);
          });
        setMedicalHistories(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'medicalHistories')
    );

    const adminLinksQuery = query(
      collection(db, 'doctorBiometricLinks'),
      where('adminUid', '==', user.uid)
    );

    const unsubAdminLinks = onSnapshot(
      adminLinksQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<DoctorBiometricLink, 'id'>) }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setDoctorLinks(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'doctorBiometricLinks')
    );

    return () => {
      unsubPatients();
      unsubTriage();
      unsubAudit();
      unsubHistories();
      unsubAdminLinks();
    };
  }, [authReady, isAdmin, user]);

  // One-time backfill of seeded clinical histories for Admin's pre-existing patients
  useEffect(() => {
    if (!authReady || !user || !isAdmin || patients.length === 0 || historyBackfilledRef.current) {
      return;
    }
    historyBackfilledRef.current = true;

    const backfillSeedHistories = async () => {
      try {
        const existingSnap = await getDocs(
          query(
            collection(db, 'medicalHistories'),
            where('ownerId', '==', user.uid),
            limit(1)
          )
        );
        if (!existingSnap.empty) return;

        const batch = writeBatch(db);
        let count = 0;
        patients.forEach((p) => {
          const entries = SEED_MEDICAL_HISTORIES[p.mrn] || [];
          entries.forEach((entry) => {
            const hRef = doc(collection(db, 'medicalHistories'));
            batch.set(hRef, {
              ...entry,
              ownerId: user.uid,
              patientId: p.id,
              createdAt: serverTimestamp(),
            });
            count += 1;
          });
        });
        if (count > 0) {
          await batch.commit();
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'medicalHistories');
      }
    };

    void backfillSeedHistories();
  }, [authReady, isAdmin, patients, user]);

  const activePatient =
    patients.find((p) => p.id === activePatientId) || patients[0] || null;

  const logAuditEvent = useCallback(
    async (
      patientId: string,
      actionType: AuditActionType,
      summary: string,
      fingerprintCode = ''
    ) => {
      if (!user || !isAdmin) return;
      try {
        await addDoc(collection(db, 'auditLogs'), {
          ownerId: user.uid,
          patientId,
          actionType,
          summary: summary.slice(0, 300),
          actorEmail: (user.email || ADMIN_EMAIL).trim().toLowerCase().slice(0, 160),
          actorName: (user.displayName || 'MedZex Admin').trim().slice(0, 120),
          actorRole: 'ADMIN',
          fingerprintCode: fingerprintCode.slice(0, 36),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'auditLogs');
      }
    },
    [isAdmin, user]
  );

  const syncVaultDossier = useCallback(
    async (
      linkId: string,
      patient: Patient,
      doctorEmail: string,
      histories: MedicalHistoryEntry[]
    ) => {
      if (!user || !isAdmin) return;
      const historySummaries = histories
        .filter((h) => h.patientId === patient.id)
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
        .slice(0, 25)
        .map((h) => formatHistorySummary(h));

      try {
        await setDoc(doc(db, 'doctorBiometricLinks', linkId, 'vault', 'clinicalDossier'), {
          adminUid: user.uid,
          patientId: patient.id,
          doctorEmail: doctorEmail.toLowerCase(),
          fullName: patient.fullName.slice(0, 120),
          age: patient.age,
          sex: patient.sex,
          bloodType: patient.bloodType,
          mrn: patient.mrn,
          fingerprintCode: patient.fingerprintCode,
          allergies: patient.allergies.slice(0, 12),
          medications: patient.medications.slice(0, 15),
          conditions: patient.conditions.slice(0, 12),
          criticalAlerts: patient.criticalAlerts.slice(0, 10),
          historySummaries,
          emergencyContactName: patient.emergencyContactName.slice(0, 120),
          emergencyContactRelation: patient.emergencyContactRelation.slice(0, 60),
          emergencyContactPhone: patient.emergencyContactPhone.slice(0, 40),
          dnrStatus: patient.dnrStatus,
          organDonor: patient.organDonor,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `doctorBiometricLinks/${linkId}/vault/clinicalDossier`
        );
      }
    },
    [isAdmin, user]
  );

  const handleScanMatch = useCallback(
    async (patient: Patient, method: 'biometric' | 'qr' = 'biometric') => {
      setActivePatientId(patient.id);
      setTriageError(null);
      setActiveTab('emergency');
      showToast(
        method === 'qr'
          ? `QR fallback match confirmed: ${patient.fullName} (${patient.bloodType})`
          : `Biometric match confirmed: ${patient.fullName} (${patient.bloodType})`
      );

      try {
        await updateDoc(doc(db, 'patients', patient.id), {
          lastScannedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await logAuditEvent(
          patient.id,
          'SCAN_MATCH',
          method === 'qr'
            ? `QR Medical ID fallback retrieved ${patient.mrn} when biometric fingerprint was unavailable.`
            : `Fingerprint ${patient.fingerprintCode} matched in emergency mode.`,
          patient.fingerprintCode
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `patients/${patient.id}`);
      }
    },
    [logAuditEvent, showToast]
  );

  const handleEnrollUnknown = (capturedCode: string, mrnHint?: string) => {
    setPendingFingerprint(capturedCode);
    setPendingMrn(mrnHint || null);
    setActiveTab('enroll');
  };

  const handleEnrollPatient = async (
    draft: PatientDraft,
    initialHistories: MedicalHistoryDraft[]
  ) => {
    if (!user || !isAdmin) return;
    setSavingEnrollment(true);
    try {
      const createdRef = await addDoc(collection(db, 'patients'), {
        ...draft,
        ownerId: user.uid,
        lastScannedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (initialHistories.length > 0) {
        const historyBatch = writeBatch(db);
        initialHistories.forEach((entry) => {
          const hRef = doc(collection(db, 'medicalHistories'));
          historyBatch.set(hRef, {
            category: entry.category,
            eventDate: entry.eventDate,
            title: entry.title.trim().slice(0, 160),
            facility: (entry.facility.trim() || 'Primary Care / Regional Clinic').slice(0, 160),
            clinician: entry.clinician.trim().slice(0, 120),
            notes: (entry.notes.trim() || entry.title.trim()).slice(0, 800),
            ownerId: user.uid,
            patientId: createdRef.id,
            createdAt: serverTimestamp(),
          });
        });
        await historyBatch.commit();
      }

      await logAuditEvent(
        createdRef.id,
        'RECORD_ENROLLED',
        `Enrolled ${draft.fullName} with biometric print ${draft.fingerprintCode}.`,
        draft.fingerprintCode
      );
      setPendingFingerprint(null);
      setPendingMrn(null);
      setActivePatientId(createdRef.id);
      setActiveTab('emergency');
      showToast(`Enrolled ${draft.fullName} and bound print ${draft.fingerprintCode}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'patients');
    } finally {
      setSavingEnrollment(false);
    }
  };

  const handleAddHistory = async (patientId: string, entry: MedicalHistoryDraft) => {
    if (!user || !isAdmin) return;
    try {
      const createdHistory = await addDoc(collection(db, 'medicalHistories'), {
        ownerId: user.uid,
        patientId,
        category: entry.category,
        eventDate: entry.eventDate,
        title: entry.title.trim().slice(0, 160),
        facility: entry.facility.trim().slice(0, 160),
        clinician: entry.clinician.trim().slice(0, 120),
        notes: entry.notes.trim().slice(0, 800),
        createdAt: serverTimestamp(),
      });

      const targetPatient = patients.find((p) => p.id === patientId);
      if (targetPatient) {
        const matchingLinks = doctorLinks.filter((l) => l.patientId === patientId);
        const optimisticList: MedicalHistoryEntry[] = [
          ...medicalHistories,
          {
            id: createdHistory.id,
            ownerId: user.uid,
            patientId,
            ...entry,
            createdAt: targetPatient.updatedAt,
          },
        ];
        await Promise.all(
          matchingLinks.map((link) =>
            syncVaultDossier(link.id, targetPatient, link.doctorEmail, optimisticList)
          )
        );
      }

      await logAuditEvent(
        patientId,
        'RECORD_UPDATED',
        `Added ${entry.category.toLowerCase().replace(/_/g, ' ')} record: ${entry.title.trim().slice(0, 120)}`
      );
      showToast('Historical clinical record saved to database');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medicalHistories');
    }
  };

  const handleDeleteHistory = async (historyId: string) => {
    if (!isAdmin) return;
    try {
      const targetEntry = medicalHistories.find((h) => h.id === historyId);
      await deleteDoc(doc(db, 'medicalHistories', historyId));

      if (targetEntry) {
        const targetPatient = patients.find((p) => p.id === targetEntry.patientId);
        if (targetPatient) {
          const matchingLinks = doctorLinks.filter((l) => l.patientId === targetPatient.id);
          const remaining = medicalHistories.filter((h) => h.id !== historyId);
          await Promise.all(
            matchingLinks.map((link) =>
              syncVaultDossier(link.id, targetPatient, link.doctorEmail, remaining)
            )
          );
        }
      }

      showToast('Historical clinical record removed');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `medicalHistories/${historyId}`);
    }
  };

  const handleCreateDoctorLink = async (
    patient: Patient,
    doctorName: string,
    doctorEmail: string
  ) => {
    if (!user || !isAdmin) return;
    const cleanEmail = doctorEmail.trim().toLowerCase();
    const cleanName = doctorName.trim().slice(0, 120);
    const linkId = buildDoctorLinkId(patient.id, cleanEmail);
    const linkRef = doc(db, 'doctorBiometricLinks', linkId);

    try {
      const existingSnap = await getDoc(linkRef);
      if (!existingSnap.exists()) {
        await setDoc(linkRef, {
          adminUid: user.uid,
          adminEmail: ADMIN_EMAIL,
          doctorEmail: cleanEmail,
          doctorName: cleanName,
          patientId: patient.id,
          patientMrn: patient.mrn,
          fingerprintCode: patient.fingerprintCode,
          status: 'ACTIVE',
          biometricVerified: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(linkRef, {
          status: 'ACTIVE',
          doctorName: cleanName,
          biometricVerified: false,
          updatedAt: serverTimestamp(),
        });
      }

      await syncVaultDossier(linkId, patient, cleanEmail, medicalHistories);
      await logAuditEvent(
        patient.id,
        'DOCTOR_LINK_CREATED',
        `Linked biometric ${patient.fingerprintCode} to doctor ${cleanEmail}.`,
        patient.fingerprintCode
      );
      showToast(`Connected ${patient.mrn} biometric to ${cleanEmail}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `doctorBiometricLinks/${linkId}`);
    }
  };

  const handleToggleLinkStatus = async (link: DoctorBiometricLink) => {
    if (!isAdmin) return;
    const nextStatus = link.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
    try {
      await updateDoc(doc(db, 'doctorBiometricLinks', link.id), {
        status: nextStatus,
        biometricVerified: nextStatus === 'REVOKED' ? false : link.biometricVerified,
        updatedAt: serverTimestamp(),
      });
      await logAuditEvent(
        link.patientId,
        nextStatus === 'REVOKED' ? 'DOCTOR_LINK_REVOKED' : 'DOCTOR_LINK_CREATED',
        `${nextStatus === 'REVOKED' ? 'Revoked' : 'Restored'} biometric-to-mail access for ${link.doctorEmail}.`,
        link.fingerprintCode
      );
      showToast(
        nextStatus === 'REVOKED'
          ? `Revoked access for ${link.doctorEmail}`
          : `Restored access for ${link.doctorEmail}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `doctorBiometricLinks/${link.id}`);
    }
  };

  const handleResetBiometricVerification = async (link: DoctorBiometricLink) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, 'doctorBiometricLinks', link.id), {
        biometricVerified: false,
        updatedAt: serverTimestamp(),
      });
      showToast(`Re-locked biometric verification for ${link.doctorEmail}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `doctorBiometricLinks/${link.id}`);
    }
  };

  const handleDeleteDoctorLink = async (link: DoctorBiometricLink) => {
    if (!isAdmin) return;
    try {
      try {
        await deleteDoc(doc(db, 'doctorBiometricLinks', link.id, 'vault', 'clinicalDossier'));
      } catch {
        // Vault doc may not exist if never synced
      }
      await deleteDoc(doc(db, 'doctorBiometricLinks', link.id));
      await logAuditEvent(
        link.patientId,
        'DOCTOR_LINK_REVOKED',
        `Deleted biometric link for ${link.doctorEmail}.`,
        link.fingerprintCode
      );
      showToast(`Deleted link for ${link.doctorEmail}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `doctorBiometricLinks/${link.id}`);
    }
  };

  const handleVerifyBiometricLink = async (link: DoctorBiometricLink) => {
    try {
      await updateDoc(doc(db, 'doctorBiometricLinks', link.id), {
        biometricVerified: true,
        updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'auditLogs'), {
        ownerId: link.adminUid,
        patientId: link.patientId,
        actionType: 'DOCTOR_BIOMETRIC_MATCH',
        summary: `Doctor ${link.doctorName} (${link.doctorEmail}) verified biometric print ${link.fingerprintCode} for ${link.patientMrn}.`.slice(
          0,
          300
        ),
        actorEmail: (user?.email || link.doctorEmail).trim().toLowerCase().slice(0, 160),
        actorName: (user?.displayName || link.doctorName).trim().slice(0, 120),
        actorRole: 'DOCTOR',
        fingerprintCode: link.fingerprintCode.slice(0, 36),
        createdAt: serverTimestamp(),
      });
      showToast(`Biometric verified — unlocked ${link.patientMrn} for ${link.doctorEmail}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `doctorBiometricLinks/${link.id}`);
    }
  };

  const handleLoadUnlockedDossier = useCallback(
    async (link: DoctorBiometricLink): Promise<ClinicalVaultDossier | null> => {
      try {
        const snap = await getDoc(
          doc(db, 'doctorBiometricLinks', link.id, 'vault', 'clinicalDossier')
        );
        return snap.exists() ? (snap.data() as ClinicalVaultDossier) : null;
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.GET,
          `doctorBiometricLinks/${link.id}/vault/clinicalDossier`
        );
        return null;
      }
    },
    []
  );

  const handleRunAiTriage = async (patient: Patient, vitals: LiveVitals) => {
    if (!user || !isAdmin) return;
    setTriageLoading(true);
    setTriageError(null);

    try {
      const patientHistory = medicalHistories
        .filter((h) => h.patientId === patient.id)
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate))
        .slice(0, 12)
        .map(({ category, eventDate, title, facility, notes }) => ({
          category,
          eventDate,
          title,
          facility,
          notes,
        }));

      const response = await fetch('/api/triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient: {
            fullName: patient.fullName,
            age: patient.age,
            sex: patient.sex,
            bloodType: patient.bloodType,
            allergies: patient.allergies,
            medications: patient.medications,
            conditions: patient.conditions,
            criticalAlerts: patient.criticalAlerts,
            dnrStatus: patient.dnrStatus,
          },
          vitals,
          medicalHistory: patientHistory,
        }),
      });

      const payload = (await response.json()) as AiTriageResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'AI triage generation failed.');
      }

      await addDoc(collection(db, 'triageAssessments'), {
        ownerId: user.uid,
        patientId: patient.id,
        heartRate: vitals.heartRate,
        spo2: vitals.spo2,
        bpSystolic: vitals.bpSystolic,
        bpDiastolic: vitals.bpDiastolic,
        gcsScore: vitals.gcsScore,
        chiefComplaint: vitals.chiefComplaint.slice(0, 500),
        esiLevel: payload.esiLevel,
        clinicalSynopsis: payload.clinicalSynopsis.slice(0, 1500),
        immediateActions: payload.immediateActions.slice(0, 10),
        contraindications: payload.contraindications.slice(0, 10),
        createdAt: serverTimestamp(),
      });

      showToast(`AI Emergency Triage saved (ESI Level ${payload.esiLevel})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to run AI triage analysis.';
      setTriageError(msg);
    } finally {
      setTriageLoading(false);
    }
  };

  const handleNotifyContact = async (patient: Patient) => {
    setNotifying(true);
    try {
      await logAuditEvent(
        patient.id,
        'EMERGENCY_CONTACT_NOTIFIED',
        `Emergency notification logged for ${patient.emergencyContactName} (${patient.emergencyContactPhone}).`
      );
      showToast(`Notified ${patient.emergencyContactName}`);
    } finally {
      setNotifying(false);
    }
  };

  const handleDeletePatient = async (patient: Patient) => {
    if (!isAdmin) return;
    try {
      await deleteDoc(doc(db, 'patients', patient.id));
      if (activePatientId === patient.id) {
        setActivePatientId(null);
      }
      showToast(`Removed record for ${patient.fullName}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `patients/${patient.id}`);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-sm font-semibold text-[#0A4572]">
          Initializing MedZex AI Terminal...
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthGate />;
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] pb-24 lg:pb-10">
      {/* Compact Top App Bar */}
      <header className="sticky top-0 z-30 h-14 bg-white/90 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-6">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center">
              <Fingerprint className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[#0A4572] whitespace-nowrap">
              MedZex AI
            </span>
          </div>

          {isAdmin && (
            <nav className="hidden lg:flex items-center gap-1.5">
              {(
                [
                  { id: 'scan', label: 'Biometric Scan', icon: Fingerprint },
                  { id: 'emergency', label: 'Emergency Triage', icon: Siren },
                  { id: 'enroll', label: 'Enroll Patient', icon: UserPlus },
                  { id: 'registry', label: 'Patient Registry', icon: ClipboardList },
                  { id: 'admin', label: 'Admin Vault', icon: ShieldCheck },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`min-h-[40px] px-3.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#0284C7] text-white'
                        : 'text-[#3f4850] hover:bg-[#eff4ff] hover:text-[#0b1c30]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden xl:inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A4572] px-3 py-1.5 rounded-full bg-[#eff4ff]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0284C7]" />
              {isAdmin ? `Admin · ${ADMIN_EMAIL}` : `Doctor · ${user.email}`}
            </span>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="min-h-[40px] px-3.5 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ShieldAlert className="w-4 h-4" />
                <span className="hidden sm:inline">Emergency Card</span>
                <span className="sm:hidden">SOS</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void signOut(auth)}
              aria-label="Sign out"
              className="min-h-[40px] min-w-[40px] rounded-full border border-[#E2E8F0] hover:bg-[#eff4ff] text-[#3f4850] flex items-center justify-center cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-7">
        {toastMessage && (
          <div
            role="status"
            className="mb-5 px-4 py-3 rounded-2xl bg-[#0b1c30] text-white text-xs sm:text-sm font-medium shadow-sm flex items-center justify-between gap-3"
          >
            <span>{toastMessage}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-xs text-[#93ccff] font-semibold cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {!isAdmin ? (
          <DoctorBiometricPortal
            userEmail={user.email || ''}
            doctorLinks={doctorLinks}
            onVerifyBiometricLink={handleVerifyBiometricLink}
            onLoadUnlockedDossier={handleLoadUnlockedDossier}
          />
        ) : (
          <>
            {activeTab === 'scan' && (
              <BiometricScanner
                patients={patients}
                onMatchFound={(patient, method) => void handleScanMatch(patient, method)}
                onEnrollUnknown={handleEnrollUnknown}
              />
            )}

            {activeTab === 'emergency' && (
              <EmergencyDossier
                patient={activePatient}
                assessments={assessments}
                auditLogs={auditLogs}
                medicalHistories={medicalHistories}
                senderEmail={user.email || ADMIN_EMAIL}
                onRunAiTriage={handleRunAiTriage}
                onNotifyContact={handleNotifyContact}
                onAddHistory={handleAddHistory}
                onDeleteHistory={handleDeleteHistory}
                onCreateDoctorLink={handleCreateDoctorLink}
                onGmailCopySent={async (sentPatient, recipientEmail) => {
                  await logAuditEvent(
                    sentPatient.id,
                    'RECORD_UPDATED',
                    `Sent clinical dossier copy via Gmail to ${recipientEmail} for ${sentPatient.mrn}.`,
                    sentPatient.fingerprintCode
                  );
                  showToast(`Clinical copy sent via Gmail to ${recipientEmail}`);
                }}
                onGoToScanner={() => setActiveTab('scan')}
                triageLoading={triageLoading}
                triageError={triageError}
                notifying={notifying}
              />
            )}

            {activeTab === 'enroll' && (
              <PatientEnrollment
                initialFingerprintCode={pendingFingerprint}
                initialMrn={pendingMrn}
                onEnrollPatient={handleEnrollPatient}
                saving={savingEnrollment}
              />
            )}

            {activeTab === 'registry' && (
              <PatientRegistry
                patients={patients}
                auditLogs={auditLogs}
                onOpenEmergency={(patient) => {
                  setActivePatientId(patient.id);
                  setActiveTab('emergency');
                }}
                onDeletePatient={handleDeletePatient}
                onGoToEnroll={() => {
                  setPendingFingerprint(null);
                  setPendingMrn(null);
                  setActiveTab('enroll');
                }}
              />
            )}

            {activeTab === 'admin' && (
              <AdminAccessPanel
                adminEmail={user.email || ADMIN_EMAIL}
                patients={patients}
                doctorLinks={doctorLinks}
                auditLogs={auditLogs}
                onCreateDoctorLink={handleCreateDoctorLink}
                onToggleLinkStatus={handleToggleLinkStatus}
                onResetBiometricVerification={handleResetBiometricVerification}
                onDeleteDoctorLink={handleDeleteDoctorLink}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile & Tablet Thumb-Zone Floating Navigation Dock (Admin Only) */}
      {isAdmin && (
        <nav
          aria-label="Primary Clinical Navigation"
          className="lg:hidden fixed bottom-3 left-3 right-3 z-40 max-w-xl mx-auto bg-white/95 backdrop-blur-md border border-[#E2E8F0] rounded-[2rem] shadow-[0_10px_15px_-3px_rgba(2,132,199,0.12)] px-2 py-1.5 grid grid-cols-5 gap-1"
        >
          {(
            [
              { id: 'scan', label: 'Scan', icon: Fingerprint },
              { id: 'emergency', label: 'Triage', icon: Siren },
              { id: 'enroll', label: 'Enroll', icon: UserPlus },
              { id: 'registry', label: 'Registry', icon: ClipboardList },
              { id: 'admin', label: 'Admin', icon: ShieldCheck },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[48px] rounded-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#0284C7] text-white'
                    : 'text-[#3f4850] hover:bg-[#eff4ff]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Quick-Release Emergency Drawer (Admin Only) */}
      {isAdmin && (
        <EmergencyDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          patient={activePatient}
          onOpenFullDossier={() => setActiveTab('emergency')}
          onNotifyContact={handleNotifyContact}
          notifying={notifying}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BioPulseWorkspace />
    </ErrorBoundary>
  );
}

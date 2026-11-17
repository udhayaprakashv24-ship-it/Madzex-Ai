# MedZex AI — Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Admin-Only Master Vault**: Only the verified administrator (`request.auth.token.email.lower() == 'udhayaprakashv.24@gmail.com'`) holds master read/list/create/update/delete access to `patients`, `medicalHistories`, `triageAssessments`, and `auditLogs`. Non-admin users cannot list or scrape any patient collection.
2. **Responder Identity & Anti-Privilege-Escalation**: Every `responders/{userId}` document can only be read, created, or updated by `request.auth.uid == userId`. Non-admin users are strictly forbidden from setting or updating `role` to `'ADMIN'`.
3. **Referential Integrity on Clinical Sub-Records**: A `triageAssessments`, `auditLogs`, `medicalHistories`, or `doctorBiometricLinks` document cannot be created without an existing parent `patients/{patientId}` owned by the admin.
4. **Doctor Biometric-to-Mail Isolation**: A `doctorBiometricLinks/{linkId}` document is created exclusively by the Admin for a specific `doctorEmail` and `patientId`. A doctor can list/read ONLY links matching their verified email (`request.auth.token.email.lower()`), and can ONLY update `biometricVerified` to `true` when `status == 'ACTIVE'`.
5. **Biometric Gate on Shared Dossier Vault**: A doctor can `get` `/patients/{patientId}` or `/doctorBiometricLinks/{linkId}/vault/clinicalDossier` ONLY if the corresponding link has `status == 'ACTIVE'` AND `biometricVerified == true`. List queries on `/vault` are completely disabled (`allow list: if false`).
6. **Accountability Audit Attribution**: Every `auditLogs` entry records immutable `actorEmail`, `actorName`, `actorRole`, and `fingerprintCode`. Doctors can append ONLY `DOCTOR_BIOMETRIC_MATCH` events tied to their own verified `ACTIVE` link (`ownerId == link.adminUid`, `actorEmail == request.auth.token.email.lower()`) and cannot read, list, update, or delete any `auditLogs`.
7. **Temporal & Schema Integrity**: Every timestamp (`createdAt`, `updatedAt`, `lastScannedAt`) must equal `request.time` on write; `createdAt` and `ownerId`/`adminUid` are immutable; all payloads pass strict `hasAll()` + `hasOnly()` + type/size checks.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)

1. **Unauthenticated Patient Read**: `GET /patients/p1` with `auth = null`.
2. **Unverified Admin Email Spoof**: `LIST /patients` with `auth.token.email = 'udhayaprakashv.24@gmail.com'` and `auth.token.email_verified = false`.
3. **Non-Admin Patient List**: `LIST /patients` by a signed-in doctor (`doctor@gmail.com`) attempting to browse all patients.
4. **Non-Admin Patient Create**: `CREATE /patients/p1` by a signed-in non-admin user trying to enroll a patient into the master vault.
5. **Self-Assigned Admin Escalation**: `CREATE /responders/uid1` with `role: 'ADMIN'` when `auth.token.email = 'attacker@gmail.com'`.
6. **Pre-Biometric Patient Read**: `GET /patients/p1` or `GET /doctorBiometricLinks/p1__dr_gmail_com/vault/clinicalDossier` when `biometricVerified == false`.
7. **Revoked Doctor Link Read**: `GET /doctorBiometricLinks/p1__dr_gmail_com/vault/clinicalDossier` when `status == 'REVOKED'`.
8. **Doctor Tampering With Link Target**: `UPDATE /doctorBiometricLinks/p1__dr_gmail_com` by doctor attempting to change `patientId` or `doctorEmail`.
9. **Cross-Doctor Link Enumeration**: `LIST /doctorBiometricLinks` querying without `doctorEmail == request.auth.token.email.lower()`.
10. **Vault Subcollection Scraping**: `LIST /doctorBiometricLinks/p1__dr_gmail_com/vault` attempting to list vault documents.
11. **Shadow Field Injection**: `CREATE /doctorBiometricLinks/l1` including `"bypassBiometric": true`.
12. **Client-Forged Timestamp**: `CREATE /medicalHistories/h1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.

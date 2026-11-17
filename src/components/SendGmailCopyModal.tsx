import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Mail,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ADMIN_EMAIL } from '../lib/adminConfig';
import { getCachedGmailAccessToken } from '../lib/firebase';
import {
  DEFAULT_EMAIL_SECTIONS,
  formatPatientCopyEmailBody,
  sendPatientCopyViaGmail,
  type PatientEmailCopyPayload,
  type PatientEmailSections,
} from '../lib/gmailClient';

interface SendGmailCopyModalProps {
  open: boolean;
  onClose: () => void;
  senderEmail: string;
  defaultRecipient?: string;
  patient: PatientEmailCopyPayload;
  onSent?: (recipientEmail: string) => Promise<void> | void;
}

export function SendGmailCopyModal({
  open,
  onClose,
  senderEmail,
  defaultRecipient,
  patient,
  onSent,
}: SendGmailCopyModalProps) {
  const initialRecipient = (defaultRecipient || senderEmail || ADMIN_EMAIL).trim().toLowerCase();
  const [recipientEmail, setRecipientEmail] = useState(initialRecipient);
  const [personalNote, setPersonalNote] = useState('');
  const [sections, setSections] = useState<PatientEmailSections>(DEFAULT_EMAIL_SECTIONS);
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{
    recipient: string;
    messageId: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setRecipientEmail((defaultRecipient || senderEmail || ADMIN_EMAIL).trim().toLowerCase());
      setPersonalNote('');
      setSections(DEFAULT_EMAIL_SECTIONS);
      setShowPreview(false);
      setError(null);
      setSentResult(null);
    }
  }, [open, defaultRecipient, senderEmail, patient.mrn]);

  const { subject, bodyText } = useMemo(
    () =>
      formatPatientCopyEmailBody(
        patient,
        senderEmail || ADMIN_EMAIL,
        personalNote,
        sections
      ),
    [patient, senderEmail, personalNote, sections]
  );

  const quickRecipients = useMemo(() => {
    const candidates = [senderEmail, ADMIN_EMAIL]
      .map((val) => val.trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(candidates));
  }, [senderEmail]);

  if (!open) return null;

  const hasCachedToken = Boolean(getCachedGmailAccessToken());
  const cleanRecipient = recipientEmail.trim().toLowerCase();
  const isRecipientValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecipient);

  const handleConfirmSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRecipientValid) {
      setError('Enter a valid recipient Gmail or email address.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const result = await sendPatientCopyViaGmail({
        recipientEmail: cleanRecipient,
        senderEmail: senderEmail || ADMIN_EMAIL,
        patient,
        personalNote,
        sections,
      });
      setSentResult({ recipient: cleanRecipient, messageId: result.messageId });
      if (onSent) {
        await onSent(cleanRecipient);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to dispatch patient copy via Gmail API.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1c30]/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-gmail-modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-[2rem] border border-[#E2E8F0] shadow-[0_24px_48px_-12px_rgba(11,28,48,0.28)] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#E2E8F0] bg-[#f8f9ff] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#eff4ff] text-[#0284C7] flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 id="send-gmail-modal-title" className="text-lg font-bold text-[#0b1c30]">
                Confirm Gmail Copy Dispatch
              </h2>
              <p className="text-xs text-[#3f4850]">
                Review recipient and clinical payload before sending via Gmail API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Gmail dispatch dialog"
            className="min-h-[44px] min-w-[44px] rounded-full border border-[#E2E8F0] bg-white hover:bg-[#eff4ff] text-[#3f4850] flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {sentResult ? (
            <div className="space-y-4">
              <div className="p-5 rounded-3xl bg-[#D1FAE5]/60 border border-[#059669]/25 flex items-start gap-3.5">
                <CheckCircle2 className="w-6 h-6 text-[#059669] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-[#0b1c30]">
                    Patient Clinical Copy Sent via Gmail
                  </h3>
                  <p className="text-sm text-[#3f4850]">
                    Dispatched formatted emergency dossier for{' '}
                    <span className="font-semibold text-[#0b1c30]">{patient.fullName}</span> (
                    <span className="font-mono">{patient.mrn}</span>) to{' '}
                    <span className="font-mono font-semibold text-[#0A4572]">
                      {sentResult.recipient}
                    </span>
                    .
                  </p>
                  <p className="text-xs font-mono text-[#059669] tabular-nums pt-1">
                    Gmail Message ID: {sentResult.messageId}
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[46px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form id="gmail-copy-form" onSubmit={(e) => void handleConfirmSend(e)} className="space-y-4">
              {/* Non-Destructive / Protected Account Guarantee */}
              <div className="p-3.5 rounded-2xl bg-[#eff4ff] border border-[#0284C7]/20 flex items-start gap-2.5 text-xs text-[#0A4572]">
                <ShieldCheck className="w-4 h-4 text-[#0284C7] shrink-0 mt-0.5" />
                <div className="space-y-0.5 leading-relaxed">
                  <p className="font-bold text-[#0b1c30]">
                    Read-Only Copy — Your Gmail ID &amp; Records Stay Unchanged
                  </p>
                  <p className="text-[#3f4850]">
                    Sending a clinical copy to any recipient Gmail ID will{' '}
                    <span className="font-semibold text-[#0b1c30]">not</span> alter your signed-in
                    Gmail ID (<span className="font-mono">{senderEmail || ADMIN_EMAIL}</span>),
                    modify stored patient data, or grant database access to the recipient.
                  </p>
                </div>
              </div>

              {/* Recipient Input */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="gmail-recipient-input"
                    className="text-xs font-bold uppercase tracking-wider text-[#0A4572]"
                  >
                    Recipient Gmail / Email (To:)
                  </label>
                  {recipientEmail && (
                    <button
                      type="button"
                      onClick={() => setRecipientEmail('')}
                      className="text-xs font-semibold text-[#0284C7] hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Send to Another Gmail ID
                    </button>
                  )}
                </div>
                <input
                  id="gmail-recipient-input"
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="Enter any recipient Gmail ID (e.g. doctor@gmail.com)"
                  className="mt-1.5 w-full h-12 px-4 rounded-full border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-sm font-mono"
                />

                {quickRecipients.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-[#707881]">Quick fill:</span>
                    {quickRecipients.map((addr) => (
                      <button
                        key={addr}
                        type="button"
                        onClick={() => setRecipientEmail(addr)}
                        className={`min-h-[34px] px-3 rounded-full text-xs font-mono font-semibold transition-colors cursor-pointer ${
                          cleanRecipient === addr
                            ? 'bg-[#0284C7] text-white'
                            : 'bg-[#eff4ff] text-[#0A4572] hover:bg-[#dce9ff]'
                        }`}
                      >
                        {addr}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional Handoff Note */}
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0A4572]">
                  Optional Clinical Handoff Note
                </span>
                <textarea
                  rows={2}
                  maxLength={400}
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                  placeholder="e.g., Trauma Bay 2 handoff copy — review anticoagulants and penicillin allergy."
                  className="mt-1.5 w-full p-3.5 rounded-2xl border-[1.5px] border-[#CBD5E1] focus:border-[#0284C7] focus:outline-none text-xs sm:text-sm"
                />
              </label>

              {/* Explicit Confirmation & Section Selection Summary */}
              <div className="p-4 rounded-2xl bg-[#f8f9ff] border border-[#dce9ff] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0A4572]">
                    Included Snapshot Sections
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      hasCachedToken ? 'text-[#059669]' : 'text-[#92400E]'
                    }`}
                  >
                    {hasCachedToken
                      ? 'Gmail send permission active'
                      : 'Google popup will confirm Gmail send permission for your account'}
                  </span>
                </div>

                <div className="text-xs text-[#3f4850] space-y-1">
                  <p>
                    <span className="font-semibold text-[#0b1c30]">Subject:</span> {subject}
                  </p>
                  <p>
                    <span className="font-semibold text-[#0b1c30]">To:</span>{' '}
                    <span className="font-mono">{cleanRecipient || 'Enter recipient Gmail ID'}</span>
                    <span className="text-[#707881]"> · </span>
                    <span className="font-semibold text-[#0b1c30]">Signed-in Sender:</span>{' '}
                    <span className="font-mono">{senderEmail || ADMIN_EMAIL}</span>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="px-3 py-2 rounded-xl bg-white border border-[#E2E8F0] text-[#0b1c30] font-semibold flex items-center justify-between">
                    <span>Identity &amp; Blood {patient.bloodType}</span>
                    <span className="text-[11px] text-[#707881]">Required</span>
                  </div>

                  {(
                    [
                      {
                        key: 'allergiesAndAlerts',
                        label: `${patient.allergies.length} Allergies · ${patient.criticalAlerts.length} Alerts`,
                      },
                      {
                        key: 'medicationsAndConditions',
                        label: `${patient.medications.length} Meds · ${patient.conditions.length} Conditions`,
                      },
                      {
                        key: 'medicalHistory',
                        label: `${patient.histories.length} Historical Record${patient.histories.length === 1 ? '' : 's'}`,
                      },
                      {
                        key: 'emergencyContact',
                        label: `Emergency Contact (${patient.emergencyContactName})`,
                      },
                      ...(patient.latestTriage
                        ? [
                            {
                              key: 'latestTriage' as const,
                              label: `AI Triage ESI ${patient.latestTriage.esiLevel}`,
                            },
                          ]
                        : []),
                    ] as Array<{ key: keyof PatientEmailSections; label: string }>
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="px-3 py-2 rounded-xl bg-white border border-[#E2E8F0] hover:border-[#0284C7]/50 text-[#0A4572] font-semibold flex items-center gap-2 cursor-pointer tabular-nums"
                    >
                      <input
                        type="checkbox"
                        checked={sections[item.key]}
                        onChange={(e) =>
                          setSections((prev) => ({
                            ...prev,
                            [item.key]: e.target.checked,
                          }))
                        }
                        className="w-4 h-4 accent-[#0284C7] rounded cursor-pointer shrink-0"
                      />
                      <span className="truncate">{item.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-[#707881]">
                  Unchecking a section excludes it from this outgoing email only — stored database information is never affected.
                </p>

                <button
                  type="button"
                  onClick={() => setShowPreview((prev) => !prev)}
                  className="min-h-[36px] px-3 rounded-full bg-white border border-[#CBD5E1] hover:bg-[#eff4ff] text-xs font-semibold text-[#0A4572] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {showPreview ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      Hide Exact Email Text
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Preview Exact Email Text
                    </>
                  )}
                </button>

                {showPreview && (
                  <pre className="p-3.5 rounded-2xl bg-white border border-[#E2E8F0] text-[11px] leading-relaxed font-mono text-[#0b1c30] whitespace-pre-wrap max-h-56 overflow-y-auto">
                    {bodyText}
                  </pre>
                )}
              </div>

              {error && (
                <div className="p-3.5 rounded-2xl bg-[#FEE2E2] text-[#93000a] text-xs font-medium">
                  {error}
                </div>
              )}

              {/* Explicit Confirm & Cancel Actions */}
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={sending}
                  className="min-h-[46px] px-5 rounded-full border border-[#CBD5E1] bg-white hover:bg-[#f8f9ff] text-[#3f4850] text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !isRecipientValid}
                  className="min-h-[46px] px-6 rounded-full bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  {sending ? 'Sending Copy via Gmail...' : 'Confirm & Send via Gmail'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

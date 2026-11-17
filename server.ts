import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

interface TriageRequestBody {
  patient: {
    fullName: string;
    age: number;
    sex: string;
    bloodType: string;
    allergies: string[];
    medications: string[];
    conditions: string[];
    criticalAlerts: string[];
    dnrStatus: boolean;
  };
  medicalHistory?: Array<{
    eventDate: string;
    category: string;
    title: string;
    facility: string;
    notes: string;
  }>;
  vitals: {
    heartRate: number;
    spo2: number;
    bpSystolic: number;
    bpDiastolic: number;
    gcsScore: number;
    chiefComplaint: string;
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'medzex-ai' });
  });

  app.post('/api/triage/analyze', async (req, res) => {
    if (!ai) {
      res.status(503).json({
        error: 'Gemini AI triage service is not configured. Please ensure GEMINI_API_KEY is set in Secrets.',
      });
      return;
    }

    const body = req.body as TriageRequestBody | undefined;
    if (!body?.patient || !body?.vitals) {
      res.status(400).json({ error: 'Missing patient profile or vital signs payload.' });
      return;
    }

    const { patient, vitals, medicalHistory = [] } = body;

    const historyLines =
      medicalHistory.length > 0
        ? medicalHistory
            .slice(0, 10)
            .map((h) => `- [${h.eventDate} | ${h.category}] ${h.title} (${h.facility}): ${h.notes}`)
        : ['No prior hospitalizations or surgical history recorded.'];

    const prompt = [
      'You are an emergency medicine clinical decision support synthesizer assisting paramedics and ER trauma teams with an unconscious or incapacitated patient identified via biometric fingerprint scan.',
      'Analyze the patient medical history, historical surgeries/hospitalizations, and current vital signs below, and return a concise, high-precision emergency triage assessment.',
      '',
      `Patient: ${patient.fullName}, Age ${patient.age}, Sex ${patient.sex}, Blood Type ${patient.bloodType}`,
      `DNR Status: ${patient.dnrStatus ? 'ACTIVE DNR ON FILE' : 'Full Code'}`,
      `Critical Alerts: ${patient.criticalAlerts.length > 0 ? patient.criticalAlerts.join('; ') : 'None recorded'}`,
      `Allergies: ${patient.allergies.length > 0 ? patient.allergies.join('; ') : 'No known drug allergies'}`,
      `Current Medications: ${patient.medications.length > 0 ? patient.medications.join('; ') : 'None recorded'}`,
      `Chronic Conditions: ${patient.conditions.length > 0 ? patient.conditions.join('; ') : 'None recorded'}`,
      '',
      'Historical Clinical Records (Past Surgeries, Hospitalizations, Baseline Labs):',
      ...historyLines,
      '',
      'Current Field Vitals:',
      `- Heart Rate: ${vitals.heartRate} bpm`,
      `- SpO2: ${vitals.spo2}%`,
      `- Blood Pressure: ${vitals.bpSystolic}/${vitals.bpDiastolic} mmHg`,
      `- Glasgow Coma Scale (GCS): ${vitals.gcsScore}/15`,
      `- Presentation / Chief Complaint: ${vitals.chiefComplaint}`,
      '',
      'Provide:',
      '1. esiLevel (integer 1 to 5, where 1 = immediate resuscitation, 2 = emergent/high risk, 3 = urgent, 4 = less urgent, 5 = non-urgent).',
      '2. clinicalSynopsis (2 to 3 concise sentences linking their medical history, active medications, and current vitals for immediate ER handoff).',
      '3. immediateActions (3 to 5 prioritized, concrete stabilization steps for paramedics/ER).',
      '4. contraindications (list of specific medications or interventions to strictly avoid based on allergies, anticoagulants, implants, or vitals).',
    ].join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Output strictly valid JSON matching the requested schema. Keep recommendations clinically accurate, concise, and tailored for rapid emergency room triage.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              esiLevel: {
                type: Type.INTEGER,
                description: 'Emergency Severity Index level from 1 (most critical) to 5.',
              },
              clinicalSynopsis: {
                type: Type.STRING,
                description: 'Concise 2-3 sentence clinical handoff summary.',
              },
              immediateActions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 to 5 prioritized emergency stabilization actions.',
              },
              contraindications: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Medications or procedures contraindicated by patient history.',
              },
            },
            required: ['esiLevel', 'clinicalSynopsis', 'immediateActions', 'contraindications'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Empty response received from Gemini triage model.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        esiLevel?: number;
        clinicalSynopsis?: string;
        immediateActions?: string[];
        contraindications?: string[];
      };

      const esiLevel = Math.min(5, Math.max(1, Math.round(Number(parsed.esiLevel) || 2)));
      const clinicalSynopsis = String(parsed.clinicalSynopsis || '').slice(0, 1500);
      const immediateActions = Array.isArray(parsed.immediateActions)
        ? parsed.immediateActions.map((s) => String(s)).filter(Boolean).slice(0, 10)
        : ['Maintain airway and continuous telemetry monitoring.'];
      const contraindications = Array.isArray(parsed.contraindications)
        ? parsed.contraindications.map((s) => String(s)).filter(Boolean).slice(0, 10)
        : [];

      res.json({
        esiLevel,
        clinicalSynopsis,
        immediateActions:
          immediateActions.length > 0
            ? immediateActions
            : ['Maintain airway and continuous telemetry monitoring.'],
        contraindications,
      });
    } catch (err) {
      console.error('Gemini Triage Error:', err);
      const message = err instanceof Error ? err.message : 'Failed to generate AI triage assessment.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        watch: hmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MedZex AI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MedZex AI server:', err);
  process.exit(1);
});

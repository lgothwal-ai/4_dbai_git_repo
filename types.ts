
export type Role = 'patient' | 'doctor' | 'admin';

export type Priority = 'Normal' | 'Priority' | 'Emergency';

export interface MediaItem {
  media_id: string;
  url: string; // Simplified for frontend blob/url
  type: 'image' | 'video';
  vision_findings?: string;
  confidence?: number;
}

export interface TriageSummary {
  patient_id: string | null;
  presenting_complaint: string;
  system_involved: string | null;
  onset: string | null;
  duration_days: number | null;
  severity_scale_1_10: number | null;
  associated_symptoms: string[];
  comorbidities: string[];
  medications: string[];
  allergies: string[];
  red_flags: string[];
  media: MediaItem[];
  priority: Priority;
  language: string;
  conversation_summary: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  choices?: string[]; // Suggestion chips
  timestamp: number;
}

export interface Session {
  id:string;
  patientId: number;
  visitId: number; // New: To link to backend visit record
  patientName: string;
  patientPhone?: string;
  patientToken: string;
  visitDate: string;
  startTime: number;     // Arrival Time (Check-in)
  consultationStartTime?: number;
  endTime?: number;
  status: 'triage' | 'waiting' | 'assigned' | 'in_cabin' | 'seen';
  messages: Message[];
  summary?: TriageSummary;
  assignedDoctorId?: string;
}


export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  currentLoad: number;
  status: 'active' | 'break' | 'offline';
}

export interface QueueMetrics {
  arrivalRate: number; // lambda
  serviceRate: number; // mu
  trafficIntensity: number; // rho
  avgWaitTime: number; // Wq
}

export interface DoctorInsights {
  differentialDiagnoses: string[];
  recommendedActions: string[];
  followUpQuestions: string[];
}
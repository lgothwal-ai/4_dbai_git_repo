
import { Session, TriageSummary, Message, Doctor } from '../types';
import { getSimulationClockInstance } from '../hooks/useSimulationClock';
import { determineMedicalSpecialty } from './gemini';

// --- Types ---

export interface APIVisit {
    id: number;
    patient_id: number;
    patient_name: string; // Added for UI convenience
    status: string;
    check_in_time: string;
    consult_start_time?: string;
    end_time?: string;
    presenting_complaint: string;
    priority: string;
    triage_summary: TriageSummary;
    transcript: Message[];
    assigned_doctor_id?: string;
    ai_assigned_specialty?: string; // New field for transparency
}

export interface APIDiagnosis {
    id: number;
    doctor_notes: string;
    discharge_summary?: string;
    timestamp: string;
}

export interface APIPatientHistory {
    visit: APIVisit;
    diagnosis: APIDiagnosis | null;
}

// --- Mock Store ---

interface MockPatient {
    id: number;
    name: string;
    phone?: string;
}

interface MockVisit extends Omit<APIVisit, 'patient_name'> {
    diagnosis?: APIDiagnosis;
}

// --- Intelligent Assignment Engine (Robust Upgrade) ---

const MISMATCH_PENALTY = 10000;
const LOAD_PENALTY_WEIGHT = 300; // 5 minutes per patient above average
const AVG_SERVICE_TIME = 900; // 15 minutes

/**
 * Robust Assignment Logic:
 * Instead of guessing specialty from keywords, we trust the AI's semantic analysis.
 * 
 * @param targetSpecialty The specialty identified by Gemini (e.g. "Neurology")
 * @param priority The triage priority (Normal/Priority/Emergency)
 */
const findBestDoctor = (targetSpecialty: string, priority: string): Doctor | null => {
    const activeDoctors = doctors.filter(d => d.status === 'active');
    if (activeDoctors.length === 0) return null;

    // Emergency Override: Logic prioritization changes to Speed > Accuracy
    if (priority === 'Emergency') {
        const avgLoad = activeDoctors.reduce((acc, d) => acc + d.currentLoad, 0) / activeDoctors.length;
        const lessBusy = activeDoctors.filter(d => d.currentLoad <= avgLoad);
        const candidates = lessBusy.length > 0 ? lessBusy : activeDoctors;

        let bestMatch: Doctor | null = null;
        for (const doc of candidates) {
            // Direct exact match check
            if (doc.specialty.toLowerCase() === targetSpecialty.toLowerCase()) {
                if (!bestMatch || doc.currentLoad < bestMatch.currentLoad) {
                    bestMatch = doc;
                }
            }
        }
        // If no specialist match is available immediately, take the least busy doctor (Robust Fallback)
        return bestMatch || candidates.sort((a, b) => a.currentLoad - b.currentLoad)[0];
    }

    // Standard Logic: Cost Minimization Function
    const avgLoad = activeDoctors.reduce((acc, d) => acc + d.currentLoad, 0) / activeDoctors.length;
    let bestDoctor: Doctor | null = null;
    let minCost = Infinity;

    for (const doc of activeDoctors) {
        // 1. Specialty Mismatch Cost (Semantic Match)
        const isMatch = doc.specialty.toLowerCase() === targetSpecialty.toLowerCase();
        const mismatchCost = isMatch ? 0 : MISMATCH_PENALTY;

        // 2. Estimated Wait Time Cost
        const estimatedWait = doc.currentLoad * AVG_SERVICE_TIME;

        // 3. Load Balance Cost
        const loadPenalty = Math.max(0, doc.currentLoad - avgLoad) * LOAD_PENALTY_WEIGHT;

        const totalCost = mismatchCost + estimatedWait + loadPenalty;

        if (totalCost < minCost) {
            minCost = totalCost;
            bestDoctor = doc;
        }
    }
    return bestDoctor || activeDoctors[0]; // Absolute fallback
};


// Doctor Data
let doctors: Doctor[] = [
    { id: 'd_1', name: 'Dr. A. House', specialty: 'Internal Medicine', currentLoad: 0, status: 'active' },
    { id: 'd_2', name: 'Dr. M. Grey', specialty: 'General Surgery', currentLoad: 0, status: 'active' },
    { id: 'd_3', name: 'Dr. S. Strange', specialty: 'Neurology', currentLoad: 0, status: 'active' },
    { id: 'd_4', name: 'Dr. J. Dorian', specialty: 'Internal Medicine', currentLoad: 0, status: 'active' },
    { id: 'd_5', name: 'Dr. D. Shepherd', specialty: 'Neurosurgery', currentLoad: 0, status: 'break' },
    { id: 'd_6', name: 'Dr. L. Cuddy', specialty: 'Endocrinology', currentLoad: 0, status: 'active' },
];

// Initial Data Setup - STARTS EMPTY
let patients: MockPatient[] = [];
let visits: MockVisit[] = [];

let nextPatientId = 101;
let nextVisitId = 1;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const clock = getSimulationClockInstance();

// --- Exported API Functions ---

export const getDoctors = async (): Promise<Doctor[]> => {
    await delay(50); // Faster polling
    return JSON.parse(JSON.stringify(doctors)); // Return deep copy
};

export const addDoctor = async (name: string, specialty: string, status: Doctor['status']): Promise<Doctor> => {
    await delay(500);
    const newDoctor: Doctor = {
        id: `d_${doctors.length + 1 + Math.random()}`,
        name,
        specialty,
        status,
        currentLoad: 0
    };
    doctors.push(newDoctor);
    return newDoctor;
};


export const updateDoctorStatus = async (doctorId: string, status: 'active' | 'break' | 'offline') => {
    await delay(300);
    const doctor = doctors.find(d => d.id === doctorId);
    if (doctor) {
        doctor.status = status;
    }
    return doctor;
};

export const createPatient = async (name: string, phone?: string) => {
    // Small delay for realism, but minimal
    await delay(20);
    const newPatient = { id: nextPatientId++, name, phone };
    patients.push(newPatient);
    return newPatient;
};

export const beginVisit = async (patientId: number, timestampOverride?: string): Promise<APIVisit> => {
    await delay(20);
    const patient = patients.find(p => p.id === patientId);
    if (!patient) throw new Error("Patient not found for new visit");

    const newVisit: MockVisit = {
        id: nextVisitId++,
        patient_id: patientId,
        status: 'triage',
        check_in_time: timestampOverride || clock.getISOString(),
        presenting_complaint: 'In Triage...',
        priority: 'Normal', // Default until assessed
        triage_summary: {} as TriageSummary, // Empty for now
        transcript: [], // Empty for now
    };
    visits.push(newVisit);
    return {
        ...newVisit,
        patient_name: patient.name,
    };
};

export const finalizeTriage = async (
    visitId: number,
    summary: TriageSummary,
    transcript: Message[],
    preCalculatedSpecialty?: string
) => {
    const visit = visits.find(v => v.id === visitId);
    if (!visit) throw new Error("Visit not found to finalize");

    // 1. Determine specialty
    // If pre-calculated (during backlog generation), use it to skip AI latency.
    let routingResult;
    if (preCalculatedSpecialty) {
        routingResult = { specialty: preCalculatedSpecialty, confidence: 1.0 };
    } else {
        routingResult = await determineMedicalSpecialty(
            summary.presenting_complaint,
            summary.conversation_summary
        );
    }

    console.log(`[Triage] Patient #${visitId} routed to: ${routingResult.specialty} (Confidence: ${routingResult.confidence})`);

    // Update visit details
    visit.status = 'waiting';
    visit.presenting_complaint = summary.presenting_complaint;
    visit.priority = summary.priority;
    visit.triage_summary = summary;
    visit.transcript = transcript;
    visit.ai_assigned_specialty = routingResult.specialty;

    // 2. Pass the specialty to the assignment engine
    const assignedDoctor = findBestDoctor(routingResult.specialty, summary.priority);

    if (assignedDoctor) {
        assignedDoctor.currentLoad++;
        visit.assigned_doctor_id = assignedDoctor.id;
    } else {
        // Fallback if absolutely no doctor is returned (unlikely given fallback logic in findBestDoctor)
        console.warn("No doctor found for assignment!");
    }

    return {
        ...visit,
        patient_name: patients.find(p => p.id === visit.patient_id)?.name || 'Unknown'
    };
};

export const getTodaysVisits = async (): Promise<APIVisit[]> => {
    await delay(50); // Faster polling
    return visits.map(v => ({
        ...v,
        patient_name: patients.find(p => p.id === v.patient_id)?.name || 'Unknown',
    }));
};

export const getPatientHistory = async (patientId: number): Promise<APIPatientHistory[]> => {
    await delay(500);
    // Find all visits for this patient, excluding the current one if it's not 'seen' yet.
    const pVisits = visits.filter(v => v.patient_id === patientId && v.status === 'seen');
    return pVisits.map(v => ({
        visit: {
            ...v,
            patient_name: patients.find(p => p.id === v.patient_id)?.name || 'Unknown'
        },
        diagnosis: v.diagnosis || null
    })).sort((a, b) => new Date(b.visit.check_in_time).getTime() - new Date(a.visit.check_in_time).getTime());
};

export const updateVisitStatus = async (visitId: number, status: string, updates: any = {}) => {
    await delay(300);
    const visit = visits.find(v => v.id === visitId);
    if (!visit) throw new Error("Visit not found");

    visit.status = status;
    if (status === 'in_cabin' && !visit.consult_start_time) {
        visit.consult_start_time = clock.getISOString();
    }
    if (status === 'seen') {
        visit.end_time = clock.getISOString();
    }
    Object.assign(visit, updates);
    return {
        ...visit,
        patient_name: patients.find(p => p.id === visit.patient_id)?.name || 'Unknown'
    };
};

export const submitDiagnosis = async (visitId: number, doctorName: string, notes: string) => {
    await delay(600);
    const visit = visits.find(v => v.id === visitId);
    if (!visit) throw new Error("Visit not found");

    visit.diagnosis = {
        id: Date.now(),
        doctor_notes: notes,
        discharge_summary: `Discharged by ${doctorName}. Notes: ${notes}`,
        timestamp: clock.getISOString()
    };
    visit.status = 'seen';
    visit.end_time = clock.getISOString();

    // Decrement doctor's load
    if (visit.assigned_doctor_id) {
        const doctor = doctors.find(d => d.id === visit.assigned_doctor_id);
        if (doctor) {
            doctor.currentLoad = Math.max(0, doctor.currentLoad - 1);
        }
    }

    return visit.diagnosis;
};

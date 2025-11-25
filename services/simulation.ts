
import { createPatient, beginVisit, finalizeTriage } from './api';
import { generateTriageSummary } from './gemini';
import { Message, TriageSummary } from '../types';

// A pool of realistic patient scenarios to simulate arrivals
// Added explicit 'specialty' field to optimize the backlog generation (skipping AI calls)
const patientScenarios = [
    { name: 'Ethan Hunt', complaint: 'I have a deep cut on my forearm from a piece of glass.', specialty: 'General Surgery' },
    { name: 'Sarah Connor', complaint: 'Severe migraine headache that started this morning, I feel nauseous.', specialty: 'Neurology' },
    { name: 'John Wick', complaint: 'My back is in severe pain after lifting a heavy object.', specialty: 'Internal Medicine' },
    { name: 'Ellen Ripley', complaint: 'I have a high fever, a bad cough, and I am having trouble breathing.', specialty: 'Internal Medicine' },
    { name: 'James Bond', complaint: 'I am experiencing sharp, crushing chest pain that is radiating to my left arm.', specialty: 'Cardiology' },
    { name: 'Diana Prince', complaint: 'I twisted my ankle, it is swollen and I cannot put weight on it.', specialty: 'General Surgery' },
    { name: 'Tony Stark', complaint: 'Feeling dizzy and have had heart palpitations for the last hour.', specialty: 'Cardiology' },
    { name: 'Bruce Wayne', complaint: 'I think I might have a concussion after a fall.', specialty: 'Neurology' },
    { name: 'Clark Kent', complaint: 'I have a persistent rash on my arm that is very itchy.', specialty: 'Internal Medicine' },
    { name: 'Natasha Romanoff', complaint: 'Sudden, severe abdominal pain on my right side.', specialty: 'General Surgery' },
    { name: 'Peter Parker', complaint: 'I was stung by something and I am having an allergic reaction.', specialty: 'Internal Medicine' },
    { name: 'Wanda Maximoff', complaint: 'Feeling extremely fatigued and have a sore throat.', specialty: 'Internal Medicine' },
    { name: 'Steve Rogers', complaint: 'I have a throbbing headache and my vision is blurry.', specialty: 'Neurology' },
    { name: 'Thor Odinson', complaint: 'I hurt my shoulder swinging a hammer, it feels dislocated.', specialty: 'General Surgery' },
    { name: 'Jean Grey', complaint: 'I am constantly thirsty and urinating frequently.', specialty: 'Endocrinology' },
    { name: 'Scott Summers', complaint: 'My eyes are burning and I have a severe headache behind them.', specialty: 'Neurology' }
];

let patientIndex = 0;

// Helper to get a specific time for today
const getTodayAtTime = (hour: number, minute: number): number => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).getTime();
};

/**
 * Simulates a complete patient journey from arrival to triage completion.
 * @param name The patient's name.
 * @param complaint The patient's presenting complaint.
 * @param timestampOverride Optional: If provided, the visit uses this time instead of "now".
 * @param knownSpecialty Optional: If provided, skips the AI specialty check (used for backlog).
 */
const simulatePatientJourney = async (name: string, complaint: string, timestampOverride?: number, knownSpecialty?: string) => {
    try {
        const timeLog = timestampOverride ? new Date(timestampOverride).toLocaleTimeString() : "LIVE";
        console.log(`SIMULATION [${timeLog}]: Patient ${name} is arriving...`);
        
        // 1. Patient "walks in" - create a record
        const patient = await createPatient(name);
        
        // 2. Patient starts kiosk - create a visit record with "triage" status
        const visitTime = timestampOverride ? new Date(timestampOverride).toISOString() : undefined;
        const visit = await beginVisit(patient.id, visitTime);
        
        // 3. Simulate time it takes to complete triage
        // If it's a backlog item, we skip the waiting time delay for instant load.
        if (!timestampOverride) {
             const triageDuration = 90000 + Math.random() * 90000;
             await new Promise(resolve => setTimeout(resolve, triageDuration));
        }

        // 4. Generate a clinical summary 
        // For backlog items, we mock the transcript timestamp to match arrival
        const transcriptTime = timestampOverride || Date.now();
        const mockTranscript: Message[] = [
            { id: 'sim-1', role: 'assistant', text: 'Hello, what is the main reason for your visit today?', timestamp: transcriptTime },
            { id: 'sim-2', role: 'user', text: complaint, timestamp: transcriptTime + 1000 }
        ];

        // Construct a basic summary. For the backlog, we skip the AI generation step to be instant,
        // relying on the known scenarios. For live patients, we could call generateTriageSummary,
        // but to keep simulation stable and consistent, we'll construct a valid summary object.
        const summary: TriageSummary = {
            patient_id: patient.id.toString(),
            presenting_complaint: complaint,
            system_involved: 'Unknown',
            onset: 'Today',
            duration_days: 0,
            severity_scale_1_10: 5,
            associated_symptoms: [],
            comorbidities: [],
            medications: [],
            allergies: [],
            red_flags: [],
            media: [],
            priority: (complaint.includes('chest') || complaint.includes('breathing')) ? 'Emergency' : 'Normal',
            language: 'en',
            conversation_summary: `Patient reports: ${complaint}`
        };
        
        // 5. Triage is complete, finalize the record and enter the queue
        // We pass the knownSpecialty to skip the AI routing call in API if it's a backlog item.
        await finalizeTriage(visit.id, summary, mockTranscript, knownSpecialty);
        console.log(`SIMULATION [${timeLog}]: ${name} finished triage -> WAITING.`);

    } catch (error) {
        console.error(`Simulation error for patient ${name}:`, error);
    }
};

/**
 * Generates a backlog of patients who "arrived" between 7:30 AM and 8:00 AM.
 * This runs instantly on app start so the clinic is populated when the clock starts at 8:00.
 */
const generateBacklog = async () => {
    console.log("Initializing Clinic Backlog (7:30 AM - 8:00 AM)...");
    const startMs = getTodayAtTime(7, 30);
    const endMs = getTodayAtTime(8, 0);
    
    const TARGET_PATIENT_COUNT = 16;
    const totalDuration = endMs - startMs;
    // Calculate strict interval to fit exactly 16 patients in 30 mins
    const interval = totalDuration / TARGET_PATIENT_COUNT;

    for (let i = 0; i < TARGET_PATIENT_COUNT; i++) {
        if (patientIndex >= patientScenarios.length) patientIndex = 0;
        const scenario = patientScenarios[patientIndex++];
        
        // Calculate exact time slot + random jitter to make it look natural
        // Jitter is +/- 45 seconds
        const jitter = (Math.random() * 90000) - 45000;
        let visitTime = startMs + (i * interval) + jitter;

        // Clamp to ensure it stays within 7:30 - 8:00
        if (visitTime < startMs) visitTime = startMs;
        if (visitTime >= endMs) visitTime = endMs - 1000;
        
        // Run simulation for this past time
        // We await here to ensure they enter the queue in correct order (preserving IDs)
        await simulatePatientJourney(scenario.name, scenario.complaint, visitTime, scenario.specialty);
    }
    console.log(`Backlog generation complete. ${TARGET_PATIENT_COUNT} patients queued.`);
}

/**
 * Starts the continuous simulation of patients arriving at the clinic.
 */
export const startPatientSimulation = async () => {
    // 1. Populate the "past" history first
    await generateBacklog();

    console.log("Starting live patient simulation from 8:00 AM...");
    
    // 2. Start the live loop for new arrivals
    const scheduleNextPatient = () => {
        // Arrival interval between 60 and 120 seconds for a busy demo clinic
        const nextArrival = 60000 + Math.random() * 60000;
        
        setTimeout(() => {
            if (patientIndex >= patientScenarios.length) {
                patientIndex = 0; 
            }
            const scenario = patientScenarios[patientIndex++];
            // No timestamp override = use live time. No known specialty = use AI routing.
            simulatePatientJourney(scenario.name, scenario.complaint);
            
            scheduleNextPatient();
        }, nextArrival);
    };

    scheduleNextPatient();
};

import { GoogleGenAI, Type } from "@google/genai";
import { TriageSummary, Message, Priority, DoctorInsights } from "../types";

// NOTE: In a real production app, these calls would ideally happen server-side 
// to protect the API key and handle complex state.

const API_KEY = process.env.API_KEY || ''; 

// --- Robustness Utils ---

/**
 * A robust JSON parser that handles common AI formatting errors.
 * It strips Markdown code blocks and attempts to parse the raw JSON.
 */
const safeParseJSON = <T>(text: string): T | null => {
    if (!text) return null;
    try {
        // 1. Remove markdown code blocks (```json ... ```)
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '');
        
        // 2. Trim whitespace
        cleaned = cleaned.trim();

        // 3. Attempt parse
        return JSON.parse(cleaned) as T;
    } catch (e) {
        console.error("JSON Parse Error:", e, "Raw Text:", text);
        // Basic recovery: try to find the first '{' and last '}'
        try {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                return JSON.parse(text.substring(start, end + 1)) as T;
            }
        } catch (retryErr) {
            return null;
        }
        return null;
    }
};

// Mock summary for demo purposes if API key is missing
const MOCK_SUMMARY: TriageSummary = {
  patient_id: "P-12345",
  presenting_complaint: "Severe headache and light sensitivity",
  system_involved: "Neurological",
  onset: "2 hours ago",
  duration_days: 0,
  severity_scale_1_10: 8,
  associated_symptoms: ["Nausea", "Blurred vision"],
  comorbidities: ["Migraine history"],
  medications: ["Sumatriptan"],
  allergies: ["Penicillin"],
  red_flags: ["Sudden onset thunderclap"],
  media: [],
  priority: "Emergency",
  language: "en",
  conversation_summary: "Patient reports sudden severe headache starting 2 hours ago. Describes it as 'worst ever'. Associated with nausea."
};

const MOCK_INSIGHTS: DoctorInsights = {
    differentialDiagnoses: ["Subarachnoid Hemorrhage", "Migraine with Aura", "Meningitis", "Cervical Artery Dissection"],
    recommendedActions: ["Immediate non-contrast head CT", "Neurological exam (cranial nerves, motor, sensory)", "Check for nuchal rigidity", "Pain management"],
    followUpQuestions: ["Have you ever experienced a headache like this before?", "Did you have any recent head or neck trauma?", "Are you experiencing any fever, chills, or neck stiffness?"]
};

export const generateTriageSummary = async (messages: Message[]): Promise<TriageSummary> => {
  if (!API_KEY) {
    console.warn("No API Key provided. Returning mock summary.");
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay
    return MOCK_SUMMARY;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Construct the conversation history string
    const conversationText = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role.toUpperCase()}: ${m.text}`)
      .join('\n');

    // Use Gemini 3 Pro with Thinking Mode for deep clinical reasoning
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Analyze the following medical triage conversation and extract a structured clinical summary.
      
      CONVERSATION:
      ${conversationText}
      
      Instructions:
      - Determine priority based on red flags (Emergency), moderate severity (Priority), or minor (Normal).
      - Identify key symptoms, medications, and history.
      - Be precise and concise.
      - Return ONLY JSON.`,
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            patient_id: { type: Type.STRING, nullable: true },
            presenting_complaint: { type: Type.STRING },
            system_involved: { type: Type.STRING, nullable: true },
            onset: { type: Type.STRING, nullable: true },
            duration_days: { type: Type.NUMBER, nullable: true },
            severity_scale_1_10: { type: Type.NUMBER, nullable: true },
            associated_symptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
            comorbidities: { type: Type.ARRAY, items: { type: Type.STRING } },
            medications: { type: Type.ARRAY, items: { type: Type.STRING } },
            allergies: { type: Type.ARRAY, items: { type: Type.STRING } },
            red_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
            priority: { type: Type.STRING, enum: ["Normal", "Priority", "Emergency"] },
            language: { type: Type.STRING },
            conversation_summary: { type: Type.STRING },
            // Note: media handling is done separately in the backend/frontend logic for this demo
             media: { 
                type: Type.ARRAY, 
                items: { 
                    type: Type.OBJECT,
                    properties: {
                        media_id: { type: Type.STRING },
                        url: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ["image", "video"] },
                        vision_findings: { type: Type.STRING, nullable: true },
                        confidence: { type: Type.NUMBER, nullable: true }
                    }
                } 
             },
          },
          required: ["presenting_complaint", "priority", "conversation_summary"]
        }
      }
    });

    const parsed = safeParseJSON<TriageSummary>(response.text || "");
    if (parsed) return parsed;
    
    throw new Error("Failed to parse AI response");

  } catch (error) {
    console.error("Gemini generation failed:", error);
    return {
        ...MOCK_SUMMARY,
        conversation_summary: "Error generating AI summary. Fallback data shown."
    };
  }
};

export const determineMedicalSpecialty = async (complaint: string, summary: string): Promise<{ specialty: string; confidence: number }> => {
    if (!API_KEY) return { specialty: 'Internal Medicine', confidence: 0.5 };

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', // Fast model for routing
            contents: `You are a Chief Medical Officer. Assign the correct medical specialty for this patient.
            
            Patient Complaint: "${complaint}"
            Clinical Summary: "${summary}"

            Available Specialties in Clinic:
            - Internal Medicine (General issues, flu, fever, minor pains)
            - General Surgery (Injuries, cuts, acute abdomen, appendicitis)
            - Neurology (Headaches, seizures, numbness, dizzy)
            - Neurosurgery (Spine trauma, head trauma)
            - Endocrinology (Thyroid, diabetes)
            - Cardiology (Chest pain, heart issues)

            Instructions:
            1. Map the patient to the BEST fit. 
            2. If unsure, use "Internal Medicine".
            3. If trauma/cut/break, use "General Surgery".
            
            Return JSON: { "specialty": string, "confidence": number (0-1) }`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        specialty: { type: Type.STRING },
                        confidence: { type: Type.NUMBER }
                    },
                    required: ["specialty", "confidence"]
                }
            }
        });

        const result = safeParseJSON<{specialty: string, confidence: number}>(response.text || "");
        return result || { specialty: 'Internal Medicine', confidence: 0.1 };

    } catch (e) {
        console.error("Specialty routing failed", e);
        return { specialty: 'Internal Medicine', confidence: 0.0 };
    }
}

export const getNextTriageQuestion = async (messages: Message[]): Promise<{text: string, choices: string[]}> => {
    if (!API_KEY) {
        // Simple mock fallback logic
        const lastMsg = messages[messages.length - 1].text.toLowerCase();
        if (messages.length < 2) return { text: "What seems to be the main problem today?", choices: ["Cough/Cold", "Pain", "Injury", "Other"] };
        if (lastMsg.includes("pain")) return { text: "On a scale of 1-10, how bad is the pain?", choices: ["1-3 (Mild)", "4-6 (Moderate)", "7-10 (Severe)"] };
        if (lastMsg.includes("cough")) return { text: "How long have you had the cough?", choices: ["< 3 days", "1 week", "> 2 weeks"] };
        return { text: "Do you have any other symptoms or medical history I should know about?", choices: ["No", "Yes, High BP", "Yes, Diabetes"] };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const conversationText = messages.map(m => `${m.role}: ${m.text}`).join('\n');
        
        // Keep standard model for fast conversational turns
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are an empathetic medical triage nurse AI.
            Ask the NEXT single most important question to triage this patient.
            Context: ${conversationText}
            
            Return JSON: { "question": string, "choices": string[] }`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        question: { type: Type.STRING },
                        choices: { type: Type.ARRAY, items: { type: Type.STRING } }
                    }
                }
            }
        });
        
        const data = safeParseJSON<{question: string, choices: string[]}>(response.text || "");
        return {
            text: data?.question || "Can you describe that further?",
            choices: data?.choices || ["Yes", "No", "Skip"]
        };

    } catch (e) {
        return { text: "Could you tell me more about your symptoms?", choices: ["It hurts", "I feel tired", "Skip"] };
    }
}

export const generateDoctorInsights = async (summary: TriageSummary): Promise<DoctorInsights> => {
    if (!API_KEY) {
        console.warn("No API key, returning mock insights.");
        await new Promise(resolve => setTimeout(resolve, 1500));
        return MOCK_INSIGHTS;
    }

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: `Based on this triage summary, provide clinical insights for a doctor.
            
            SUMMARY:
            - Complaint: ${summary.presenting_complaint}
            - Priority: ${summary.priority}
            - Vitals/Symptoms: ${summary.associated_symptoms.join(', ')}; Severity ${summary.severity_scale_1_10}/10
            - Red Flags: ${summary.red_flags.join(', ') || 'None'}
            - History: ${summary.comorbidities.join(', ')}
            
            Generate a JSON object with:
            1. 'differentialDiagnoses': (string[]) Plausible conditions.
            2. 'recommendedActions': (string[]) Immediate tests/actions.
            3. 'followUpQuestions': (string[]) 2-3 key questions to ask.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        differentialDiagnoses: { type: Type.ARRAY, items: { type: Type.STRING } },
                        recommendedActions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        followUpQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["differentialDiagnoses", "recommendedActions", "followUpQuestions"]
                }
            }
        });
        
        const parsed = safeParseJSON<DoctorInsights>(response.text || "");
        return parsed || MOCK_INSIGHTS;

    } catch (error) {
        console.error("Gemini insights generation failed:", error);
        return MOCK_INSIGHTS;
    }
};
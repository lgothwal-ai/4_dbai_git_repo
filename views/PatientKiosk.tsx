
import React, { useState, useRef, useEffect } from 'react';
import { Send, Camera, Loader2, User, Bot, ShieldCheck, Image as ImageIcon, MonitorSmartphone, FileText, Mic, MicOff, Volume2, XCircle, MessageSquare, Video, ShieldAlert } from 'lucide-react';
import { Message, Session } from '../types';
import { getNextTriageQuestion, generateTriageSummary } from '../services/gemini';
import { createPatient, beginVisit, finalizeTriage } from '../services/api';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

// --- Audio Utils for Live API ---

// Convert Float32 audio buffer (browser) to Int16 PCM (model requirement)
const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
};

// Base64 Encode/Decode for array buffers
const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
};

const base64ToArrayBuffer = (base64: string) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

// --- Nurse Avatar Component ---
// A pure CSS/SVG implementation to ensure high availability and reliability without external assets.
const NurseAvatar: React.FC = () => (
    <div className="w-full h-full bg-slate-900 relative flex items-center justify-center overflow-hidden rounded-full">
        {/* Base Glow */}
        <div className="absolute inset-0 bg-medical-900/40 animate-pulse"></div>

        {/* Face Structure */}
        <div className="relative z-10 w-20 h-20 bg-medical-950/50 backdrop-blur-sm rounded-2xl border border-medical-400/30 flex flex-col items-center justify-center gap-3 shadow-[0_0_25px_rgba(14,165,233,0.4)]">

            {/* Eyes Container */}
            <div className="flex gap-3 w-full justify-center">
                {/* Left Eye */}
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-[blink_3.5s_infinite_ease-in-out]"></div>
                {/* Right Eye */}
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-[blink_3.5s_infinite_ease-in-out_0.1s]"></div>
            </div>

            {/* Voice Waveform */}
            <div className="flex items-center gap-1 h-5">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="w-1 bg-medical-400 rounded-full animate-[wave_1.2s_ease-in-out_infinite]"
                        style={{
                            animationDelay: `${i * 0.15}s`,
                            height: '40%'
                        }}
                    />
                ))}
            </div>
        </div>

        {/* Tech Rings */}
        <div className="absolute inset-2 border border-medical-500/30 rounded-full animate-[spin_10s_linear_infinite]"></div>
        <div className="absolute inset-4 border-t border-white/20 rounded-full animate-[spin_6s_linear_infinite_reverse]"></div>

        {/* CSS Injection for Keyframes */}
        <style>{`
            @keyframes blink {
                0%, 90%, 100% { transform: scaleY(1); opacity: 1; }
                95% { transform: scaleY(0.1); opacity: 0.7; }
            }
            @keyframes wave {
                0%, 100% { height: 30%; opacity: 0.6; }
                50% { height: 100%; opacity: 1; background-color: #38bdf8; box-shadow: 0 0 8px #38bdf8; }
            }
        `}</style>
    </div>
);

// --- Voice Session Component ---

interface VoiceSessionProps {
    patientName: string;
    onComplete: (transcript: Message[]) => void;
    onCancel: () => void;
}

const VoiceSession: React.FC<VoiceSessionProps> = ({ patientName, onComplete, onCancel }) => {
    const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [transcript, setTranscript] = useState<Message[]>([]);
    const [volumeLevel, setVolumeLevel] = useState(0);
    const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

    // Refs for Audio Contexts and State
    const audioContextRef = useRef<AudioContext | null>(null);
    const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const outputContextRef = useRef<AudioContext | null>(null);
    const patientVideoRef = useRef<HTMLVideoElement>(null);

    // Transcript accumulation refs
    const currentModelTurnRef = useRef<string>("");
    const currentUserTurnRef = useRef<string>("");

    // Active Session Ref
    const activeSessionRef = useRef<{ close: () => void, sendRealtimeInput: (data: any) => void } | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // Audio Source Management for Interruption Handling
    const activeSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    useEffect(() => {
        if (patientVideoRef.current && videoStream) {
            patientVideoRef.current.srcObject = videoStream;
        }
    }, [videoStream]);

    useEffect(() => {
        let mounted = true;
        let streamRef: MediaStream | null = null;

        const startVoiceSession = async () => {
            try {
                const API_KEY = process.env.API_KEY;
                if (!API_KEY) throw new Error("No API Key found");

                const ai = new GoogleGenAI({ apiKey: API_KEY });

                // 1. Setup Audio & Video Input (Microphone & Camera)
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        sampleRate: 16000,
                        channelCount: 1,
                        echoCancellation: true,
                        autoGainControl: true,
                        noiseSuppression: true
                    },
                    video: true
                });
                streamRef = stream;

                if (mounted) {
                    setVideoStream(stream);
                } else {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                audioContextRef.current = audioContext;

                const source = audioContext.createMediaStreamSource(stream);
                inputSourceRef.current = source;

                const processor = audioContext.createScriptProcessor(4096, 1, 1);
                processorRef.current = processor;

                // 2. Setup Audio Output (Speaker)
                const outputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                outputContextRef.current = outputContext;

                // 3. Connect to Live API
                // Refined Prompt for Speed and Smoothness
                const systemInstructionText = `You are Nurse Ada. You are doing a medical triage for patient ${patientName}.

                RULES FOR SPEED AND SMOOTHNESS:
                1.  **SHORT RESPONSES:** Keep your turns under 2 sentences whenever possible. Be punchy.
                2.  **NO PREAMBLE:** Do not say "I understand" or "Thank you for sharing" every time. Just ask the next question.
                3.  **HUMAN TONE:** Speak casually but professionally. Like a caring nurse in a hurry.
                4.  **ONE QUESTION AT A TIME:** Never ask two things at once.
                5.  **PROTOCOL:**
                    - Start IMMEDIATELY: "Hi ${patientName}, I'm Nurse Ada. What brings you in today?"
                    - Get: Symptom details, Severity (1-10), Duration, History.
                    - End: "Okay, I have everything. Please wait a moment."
                `;

                const sessionPromise = ai.live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    config: {
                        responseModalities: [Modality.AUDIO],
                        systemInstruction: systemInstructionText,
                        inputAudioTranscription: {},
                        outputAudioTranscription: {},
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } // Using 'Kore' for a calm, professional voice
                        }
                    },
                    callbacks: {
                        onopen: () => {
                            if (mounted) setStatus('connected');
                            console.log("Live API Connected");
                        },
                        onmessage: async (msg: LiveServerMessage) => {
                            if (!mounted) return;
                            const serverContent = msg.serverContent;

                            // --- INTERRUPTION HANDLING ---
                            // If the server says we were interrupted, kill all currently playing audio immediately.
                            if (serverContent?.interrupted) {
                                console.log("Interruption detected - clearing audio buffer");
                                activeSourceNodesRef.current.forEach(node => {
                                    try { node.stop(); } catch (e) { }
                                });
                                activeSourceNodesRef.current.clear();
                                nextStartTimeRef.current = 0;
                                currentModelTurnRef.current = ""; // Clear partial text
                                return;
                            }

                            // --- AUDIO PLAYBACK ---
                            if (serverContent?.modelTurn?.parts?.[0]?.inlineData) {
                                const b64Data = serverContent.modelTurn.parts[0].inlineData.data;
                                if (b64Data && outputContextRef.current && outputContextRef.current.state !== 'closed') {
                                    const ctx = outputContextRef.current;
                                    const audioDataBuffer = base64ToArrayBuffer(b64Data);
                                    const pcmData = new Int16Array(audioDataBuffer);
                                    const audioBuffer = ctx.createBuffer(1, pcmData.length, 24000);
                                    const channelData = audioBuffer.getChannelData(0);

                                    for (let i = 0; i < pcmData.length; i++) {
                                        channelData[i] = pcmData[i] / 32768.0;
                                    }

                                    const source = ctx.createBufferSource();
                                    source.buffer = audioBuffer;
                                    source.connect(ctx.destination);

                                    // Track the source so we can stop it if interrupted
                                    activeSourceNodesRef.current.add(source);
                                    source.onended = () => {
                                        activeSourceNodesRef.current.delete(source);
                                    };

                                    // Seamless scheduling
                                    const now = ctx.currentTime;
                                    // If next start time is in the past (gap), jump to now. 
                                    // If it's far in the future (lag), we might want to catch up, but for now standard queuing logic:
                                    const start = Math.max(now, nextStartTimeRef.current);
                                    source.start(start);
                                    nextStartTimeRef.current = start + audioBuffer.duration;
                                }
                            }

                            // --- TRANSCRIPTION ---
                            if (serverContent?.outputTranscription?.text) {
                                currentModelTurnRef.current += serverContent.outputTranscription.text;
                            }

                            if (serverContent?.inputTranscription?.text) {
                                currentUserTurnRef.current += serverContent.inputTranscription.text;
                            }

                            if (serverContent?.turnComplete) {
                                const newMessages: Message[] = [];

                                if (currentUserTurnRef.current.trim()) {
                                    newMessages.push({
                                        id: `u-${Date.now()}`,
                                        role: 'user',
                                        text: currentUserTurnRef.current.trim(),
                                        timestamp: Date.now()
                                    });
                                    currentUserTurnRef.current = "";
                                }

                                if (currentModelTurnRef.current.trim()) {
                                    newMessages.push({
                                        id: `a-${Date.now()}`,
                                        role: 'assistant',
                                        text: currentModelTurnRef.current.trim(),
                                        timestamp: Date.now()
                                    });
                                    currentModelTurnRef.current = "";
                                }

                                if (newMessages.length > 0 && mounted) {
                                    setTranscript(prev => [...prev, ...newMessages]);
                                }
                            }
                        },
                        onclose: () => {
                            console.log("Live API Closed");
                        },
                        onerror: (err) => {
                            console.error("Live API Error", err);
                            if (mounted) setStatus('error');
                        }
                    }
                });

                processor.onaudioprocess = (e) => {
                    if (isMuted || !mounted) return;

                    const inputData = e.inputBuffer.getChannelData(0);

                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                    const rms = Math.sqrt(sum / inputData.length);

                    if (mounted) setVolumeLevel(rms);

                    // --- NOISE GATE ---
                    // Filter out quiet background noise to prevent false interruptions and garbled inputs.
                    // Threshold of 0.02 is standard for filtering HVAC/Ambient noise while keeping speech.
                    if (rms < 0.02) {
                        inputData.fill(0);
                    }

                    const pcm16 = floatTo16BitPCM(inputData);
                    const b64 = arrayBufferToBase64(pcm16.buffer);

                    sessionPromise.then(session => {
                        if (mounted) {
                            session.sendRealtimeInput({
                                media: {
                                    mimeType: "audio/pcm;rate=16000",
                                    data: b64
                                }
                            });
                        }
                    }).catch(err => {
                        // Silent catch to prevent console spam during connection
                    });
                };

                source.connect(processor);
                processor.connect(audioContext.destination);

                const session = await sessionPromise;

                if (!mounted) {
                    session.close();
                    return;
                }

                activeSessionRef.current = session;

                // Kickstart interaction (Empty PCM buffer to wake up the model if needed, though prompts usually handle it)
                // Using a very quiet noise floor helps wake the VAD
                const triggerPcm = new Int16Array(1600);
                const triggerB64 = arrayBufferToBase64(triggerPcm.buffer);

                session.sendRealtimeInput({
                    media: {
                        mimeType: "audio/pcm;rate=16000",
                        data: triggerB64
                    }
                });

            } catch (e) {
                console.error(e);
                if (mounted) setStatus('error');
            }
        };

        startVoiceSession();

        return () => {
            mounted = false;
            if (activeSessionRef.current) {
                activeSessionRef.current.close();
            }
            if (streamRef) {
                streamRef.getTracks().forEach(track => track.stop());
            }
            if (inputSourceRef.current) inputSourceRef.current.disconnect();
            if (processorRef.current) {
                processorRef.current.disconnect();
                processorRef.current.onaudioprocess = null;
            }
            if (audioContextRef.current) audioContextRef.current.close();
            if (outputContextRef.current) outputContextRef.current.close();
        };
    }, [patientName]);

    const finishSession = () => {
        const finalTranscript = [...transcript];
        if (currentUserTurnRef.current.trim()) {
            finalTranscript.push({ id: `u-final`, role: 'user', text: currentUserTurnRef.current, timestamp: Date.now() });
        }
        if (currentModelTurnRef.current.trim()) {
            finalTranscript.push({ id: `a-final`, role: 'assistant', text: currentModelTurnRef.current, timestamp: Date.now() });
        }
        onComplete(finalTranscript);
    };

    return (
        <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white relative overflow-hidden rounded-2xl">
            <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                <div className={`w-64 h-64 rounded-full bg-medical-500 transition-transform duration-100 ease-out`}
                    style={{ transform: `scale(${1 + volumeLevel * 5})` }}></div>
                <div className={`absolute w-96 h-96 rounded-full border border-medical-400 transition-transform duration-200 ease-out`}
                    style={{ transform: `scale(${1 + volumeLevel * 2})` }}></div>
            </div>

            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
                <div className="flex items-center gap-2 opacity-80">
                    <div className="bg-red-500 w-2 h-2 rounded-full animate-pulse"></div>
                    <span className="text-xs font-mono uppercase tracking-widest flex items-center gap-1.5"><Video size={14} /> Live Voice & Vision Triage</span>
                </div>
                <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <XCircle size={24} />
                </button>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center max-w-2xl w-full px-4">
                <div className="mb-6 relative">
                    <div className="w-32 h-32 rounded-full overflow-hidden shadow-2xl shadow-medical-500/30 border-4 border-medical-500/50 bg-slate-800 flex items-center justify-center p-1">
                        <NurseAvatar />
                    </div>
                    {status === 'connecting' && (
                        <div className="absolute -bottom-2 -right-2 bg-slate-800 rounded-full p-1">
                            <Loader2 className="animate-spin text-white" size={16} />
                        </div>
                    )}
                </div>

                <h2 className="text-3xl font-bold mb-2">Nurse Ada</h2>
                <p className="text-slate-300 mb-6 h-6">
                    {status === 'connecting' ? 'Establishing secure connection...' :
                        status === 'error' ? 'Connection failed. Please try text mode.' :
                            'Say "Hello" to start conversation'}
                </p>

                {status === 'connected' && transcript.length === 0 && (
                    <div className="mb-8 animate-pulse">
                        <span className="bg-medical-600/80 text-white px-6 py-2 rounded-full font-medium text-sm shadow-[0_0_15px_rgba(14,165,233,0.3)] border border-medical-400/50 flex items-center gap-2">
                            <Mic size={14} className="animate-bounce" /> Listening... Say "Hello" to begin
                        </span>
                    </div>
                )}

                <div className="w-full bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md rounded-xl p-4 min-h-[200px] max-h-[300px] overflow-y-auto text-base text-left space-y-4 mb-8 border border-white/10 shadow-lg scrollbar-hide">
                    {transcript.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <MessageSquare size={32} className="mb-2 opacity-50" />
                            <p className="font-medium">Conversation History</p>
                            <p className="text-sm opacity-80">Say "Hello" to start.</p>
                        </div>
                    ) : (
                        transcript.map((msg) => (
                            <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-600' : 'bg-medical-500'}`}>
                                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>
                                <div className={`px-4 py-2 rounded-lg max-w-[85%] ${msg.role === 'user' ? 'bg-slate-700 rounded-br-none' : 'bg-medical-600 bg-opacity-50 rounded-bl-none'}`}>
                                    <p className="font-medium leading-relaxed">{msg.text}</p>
                                </div>
                            </div>
                        ))
                    )}
                    <div ref={transcriptEndRef} />
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={finishSession}
                        className="bg-medical-500 hover:bg-medical-600 text-white px-8 py-4 rounded-full font-bold shadow-lg shadow-medical-500/30 hover:scale-105 transition-all flex items-center gap-2"
                    >
                        <ShieldCheck size={20} /> Finish Session
                    </button>
                </div>
            </div>

            <div className="absolute bottom-8 right-8 w-40 h-40 rounded-full overflow-hidden border-4 border-white/30 shadow-lg backdrop-blur-sm z-20 bg-slate-800 flex items-center justify-center">
                <video
                    ref={patientVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                />
            </div>
        </div>
    );
}

// --- Main Patient Kiosk Component ---

const PatientKiosk: React.FC = () => {
    const [session, setSession] = useState<Session | null>(null);
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [uploading, setUploading] = useState(false);

    // Start Form State
    const [patientName, setPatientName] = useState('');
    const [patientPhone, setPatientPhone] = useState('');
    const [startError, setStartError] = useState('');

    // Mode Selection
    const [mode, setMode] = useState<'text' | 'voice'>('text');
    const [isVoiceActive, setIsVoiceActive] = useState(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [session?.messages]);

    const startSession = async (selectedMode: 'text' | 'voice') => {
        // Basic validation
        if (!patientName.trim()) {
            setStartError("Please enter your name to continue.");
            return;
        }

        try {
            setIsProcessing(true);
            // 1. Create Patient Record
            const patient = await createPatient(patientName, patientPhone);

            // 2. Begin a new Visit record immediately with 'triage' status
            const newVisit = await beginVisit(patient.id);

            setStartError('');
            setMode(selectedMode);
            setIsProcessing(false);

            // 3. Initialize local session state
            const initialSession: Session = {
                id: `local-${Date.now()}`,
                patientId: patient.id,
                visitId: newVisit.id, // Link to the backend visit record
                patientName: patient.name,
                patientPhone: patient.phone,
                patientToken: `P-${patient.id}`,
                visitDate: new Date().toISOString(),
                startTime: Date.now(),
                status: 'triage',
                messages: [],
            };

            if (selectedMode === 'voice') {
                setIsVoiceActive(true);
                setSession(initialSession);
            } else {
                // Text Mode Initialization
                initialSession.messages = [
                    {
                        id: 'init',
                        role: 'assistant',
                        text: `Hello ${patient.name}. I am the AI Triage Assistant. I'm here to gather some information before you see a doctor. What is your main reason for visiting today?`,
                        timestamp: Date.now(),
                        choices: ["Chest Pain", "Injury/Trauma", "Fever/Flu", "Breathing Issues"]
                    }
                ];
                await new Promise(r => setTimeout(r, 800));
                setSession(initialSession);
            }

        } catch (e) {
            console.error(e);
            setStartError("Could not connect to the clinic server. Please try again.");
            setIsProcessing(false);
        }
    };

    // Handle Completion of Voice Session
    const handleVoiceComplete = async (transcript: Message[]) => {
        setIsVoiceActive(false);
        if (!session) return;

        setIsProcessing(true);

        // Update session with the transcript
        const updatedSession = {
            ...session,
            messages: transcript
        };
        setSession(updatedSession);

        // Generate Summary based on the voice transcript
        await finishTriage(updatedSession);
    };

    const handleSend = async (text: string) => {
        if (!session || !text.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: text,
            timestamp: Date.now()
        };

        const updatedMessages = [...session.messages, userMsg];
        const updatedSession = { ...session, messages: updatedMessages };
        setSession(updatedSession);
        setInput('');
        setIsProcessing(true);

        // 1. Check if triage is done (Arbitrary length for demo, or if summary logic triggered)
        if (updatedMessages.length > 8) {
            finishTriage(updatedSession);
            return;
        }

        // 2. Get AI Response
        const aiResponse = await getNextTriageQuestion(updatedMessages);

        const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: aiResponse.text,
            choices: aiResponse.choices,
            timestamp: Date.now()
        };

        setSession(prev => prev ? ({ ...prev, messages: [...prev.messages, aiMsg] }) : null);
        setIsProcessing(false);
    };

    const finishTriage = async (finalSession: Session) => {
        try {
            const summary = await generateTriageSummary(finalSession.messages);

            // Backend: Update the visit record with the completed triage data
            if (finalSession.visitId) {
                await finalizeTriage(finalSession.visitId, summary, finalSession.messages);
            }

            const completedSession: Session = {
                ...finalSession,
                status: 'waiting',
                summary: summary,
                messages: [...finalSession.messages, {
                    id: 'end',
                    role: 'assistant',
                    text: "Thank you. I have gathered enough information.",
                    timestamp: Date.now()
                }]
            };
            setSession(completedSession);
        } catch (e) {
            console.error("Failed to finish triage:", e);
        }

        setIsProcessing(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setUploading(true);
            setTimeout(() => {
                setUploading(false);
                handleSend(`[Uploaded Media: ${e.target.files![0].name}]`);
            }, 1500);
        }
    }

    // 1. Welcome / Start Screen
    if (!session) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl shadow-xl border border-white/50 p-8 text-center relative overflow-hidden">

                {/* Decorative Background Elements */}
                <div className="absolute top-0 left-0 w-64 h-64 bg-medical-200/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl translate-x-1/3 translate-y-1/3"></div>

                <div className="relative z-10 flex flex-col items-center max-w-md w-full">
                    <div className="w-24 h-24 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.05)] flex items-center justify-center mb-8 text-medical-500 transform hover:scale-110 transition-transform duration-300">
                        <div className="absolute inset-0 bg-medical-500/10 rounded-2xl animate-pulse"></div>
                        <MonitorSmartphone size={48} />
                    </div>

                    <h2 className="text-4xl font-extrabold text-slate-800 mb-3 tracking-tight">
                        Patient Check-in
                    </h2>
                    <p className="text-slate-500 text-lg mb-10 leading-relaxed">
                        I'm Nurse Ada. Enter your details below and we'll get you checked in immediately.
                    </p>

                    <div className="w-full bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-white/60 space-y-5 mb-8 text-left">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Full Name</label>
                            <input
                                type="text"
                                value={patientName}
                                onChange={(e) => setPatientName(e.target.value)}
                                placeholder="e.g. Sarah Connor"
                                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all font-medium text-slate-800 placeholder:text-slate-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Phone Number <span className="text-slate-300 font-normal lowercase">(optional)</span></label>
                            <input
                                type="tel"
                                value={patientPhone}
                                onChange={(e) => setPatientPhone(e.target.value)}
                                placeholder="e.g. (555) 012-3456"
                                className="w-full px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all font-medium text-slate-800 placeholder:text-slate-400"
                            />
                        </div>
                        {startError && (
                            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                <ShieldAlert size={16} /> {startError}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 w-full">
                        <button
                            onClick={() => startSession('voice')}
                            disabled={isProcessing}
                            className="group relative w-full bg-gradient-to-r from-medical-600 to-medical-500 hover:from-medical-500 hover:to-medical-400 text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-medical-500/30 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                            <span className="relative flex items-center gap-2">
                                {isProcessing ? <Loader2 className="animate-spin" /> : <Mic size={22} />}
                                Start Voice Assessment
                            </span>
                        </button>

                        <button
                            onClick={() => startSession('text')}
                            disabled={isProcessing}
                            className="w-full bg-white hover:bg-slate-50 text-slate-600 font-semibold py-3 px-8 rounded-xl border border-slate-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <FileText size={18} />
                            Use Text Chat
                        </button>
                    </div>
                    <p className="mt-6 text-xs text-slate-400 font-medium">
                        Powered by Gemini 2.5 Flash • Secure & Confidential
                    </p>
                </div>
            </div>
        );
    }

    // 2. Voice Session Active View
    if (isVoiceActive) {
        return (
            <VoiceSession
                patientName={patientName}
                onComplete={handleVoiceComplete}
                onCancel={() => { setIsVoiceActive(false); setSession(null); }}
            />
        );
    }

    // 3. Waiting Screen (End of Triage)
    if (session.status === 'waiting') {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 text-green-600 animate-in zoom-in">
                    <ShieldCheck size={40} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Check-in Complete</h2>
                <p className="text-slate-500 max-w-md mb-8">
                    Your information has been securely sent to our triage team. Please take a seat in the waiting area.
                </p>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8 w-full max-w-xs">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Your Triage Token</p>
                    <div className="text-3xl font-mono font-bold text-medical-700 tracking-widest bg-white border border-slate-100 py-3 rounded-lg shadow-sm">
                        {session.patientToken}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Please show this to reception if asked.</p>
                </div>

                <button
                    onClick={() => { setSession(null); setPatientName(''); setPatientPhone(''); }}
                    className="text-medical-600 font-medium hover:underline"
                >
                    Start New Session (Demo)
                </button>
            </div>
        );
    }

    // 4. Processing State (Generating Summary after Voice/Text)
    if (isProcessing && session.messages.length > 1) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                <Loader2 size={48} className="text-medical-500 animate-spin mb-4" />
                <h3 className="text-xl font-bold text-slate-800">Analyzing Assessment</h3>
                <p className="text-slate-500">Dr. AI is generating your clinical summary...</p>
            </div>
        )
    }

    // 5. Text Chat Interface
    return (
        <div className="h-[calc(100vh-140px)] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-medical-100 p-2 rounded-lg text-medical-600">
                        <Bot size={24} />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">Triage Assistant</h3>
                        <p className="text-xs text-slate-500">Session {session.patientToken}</p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                {session.messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-4 shadow-sm ${msg.role === 'user'
                                    ? 'bg-medical-600 text-white rounded-tr-none'
                                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                                }`}
                        >
                            <p className="leading-relaxed">{msg.text}</p>

                            {/* Choices Chips */}
                            {msg.role === 'assistant' && msg.choices && session.status === 'triage' && msg === session.messages[session.messages.length - 1] && (
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {msg.choices.map(choice => (
                                        <button
                                            key={choice}
                                            onClick={() => handleSend(choice)}
                                            className="bg-medical-50 text-medical-700 border border-medical-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-medical-100 transition-colors"
                                        >
                                            {choice}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none p-4 shadow-sm">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            {session.status === 'triage' && (
                <div className="p-4 bg-white border-t border-slate-200">
                    <div className="flex items-end gap-2 max-w-4xl mx-auto">
                        <label className="cursor-pointer p-3 text-slate-400 hover:text-medical-600 hover:bg-medical-50 rounded-full transition-colors">
                            <input type="file" className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
                            {uploading ? <Loader2 className="animate-spin" size={24} /> : <Camera size={24} />}
                        </label>
                        <div className="flex-1 relative">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend(input);
                                    }
                                }}
                                placeholder="Type your answer..."
                                className="w-full bg-slate-100 border-0 rounded-2xl py-3 px-4 focus:ring-2 focus:ring-medical-500 focus:bg-white resize-none scrollbar-hide"
                                rows={1}
                            />
                        </div>
                        <button
                            onClick={() => handleSend(input)}
                            disabled={!input.trim() || isProcessing}
                            className="bg-medical-600 text-white p-3 rounded-full hover:bg-medical-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientKiosk;

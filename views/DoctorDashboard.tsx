
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Clock, CheckCircle, ChevronRight, FileText, AlertTriangle, User, LogOut, History,
    MessageSquare, Users, MonitorOff, Coffee, Stethoscope, BrainCircuit, HeartPulse, Info, UserCheck, Save, Search, Bot, Loader2, FileClock, ChevronDown, DoorOpen, ArrowRight
} from 'lucide-react';
import { Session, Doctor, Priority, DoctorInsights } from '../types';
import { useSimulationClock } from '../hooks/useSimulationClock';
import { getTodaysVisits, updateVisitStatus, getPatientHistory, submitDiagnosis, APIVisit, APIPatientHistory, updateDoctorStatus, getDoctors } from '../services/api';
import { generateDoctorInsights } from '../services/gemini';

// --- Mappers ---
const mapApiVisitToSession = (visit: APIVisit): Session => {
    return {
        id: visit.id.toString(),
        visitId: visit.id,
        patientId: visit.patient_id,
        patientName: visit.patient_name || 'Unknown',
        patientToken: `P-${visit.patient_id}`,
        visitDate: visit.check_in_time,
        startTime: new Date(visit.check_in_time).getTime(),
        consultationStartTime: visit.consult_start_time ? new Date(visit.consult_start_time).getTime() : undefined,
        endTime: visit.end_time ? new Date(visit.end_time).getTime() : undefined,
        status: visit.status as any,
        messages: visit.transcript,
        summary: visit.triage_summary,
        assignedDoctorId: visit.assigned_doctor_id
    };
};

// --- Helper Components ---
const LiveTimer: React.FC<{ startTime: number; simulatedTime: number, prefix: string }> = ({ startTime, simulatedTime, prefix }) => {
    const durationText = useMemo(() => {
        const elapsedMs = Math.max(0, simulatedTime - startTime);
        const totalMinutes = Math.floor(elapsedMs / 60000);
        const seconds = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');
        if (totalMinutes < 60) {
            return `${totalMinutes}m ${seconds}s`;
        } else {
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            return `${hours}h ${minutes}m`;
        }
    }, [simulatedTime, startTime]);

    return <span className="text-sm font-medium">{prefix}: <span className="font-mono">{durationText}</span></span>;
};

const PriorityPill: React.FC<{ priority: Priority, type?: 'pill' | 'tag' }> = ({ priority, type = 'tag' }) => {
    const styles = {
        Emergency: 'bg-red-100 text-red-600 border-red-200',
        Priority: 'bg-orange-100 text-orange-600 border-orange-200',
        Normal: 'bg-green-100 text-green-600 border-green-200',
    };
    const p = priority || 'Normal';

    if (type === 'pill') {
        return (
            <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[p]}`}>{p.substring(0, 4)}</div>
        )
    }
    return (
        <div className={`inline-block px-3 py-1 rounded-md text-xs font-bold border ${styles[p]}`}>{p}</div>
    );
};


// --- Main View Components ---

const DoctorLogin: React.FC<{ onLogin: (doctor: Doctor) => void }> = ({ onLogin }) => {
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getDoctors().then(data => {
            setDoctors(data);
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="h-full w-full flex items-center justify-center"><Loader2 className="animate-spin text-medical-500" size={32} /></div>;

    return (
        <div className="h-full w-full flex items-center justify-center bg-slate-50">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 w-full max-w-md animate-in fade-in zoom-in-95">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-medical-100 rounded-full text-medical-600 mb-4">
                        <User size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-800">Doctor Login</h1>
                    <p className="text-slate-500">Select your profile to begin.</p>
                </div>
                <div className="space-y-3">
                    {doctors.map(doc => (
                        <button
                            key={doc.id}
                            onClick={() => onLogin(doc)}
                            className="w-full flex items-center justify-between text-left p-4 bg-slate-50 hover:bg-medical-50 rounded-lg border border-slate-200 hover:border-medical-300 transition-all group"
                        >
                            <div>
                                <p className="font-bold text-slate-900">{doc.name}</p>
                                <p className="text-sm text-slate-500">{doc.specialty}</p>
                            </div>
                            <ChevronRight className="text-slate-400 group-hover:text-medical-500 transition-colors" size={20} />
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};


const DoctorProfilePanel: React.FC<{ doctor: Doctor, onLogout: () => void, onStatusChange: (status: Doctor['status']) => void, stats: any, simTime: number, canStartConsultations: boolean }> = ({ doctor, onLogout, onStatusChange, stats, simTime, canStartConsultations }) => {

    const StatusButton: React.FC<{ target: Doctor['status'], label: string, icon: React.ElementType }> = ({ target, label, icon: Icon }) => (
        <button
            onClick={() => onStatusChange(target)}
            className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all flex items-center justify-center gap-2 ${doctor.status === target ? 'bg-medical-600 text-white shadow' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
        >
            <Icon size={14} /> {label}
        </button>
    );

    const StatBox: React.FC<{ value: string | number, label: string }> = ({ value, label }) => (
        <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-200">
            <p className="text-2xl font-bold text-slate-800">{value}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col h-full">
            <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-medical-500 text-white rounded-full flex items-center justify-center text-3xl font-bold shrink-0">
                    {doctor.name.charAt(0)}
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-900 leading-tight">{doctor.name}</h2>
                    <p className="text-sm text-slate-500">{doctor.specialty}</p>
                </div>
                <button onClick={onLogout} className="ml-auto text-slate-400 hover:text-red-500 transition-colors p-2 shrink-0"><LogOut size={20} /></button>
            </div>

            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg my-6">
                <StatusButton target="active" label="Active" icon={CheckCircle} />
                <StatusButton target="break" label="Break" icon={Coffee} />
                <StatusButton target="offline" label="Offline" icon={MonitorOff} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <StatBox value={stats.seen} label="Patients Seen" />
                <StatBox value={stats.avgConsult} label="Avg Consult" />
                <StatBox value={stats.totalAssigned} label="Total Assigned" />
                <StatBox value={stats.inQueue} label="In Queue" />
            </div>

            <div className="flex-grow" />
            {!canStartConsultations && (
                <p className="text-xs text-center text-orange-600 bg-orange-100 p-2 rounded-md font-semibold">
                    Consultations start at 8:00 AM
                </p>
            )}
            <p className="text-xs text-slate-400 text-center mt-2 font-mono">System Time: {new Date(simTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
        </div>
    );
};

const PatientQueuePanel: React.FC<{ queue: Session[], inCabin: Session | null, onSelect: (session: Session) => void, selectedId: string | null, simTime: number }> = ({ queue, inCabin, onSelect, selectedId, simTime }) => {

    const QueueItem: React.FC<{ session: Session, isSelected: boolean, isCabin: boolean }> = ({ session, isSelected, isCabin }) => {
        const waitTimeMins = Math.floor((simTime - session.startTime) / 60000);
        return (
            <button
                onClick={() => onSelect(session)}
                className={`w-full text-left p-3 rounded-xl border-l-4 transition-all duration-200 group ${isSelected ? 'bg-medical-100 border-medical-500 shadow-md scale-[1.02]' :
                        isCabin ? 'bg-medical-50 border-medical-400' : 'bg-white hover:bg-slate-50 border-transparent'
                    } ${!isCabin && session.summary?.priority === 'Emergency' ? '!border-red-500' : !isCabin && session.summary?.priority === 'Priority' ? '!border-orange-400' : ''}`}
            >
                <div className="flex justify-between items-center mb-1">
                    <p className="font-bold text-slate-800 truncate">{session.patientName}</p>
                    {isCabin ?
                        <span className="text-[10px] font-bold bg-medical-500 text-white px-2 py-0.5 rounded-full uppercase animate-pulse">In Cabin</span> :
                        <PriorityPill priority={session.summary?.priority || 'Normal'} type="pill" />
                    }
                </div>
                <p className="text-xs text-slate-600 truncate mb-2">{session.summary?.presenting_complaint}</p>
                <div className="flex justify-between items-center text-xs text-slate-500">
                    {isCabin && session.consultationStartTime ?
                        <LiveTimer startTime={session.consultationStartTime} simulatedTime={simTime} prefix="Consult" /> :
                        <span className="font-medium">Wait: <span className="font-mono">{waitTimeMins}m</span></span>
                    }
                    <span className="font-mono text-slate-400">{session.patientToken}</span>
                </div>
            </button>
        )
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col h-full">
            <h3 className="text-lg font-bold text-slate-800 mb-4 px-2">Patient Queue</h3>

            {/* Current Patient Section */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                    <DoorOpen size={14} /> Current Consultation
                </div>
                {inCabin ? (
                    <QueueItem session={inCabin} isSelected={selectedId === inCabin.id} isCabin={true} />
                ) : (
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-400">
                        <Coffee size={24} className="mx-auto mb-2 opacity-50" />
                        <p className="text-sm font-medium">Cabin Empty</p>
                    </div>
                )}
            </div>

            {/* Waiting List */}
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">
                    <div className="flex items-center gap-2"><Users size={14} /> Next Up ({queue.length})</div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide pb-2">
                    {queue.map(s => <QueueItem key={s.id} session={s} isSelected={selectedId === s.id} isCabin={false} />)}
                    {queue.length === 0 && <div className="p-8 text-center text-slate-400 text-sm">Queue is clear.</div>}
                </div>
            </div>
        </div>
    );
}

// --- Patient Chart Tabs ---
const OverviewTabContent: React.FC<{ summary: Session['summary'] }> = ({ summary }) => {
    const InfoBlock: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
        <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{title}</h4>
            <div className="text-slate-800">{children}</div>
        </div>
    );
    if (!summary) return null;
    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="bg-slate-100 p-4 rounded-lg border border-slate-200">
                <InfoBlock title="Presenting Complaint">
                    <p className="text-lg font-semibold">{summary.presenting_complaint}</p>
                </InfoBlock>
            </div>
            {summary.red_flags.length > 0 && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 flex items-start gap-3">
                    <AlertTriangle className="text-red-500 shrink-0 mt-1" />
                    <div>
                        <InfoBlock title="Red Flags Identified">
                            <ul className="list-disc list-inside space-y-1">
                                {summary.red_flags.map(f => <li key={f} className="font-medium text-red-800">{f}</li>)}
                            </ul>
                        </InfoBlock>
                    </div>
                </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <InfoBlock title="Severity"><p><span className="text-xl font-bold">{summary.severity_scale_1_10}</span>/10</p></InfoBlock>
                <InfoBlock title="Onset"><p>{summary.onset}</p></InfoBlock>
                <InfoBlock title="Duration"><p>{summary.duration_days ?? 0} days</p></InfoBlock>
                <InfoBlock title="System"><p>{summary.system_involved}</p></InfoBlock>
            </div>
            <InfoBlock title="Associated Symptoms">
                <div className="flex flex-wrap gap-2">
                    {summary.associated_symptoms.map(s => (
                        <span key={s} className="bg-slate-200 text-slate-700 px-3 py-1 rounded-full text-sm font-medium">{s}</span>
                    ))}
                </div>
            </InfoBlock>
            <InfoBlock title="Known Allergies">
                <div className="flex flex-wrap gap-2">
                    {summary.allergies.length > 0 ? summary.allergies.map(s => (
                        <span key={s} className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">{s}</span>
                    )) : <p className="text-sm text-slate-500">None reported.</p>}
                </div>
            </InfoBlock>
        </div>
    );
}

const InsightsTabContent: React.FC<{ summary: Session['summary'] }> = ({ summary }) => {
    const [insights, setInsights] = useState<DoctorInsights | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (summary) {
            setLoading(true);
            generateDoctorInsights(summary).then(res => {
                setInsights(res);
                setLoading(false);
            });
        }
    }, [summary]);

    if (loading) return <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-medical-500" /></div>

    if (!insights) return <div>No insights generated.</div>

    return (
        <div className="space-y-6 animate-in fade-in">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-2">Differential Diagnoses</h4>
                <ul className="list-disc list-inside space-y-1 font-medium text-blue-800">
                    {insights.differentialDiagnoses.map(d => <li key={d}>{d}</li>)}
                </ul>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="text-xs font-bold text-green-500 uppercase tracking-wider mb-2">Recommended Actions</h4>
                <ul className="list-disc list-inside space-y-1 font-medium text-green-800">
                    {insights.recommendedActions.map(d => <li key={d}>{d}</li>)}
                </ul>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <h4 className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-2">Key Follow-up Questions</h4>
                <ul className="list-disc list-inside space-y-1 font-medium text-purple-800">
                    {insights.followUpQuestions.map(d => <li key={d}>{d}</li>)}
                </ul>
            </div>
        </div>
    )
}

const TranscriptTabContent: React.FC<{ messages: Session['messages'] }> = ({ messages }) => (
    <div className="space-y-4 animate-in fade-in">
        {messages.filter(m => m.role !== 'system').map(msg => (
            <div key={msg.id} className={`flex items-start gap-3 ${msg.role === 'user' ? '' : 'flex-row-reverse'}`}>
                <div className={`p-3 rounded-xl max-w-[85%] ${msg.role === 'user' ? 'bg-slate-200 text-slate-800 rounded-bl-none' : 'bg-medical-600 text-white rounded-br-none'}`}>
                    <p className="leading-relaxed">{msg.text}</p>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-600 text-white' : 'bg-medical-100 text-medical-700'}`}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
            </div>
        ))}
    </div>
);

const HistoryTabContent: React.FC<{ patientId: number }> = ({ patientId }) => {
    const [history, setHistory] = useState<APIPatientHistory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getPatientHistory(patientId).then(data => {
            setHistory(data);
            setLoading(false);
        })
    }, [patientId]);

    if (loading) return <div className="flex justify-center items-center h-48"><Loader2 className="animate-spin text-medical-500" /></div>
    if (history.length === 0) return <div className="text-center p-8 text-slate-500">No prior visit history found.</div>

    return (
        <div className="space-y-4 animate-in fade-in">
            {history.map(({ visit, diagnosis }) => (
                <details key={visit.id} className="bg-slate-100 border border-slate-200 rounded-lg open:shadow-md">
                    <summary className="p-4 font-semibold cursor-pointer flex justify-between items-center">
                        <div>
                            <span>{new Date(visit.check_in_time).toLocaleDateString()} - {visit.presenting_complaint}</span>
                            <span className="ml-2 text-xs text-slate-500">({visit.priority})</span>
                        </div>
                        <ChevronDown className="transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <div className="p-4 border-t border-slate-200 bg-white">
                        <p className="text-sm"><span className="font-semibold">Doctor Notes:</span> {diagnosis?.doctor_notes || 'N/A'}</p>
                    </div>
                </details>
            ))}
        </div>
    )
}


const PatientChartPanel: React.FC<{
    session: Session | null,
    patientInCabin: Session | null,
    onCallToCabin: (id: string) => void,
    onMarkSeen: (id: string) => void,
    simTime: number,
    canStartConsultations: boolean
}> = ({ session, patientInCabin, onCallToCabin, onMarkSeen, simTime, canStartConsultations }) => {
    const [activeTab, setActiveTab] = useState('Overview');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Reset to overview when patient changes
        setActiveTab('Overview');
    }, [session?.id])

    if (!session) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col items-center justify-center text-center p-8 animate-in fade-in">
                <FileText size={48} className="text-slate-300 mb-4" />
                <h3 className="text-xl font-bold text-slate-700">No Patient Selected</h3>
                <p className="text-slate-500 mb-6">Select a patient from the queue to view details.</p>
            </div>
        )
    }

    const handleMarkSeenClick = async () => {
        setIsSaving(true);
        await onMarkSeen(session.id);
        setIsSaving(false);
    }

    const handleCallClick = async () => {
        setIsSaving(true);
        await onCallToCabin(session.id);
        setIsSaving(false);
    }

    const waitTime = Math.floor(((session.consultationStartTime || simTime) - session.startTime) / 60000);

    const TabButton: React.FC<{ label: string, icon: React.ElementType }> = ({ label, icon: Icon }) => (
        <button
            onClick={() => setActiveTab(label)}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === label ? 'bg-medical-100 text-medical-600' : 'text-slate-500 hover:bg-slate-100'}`}
        >
            <Icon size={16} /> {label}
        </button>
    )

    const isPatientInCabin = session.status === 'in_cabin';
    const isAnotherPatientInCabin = patientInCabin && patientInCabin.id !== session.id;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden animate-in fade-in">
            <div className="p-5 border-b border-slate-200">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{session.patientName}</h1>
                        <p className="text-slate-500 font-mono text-sm">{session.patientToken} <span className="text-slate-400 mx-1">•</span> Wait: {waitTime}m</p>
                    </div>

                    <div>
                        {/* Action Button Logic */}
                        {isPatientInCabin ? (
                            <button onClick={handleMarkSeenClick} disabled={isSaving} className="bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:bg-slate-400">
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                                {isSaving ? 'Saving...' : 'Mark as Seen'}
                            </button>
                        ) : (
                            <button
                                onClick={handleCallClick}
                                disabled={isSaving || !!isAnotherPatientInCabin || !canStartConsultations}
                                className="bg-medical-600 hover:bg-medical-700 text-white font-semibold px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                                title={isAnotherPatientInCabin ? "Finish current consultation first" : "Call patient to cabin"}
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <DoorOpen size={16} />}
                                {isSaving ? 'Calling...' : 'Call to Cabin'}
                            </button>
                        )}
                        {isAnotherPatientInCabin && !isPatientInCabin && (
                            <p className="text-xs text-red-500 mt-1 text-right">Cabin occupied</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-2 border-b border-slate-200 flex gap-2">
                <TabButton label="Overview" icon={Info} />
                <TabButton label="All Insights" icon={BrainCircuit} />
                <TabButton label="Triage Transcript" icon={MessageSquare} />
                <TabButton label="History" icon={FileClock} />
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 scrollbar-hide">
                {activeTab === 'Overview' && <OverviewTabContent summary={session.summary} />}
                {activeTab === 'All Insights' && <InsightsTabContent summary={session.summary} />}
                {activeTab === 'Triage Transcript' && <TranscriptTabContent messages={session.messages} />}
                {activeTab === 'History' && <HistoryTabContent patientId={session.patientId} />}
            </div>
        </div>
    );
}

const DoctorDashboard: React.FC = () => {
    const [currentUser, setCurrentUser] = useState<Doctor | null>(null);
    const [selectedSession, setSelectedSession] = useState<Session | null>(null);
    const [allMyVisits, setAllMyVisits] = useState<Session[]>([]);
    const simTime = useSimulationClock();

    const eightAmTimestamp = useMemo(() => {
        const today = new Date(); // Use real date to set the day, as sim clock day is the same
        return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0, 0).getTime();
    }, []);

    const canStartConsultations = simTime >= eightAmTimestamp;

    const { myQueue, patientInCabin, seenVisits } = useMemo(() => {
        const queue = allMyVisits
            .filter(v => ['waiting', 'assigned'].includes(v.status))
            .sort((a, b) => {
                const priorityOrder = { 'Emergency': 3, 'Priority': 2, 'Normal': 1 };
                const pA = priorityOrder[a.summary?.priority || 'Normal'] || 0;
                const pB = priorityOrder[b.summary?.priority || 'Normal'] || 0;
                if (pA !== pB) return pB - pA;
                return a.startTime - b.startTime;
            });

        const inCabin = allMyVisits.find(v => v.status === 'in_cabin') || null;

        const seen = allMyVisits.filter(v => v.status === 'seen');

        return { myQueue: queue, patientInCabin: inCabin, seenVisits: seen };
    }, [allMyVisits]);

    const stats = useMemo(() => {
        const validSeenVisits = seenVisits.filter(v => v.consultationStartTime && v.endTime);
        const totalConsultMs = validSeenVisits.reduce((acc, v) => acc + (v.endTime! - v.consultationStartTime!), 0);
        const avgConsultMins = validSeenVisits.length > 0 ? Math.round(totalConsultMs / validSeenVisits.length / 60000) : 0;

        return {
            seen: seenVisits.length,
            avgConsult: `${avgConsultMins}m`,
            totalAssigned: allMyVisits.length,
            inQueue: myQueue.length,
        };
    }, [seenVisits, allMyVisits, myQueue]);

    const fetchData = useCallback(async (doctorId: string) => {
        try {
            const allVisits = await getTodaysVisits();
            const myVisits = allVisits
                .filter(v => v.assigned_doctor_id === doctorId)
                .map(mapApiVisitToSession);
            setAllMyVisits(myVisits);
        } catch (error) {
            console.error("Failed to fetch doctor data:", error);
        }
    }, []);

    useEffect(() => {
        if (currentUser) {
            fetchData(currentUser.id);
            const interval = setInterval(() => fetchData(currentUser.id), 2500);
            return () => clearInterval(interval);
        }
    }, [currentUser, fetchData]);

    useEffect(() => {
        // If the selected patient is moved into cabin (e.g. by auto-refresh or action), 
        // make sure we are still looking at them, or if a new patient enters cabin, switch to them.
        if (patientInCabin && selectedSession?.id !== patientInCabin.id) {
            // Optional: Auto-switch view to the patient entering the cabin
            setSelectedSession(patientInCabin);
        }
    }, [patientInCabin]);

    const handleLogin = (doctor: Doctor) => {
        setCurrentUser(doctor);
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setSelectedSession(null);
    };

    const handleStatusChange = async (status: Doctor['status']) => {
        if (currentUser) {
            const updated = await updateDoctorStatus(currentUser.id, status);
            if (updated) setCurrentUser(updated);
        }
    };

    const handleSelectPatient = (session: Session) => {
        // Just view the patient details
        setSelectedSession(session);
    }

    const handleCallToCabin = async (sessionId: string) => {
        if (patientInCabin) {
            alert("Please finish with the current patient before calling another.");
            return;
        }
        await updateVisitStatus(parseInt(sessionId), 'in_cabin');
        await fetchData(currentUser!.id);
    }

    const handleMarkSeen = async (sessionId: string) => {
        await submitDiagnosis(parseInt(sessionId), currentUser?.name || 'Doctor', 'Patient discharged after consultation.');
        // Clear selection logic handled by effects if needed, or manual reset
        if (selectedSession?.id === sessionId) {
            setSelectedSession(null);
        }
        await fetchData(currentUser!.id);
    }

    if (!currentUser) {
        return <DoctorLogin onLogin={handleLogin} />;
    }

    return (
        <div className="h-[calc(100vh-120px)] w-full grid grid-cols-12 gap-6 p-1">
            <div className="col-span-12 lg:col-span-3 h-full">
                <DoctorProfilePanel doctor={currentUser} onLogout={handleLogout} onStatusChange={handleStatusChange} stats={stats} simTime={simTime} canStartConsultations={canStartConsultations} />
            </div>
            <div className="col-span-12 lg:col-span-6 h-full">
                <PatientChartPanel
                    session={selectedSession}
                    patientInCabin={patientInCabin}
                    onCallToCabin={handleCallToCabin}
                    onMarkSeen={handleMarkSeen}
                    simTime={simTime}
                    canStartConsultations={canStartConsultations}
                />
            </div>
            <div className="col-span-12 lg:col-span-3 h-full">
                <PatientQueuePanel queue={myQueue} inCabin={patientInCabin} onSelect={handleSelectPatient} selectedId={selectedSession?.id || null} simTime={simTime} />
            </div>
        </div>
    );
};

export default DoctorDashboard;

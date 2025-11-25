
import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getTodaysVisits, getDoctors, addDoctor as apiAddDoctor, APIVisit, updateDoctorStatus } from '../services/api';
import { Users, Clock, DoorOpen, CheckCircle, Hourglass, BarChart3, UserCog, Download, Stethoscope, Coffee, MonitorOff, Activity, UserPlus, FileText, ChevronDown, LayoutDashboard, Calendar } from 'lucide-react';
import { Doctor, Priority } from '../types';
import { useSimulationClock } from '../hooks/useSimulationClock';

// --- Helper Functions & Constants ---
const PRIORITY_COLORS: { [key in Priority]: string } = {
    Emergency: '#ef4444',
    Priority: '#f97316',
    Normal: '#22c55e',
};
const PIE_CHART_COLORS = [PRIORITY_COLORS.Emergency, PRIORITY_COLORS.Priority, PRIORITY_COLORS.Normal];

const formatTime = (dateString: string) => new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatDuration = (start: string, end: string) => {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return `${Math.floor(diff / 60000)} min`;
}

// --- Reusable Components ---
const StatCard: React.FC<{ icon: React.ElementType, label: string, value: string | number, subtext?: string, color?: string }> = ({ icon: Icon, label, value, subtext, color = 'text-medical-600' }) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between hover:shadow-md transition-all duration-200 group">
        <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 group-hover:text-medical-600 transition-colors">{label}</p>
            <h3 className="text-3xl font-bold text-slate-800 tracking-tight">{value}</h3>
            {subtext && <p className="text-xs text-slate-400 mt-1 font-medium">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-slate-50 ${color} group-hover:scale-110 transition-transform`}>
            <Icon size={24} />
        </div>
    </div>
);

const TabButton = ({ activeTab, tabName, onClick, icon: Icon, label }: any) => (
    <button 
        onClick={() => onClick(tabName)} 
        className={`px-5 py-2.5 text-sm font-medium rounded-lg transition-all flex items-center gap-2.5 ${
            activeTab === tabName 
                ? 'bg-medical-600 text-white shadow-md shadow-medical-200' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`}
    >
        <Icon size={16} /> {label}
    </button>
);

// --- Main Admin Dashboard Component ---
const AdminDashboard: React.FC = () => {
  const [visits, setVisits] = useState<APIVisit[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');
  const simTime = useSimulationClock();

  const fetchData = async () => {
      try {
          const [visitsData, doctorsData] = await Promise.all([getTodaysVisits(), getDoctors()]);
          setVisits(visitsData);
          setDoctors(doctorsData);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      fetchData();
      const interval = setInterval(fetchData, 2000); // Poll slightly faster for live feel
      return () => clearInterval(interval);
  }, []);

  // --- Memoized Calculations for Performance ---
  const stats = React.useMemo(() => {
    const triageVisits = visits.filter(v => v.status === 'triage');
    const seenVisits = visits.filter(v => v.status === 'seen');
    const waitingVisits = visits.filter(v => v.status === 'waiting');
    const inCabinVisits = visits.filter(v => v.status === 'in_cabin');

    const totalWaitMs = waitingVisits.reduce((acc, v) => acc + (simTime - new Date(v.check_in_time).getTime()), 0);
    const avgWaitMin = waitingVisits.length > 0 ? Math.floor(totalWaitMs / waitingVisits.length / 60000) : 0;
    
    // Throughput last hour
    const oneHourAgo = simTime - 3600000;
    const seenLastHour = visits.filter(v => v.end_time && new Date(v.end_time).getTime() > oneHourAgo).length;

    return {
        activeDoctors: doctors.filter(d => d.status === 'active').length,
        inTriage: triageVisits.length,
        waiting: waitingVisits.length,
        inCabin: inCabinVisits.length,
        seen: seenVisits.length,
        avgWaitTime: `${avgWaitMin}m`,
        throughput: seenLastHour.toFixed(0),
    };
  }, [visits, doctors, simTime]);

  const chartData = React.useMemo(() => {
      const severity = { Emergency: 0, Priority: 0, Normal: 0 };
      visits.forEach(v => {
          if (v.status !== 'triage') { // Only count patients whose priority has been set
            severity[v.priority as Priority]++;
          }
      });
      const severityDistribution = [
          { name: 'Emergency', value: severity.Emergency },
          { name: 'Priority', value: severity.Priority },
          { name: 'Normal', value: severity.Normal },
      ];

      const workload = doctors.map(d => ({
          name: d.name.split(' ').pop(), // Use last name
          load: d.currentLoad
      }));
      
      return { severityDistribution, workload };
  }, [visits, doctors]);

  const formattedDate = new Date(simTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const formattedTime = new Date(simTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (loading && visits.length === 0) return <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 gap-4"><Hourglass size={40} className="animate-spin text-medical-500"/><p>Initializing clinic simulation...</p></div>;

  return (
    <div className="space-y-8 pb-10 max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100/80">
            <div className="flex items-center gap-4">
                <div className="bg-medical-50 p-3 rounded-2xl text-medical-600 border border-medical-100">
                    <LayoutDashboard size={28} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Clinic Command Center</h1>
                    <p className="text-slate-500 font-medium text-sm">Operational oversight & real-time analytics</p>
                </div>
            </div>
            
            <div className="flex items-center gap-6 bg-slate-50/80 backdrop-blur-sm px-6 py-3 rounded-2xl border border-slate-200/60 shadow-inner">
                <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-medical-600 uppercase tracking-wider mb-0.5">
                        <Clock size={12} /> System Time
                    </div>
                    <p className="text-2xl font-mono font-bold text-slate-800 tabular-nums leading-none tracking-tight">{formattedTime}</p>
                </div>
                <div className="h-10 w-px bg-slate-200"></div>
                <div className="text-right">
                     <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                        <Calendar size={12} /> Date
                    </div>
                     <p className="text-sm font-semibold text-slate-600 leading-tight">{formattedDate}</p>
                </div>
            </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-1.5 bg-white rounded-xl border border-slate-100 shadow-sm w-fit mx-auto md:mx-0">
            <TabButton activeTab={activeTab} tabName="Overview" onClick={setActiveTab} icon={BarChart3} label="Overview" />
            <TabButton activeTab={activeTab} tabName="Staff Management" onClick={setActiveTab} icon={UserCog} label="Staff Management" />
            <TabButton activeTab={activeTab} tabName="Daily Reports" onClick={setActiveTab} icon={FileText} label="Daily Reports" />
        </div>
        
        {/* Tab Content */}
        <div className="min-h-[500px]">
            {activeTab === 'Overview' && <OverviewTab stats={stats} chartData={chartData} visits={visits} doctors={doctors} simTime={simTime} />}
            {activeTab === 'Staff Management' && <StaffManagementTab doctors={doctors} onDoctorAdded={fetchData} />}
            {activeTab === 'Daily Reports' && <DailyReportsTab visits={visits} doctors={doctors} />}
        </div>
    </div>
  );
};

// --- Tab Components ---

const OverviewTab: React.FC<{ stats: any, chartData: any, visits: APIVisit[], doctors: Doctor[], simTime: number }> = ({ stats, chartData, visits, doctors, simTime }) => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <StatCard icon={Stethoscope} label="Active Doctors" value={stats.activeDoctors} color="text-blue-500" />
            <StatCard icon={FileText} label="In Triage" value={stats.inTriage} color="text-purple-500" />
            <StatCard icon={Hourglass} label="Waiting" value={stats.waiting} color="text-orange-500" />
            <StatCard icon={DoorOpen} label="In Cabin" value={stats.inCabin} color="text-indigo-500" />
            <StatCard icon={CheckCircle} label="Seen Today" value={stats.seen} color="text-green-500" />
            <StatCard icon={Clock} label="Avg Wait" value={stats.avgWaitTime} color="text-slate-500" />
            <StatCard icon={Activity} label="Throughput" value={`${stats.throughput}`} subtext="patients/hr" color="text-cyan-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Charts Section */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-medical-500 rounded-full"></div>
                    Severity Distribution
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData.severityDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={90} paddingAngle={5}>
                                {chartData.severityDistribution.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={PIE_CHART_COLORS[index]} strokeWidth={0} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}/>
                            <Legend iconType="circle" verticalAlign="bottom" height={36}/>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                     <div className="w-1.5 h-6 bg-medical-500 rounded-full"></div>
                     Doctor Workload
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.workload} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} tick={{fill: '#64748b'}} />
                            <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} tick={{fill: '#64748b'}} />
                            <Tooltip cursor={{fill: 'rgba(241, 245, 249, 0.5)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="load" name="Patient Load" fill="#0ea5e9" radius={[6, 6, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        {/* Table Section */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <div className="w-1.5 h-6 bg-medical-500 rounded-full"></div>
                Live Patient Flow
            </h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-left bg-slate-50/80 border-b border-slate-100">
                        <tr>
                            {['Token', 'Name', 'Arrival', 'Status', 'Assigned Doctor', 'Wait Time', 'Consultation', 'Check-out'].map(h => (
                                <th key={h} className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {visits.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="text-center p-12 text-slate-400">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Hourglass size={24} className="animate-pulse opacity-50"/>
                                        <span>Waiting for first patient arrival...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            visits.slice().reverse().map(v => {
                                const waitMs = (v.consult_start_time ? new Date(v.consult_start_time).getTime() : simTime) - new Date(v.check_in_time).getTime();
                                const waitText = `${Math.floor(waitMs / 60000)}m ${Math.floor((waitMs % 60000) / 1000)}s`;
                                
                                const assignedDoctor = doctors.find(d => d.id === v.assigned_doctor_id);
                                const doctorName = assignedDoctor ? assignedDoctor.name : <span className="text-slate-300 italic">Assigning...</span>;

                                return (
                                    <tr key={v.id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-slate-500 group-hover:text-medical-600">#{v.patient_id.toString().slice(-4)}</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{v.patient_name}</td>
                                        <td className="px-4 py-3 text-slate-600">{formatTime(v.check_in_time)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                                                {
                                                    triage: 'bg-purple-100 text-purple-700',
                                                    waiting: 'bg-orange-100 text-orange-700',
                                                    in_cabin: 'bg-indigo-100 text-indigo-700',
                                                    seen: 'bg-green-100 text-green-700'
                                                }[v.status] || 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {v.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 font-medium">{doctorName}</td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {v.check_in_time ? (
                                                (v.status === 'waiting' || v.status === 'triage') ?
                                                <span className="text-orange-600 font-bold">{waitText}</span> :
                                                <span className="text-slate-400">{waitText}</span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">{v.consult_start_time && v.end_time ? formatDuration(v.consult_start_time, v.end_time) : '-'}</td>
                                        <td className="px-4 py-3 text-slate-400">{v.end_time ? formatTime(v.end_time) : '-'}</td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
);

const StaffManagementTab: React.FC<{ doctors: Doctor[], onDoctorAdded: () => void }> = ({ doctors, onDoctorAdded }) => {
    const [name, setName] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [status, setStatus] = useState<Doctor['status']>('active');
    const [isAdding, setIsAdding] = useState(false);
    const [isUpdating, setIsUpdating] = useState<string | null>(null);

    const handleAddDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !specialty) return;
        setIsAdding(true);
        await apiAddDoctor(name, specialty, status);
        onDoctorAdded();
        setName('');
        setSpecialty('');
        setStatus('active');
        setIsAdding(false);
    };

    const handleStatusChange = async (doctorId: string, newStatus: Doctor['status']) => {
        setIsUpdating(doctorId);
        await updateDoctorStatus(doctorId, newStatus);
        onDoctorAdded(); // This calls fetchData to refresh the UI
        setIsUpdating(null);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-fit">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
                    <div className="p-2 bg-medical-100 text-medical-600 rounded-lg"><UserPlus size={20}/></div>
                    Add New Physician
                </h3>
                <form onSubmit={handleAddDoctor} className="space-y-5">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr. Sarah Smith" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Specialty</label>
                        <input type="text" value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g. Cardiology" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Initial Status</label>
                        <div className="relative">
                            <select value={status} onChange={e => setStatus(e.target.value as Doctor['status'])} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all">
                                <option value="active">Active</option>
                                <option value="break">On Break</option>
                                <option value="offline">Offline</option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16}/>
                        </div>
                    </div>
                    <button type="submit" disabled={isAdding} className="w-full bg-medical-600 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-medical-200 hover:bg-medical-700 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none">
                        {isAdding ? <div className="flex items-center justify-center gap-2"><Hourglass className="animate-spin" size={18}/> Adding...</div> : 'Add to Roster'}
                    </button>
                </form>
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
                     <div className="p-2 bg-medical-100 text-medical-600 rounded-lg"><Users size={20}/></div>
                    Active Staff Roster
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left bg-slate-50/80 border-b border-slate-100">
                           <tr>
                                {['Name', 'Specialty', 'Current Status', 'Workload'].map(h => <th key={h} className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-xs">{h}</th>)}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {doctors.map(doc => (
                                <tr key={doc.id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-4 font-bold text-slate-800">{doc.name}</td>
                                    <td className="px-4 py-4 text-slate-600">{doc.specialty}</td>
                                    <td className="px-4 py-4">
                                        <div className="relative w-36">
                                            <select
                                                value={doc.status}
                                                onChange={(e) => handleStatusChange(doc.id, e.target.value as Doctor['status'])}
                                                disabled={isUpdating === doc.id}
                                                className={`w-full appearance-none rounded-full pl-4 pr-10 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-medical-500 transition-all shadow-sm border-0 ${
                                                    {
                                                        active: 'bg-green-100 text-green-700 hover:bg-green-200',
                                                        break: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
                                                        offline: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                                                    }[doc.status]
                                                }`}
                                            >
                                                <option value="active">Active</option>
                                                <option value="break">On Break</option>
                                                <option value="offline">Offline</option>
                                            </select>
                                            <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                                                {
                                                    active: 'text-green-800',
                                                    break: 'text-orange-800',
                                                    offline: 'text-slate-700',
                                                }[doc.status]
                                            }`} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-32 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${doc.currentLoad > 5 ? 'bg-orange-500' : 'bg-medical-500'}`} style={{ width: `${Math.min(doc.currentLoad, 10) * 10}%` }}></div>
                                            </div>
                                            <span className="font-mono font-bold text-slate-600 w-6 text-right">{doc.currentLoad}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const DailyReportsTab: React.FC<{ visits: APIVisit[], doctors: Doctor[] }> = ({ visits, doctors }) => {
    
    const exportToCSV = () => {
        const headers = ["Time", "Token", "Name", "Priority", "Status", "Assigned To", "Total Duration (min)"];
        const rows = visits.map(v => {
            const assigned = doctors.find(d => d.id === v.assigned_doctor_id)?.name || 'N/A';
            const duration = v.end_time && v.check_in_time ? Math.floor((new Date(v.end_time).getTime() - new Date(v.check_in_time).getTime()) / 60000) : 'N/A';
            return [
                formatTime(v.check_in_time),
                `#${v.patient_id.toString().slice(-4)}`,
                v.patient_name,
                v.priority,
                v.status,
                assigned,
                duration
            ].join(',');
        });
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `patient_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    return (
         <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="text-medical-600"/> Daily Patient Report
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
                <button onClick={exportToCSV} className="bg-white border border-slate-200 text-slate-700 font-semibold px-5 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                    <Download size={18}/> Export as CSV
                </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                    <thead className="text-left bg-slate-50/80 border-b border-slate-100">
                        <tr>
                            {['Time', 'Token', 'Name', 'Priority', 'Status', 'Assigned To', 'Total Duration'].map(h => <th key={h} className="px-5 py-4 font-semibold text-slate-500 uppercase tracking-wider text-xs">{h}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {visits.map(v => {
                             const assigned = doctors.find(d => d.id === v.assigned_doctor_id)?.name || 'N/A';
                             const duration = v.end_time && v.check_in_time ? formatDuration(v.check_in_time, v.end_time) : '-';
                             return (
                                <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-4 text-slate-600 font-mono">{formatTime(v.check_in_time)}</td>
                                    <td className="px-5 py-4 font-mono text-slate-400">#{v.patient_id.toString().slice(-4)}</td>
                                    <td className="px-5 py-4 font-bold text-slate-800">{v.patient_name}</td>
                                    <td className="px-5 py-4 font-bold" style={{color: PRIORITY_COLORS[v.priority as Priority]}}>{v.priority}</td>
                                    <td className="px-5 py-4 capitalize">
                                        <span className="px-2 py-1 bg-slate-100 rounded-md text-slate-600 text-xs font-bold uppercase">{v.status.replace('_', ' ')}</span>
                                    </td>
                                    <td className="px-5 py-4 text-slate-600">{assigned}</td>
                                    <td className="px-5 py-4 font-mono text-slate-500">{duration}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
};

export default AdminDashboard;

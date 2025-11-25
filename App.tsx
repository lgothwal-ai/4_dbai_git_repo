import React, { useState, useEffect } from 'react';
import { Activity, User, Users, ShieldAlert, MonitorSmartphone } from 'lucide-react';
import PatientKiosk from './views/PatientKiosk';
import DoctorDashboard from './views/DoctorDashboard';
import AdminDashboard from './views/AdminDashboard';
import { startPatientSimulation } from './services/simulation';

type View = 'kiosk' | 'doctor' | 'admin';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('admin');

  // Start the live patient simulation on app load
  useEffect(() => {
    startPatientSimulation();
  }, []);

  const NavItem = ({ view, icon: Icon, label }: { view: View; icon: any; label: string }) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
        currentView === view
          ? 'bg-medical-600 text-white shadow-md'
          : 'bg-white text-slate-500 hover:bg-slate-100'
      }`}
    >
      <Icon size={18} />
      <span className="font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Navigation Bar (Simulating Role Switcher for Demo) */}
      <header className="bg-white border-b border-slate-200 py-3 px-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="bg-medical-500 p-2 rounded-lg text-white">
              <Activity size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">TriageAI</h1>
              <p className="text-xs text-slate-500">Intelligent Medical Assistance</p>
            </div>
          </div>
          
          <nav className="flex items-center space-x-2 bg-slate-50 p-1 rounded-full border border-slate-200">
            <NavItem view="kiosk" icon={MonitorSmartphone} label="Patient Kiosk" />
            <NavItem view="doctor" icon={User} label="Doctor" />
            <NavItem view="admin" icon={Users} label="Admin" />
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6">
        {currentView === 'kiosk' && <PatientKiosk />}
        {currentView === 'doctor' && <DoctorDashboard />}
        {currentView === 'admin' && <AdminDashboard />}
      </main>
    </div>
  );
};

export default App;

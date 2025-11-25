
// DEPRECATED: This file is no longer used. All data is handled by the backend API.
// See services/api.ts for the new implementation.
import { Session, Doctor } from '../types';

export const store = {
    doctors: [] as Doctor[],
    getTodaysPatients: () => [] as Session[],
    getDoctorById: (id: string) => undefined as Doctor | undefined,
    updateDoctorStatus: (id: string, status: any) => {},
    addDoctor: (d: any) => {},
    addSession: (s: any) => ({ id: '0', ...s }),
    updateSession: (id: string, u: any) => {},
    autoAssign: (id: string) => {},
    markInCabin: (id: string, t: number) => {},
    markSeen: (id: string, t: number) => {},
};

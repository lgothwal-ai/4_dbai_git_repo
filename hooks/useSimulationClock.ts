
import { useState, useEffect } from 'react';

// Helper to get a timestamp for Today at a specific Hour:Minute
const getTodayAtTime = (hour: number, minute: number): number => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).getTime();
};

class SimulationClock {
    private time: number;
    private intervalId: number | null = null;
    private subscribers: Set<(time: number) => void> = new Set();

    constructor() {
        this.time = getTodayAtTime(8, 0); // Start at 8:00 AM
        this.start(); // Auto-start the clock
    }

    private start() {
        if (this.intervalId) return;
        this.intervalId = window.setInterval(() => {
            this.time += 1000;
            this.subscribers.forEach(cb => cb(this.time));
        }, 1000);
    }

    public getTime(): number {
        return this.time;
    }

    public getISOString(): string {
        return new Date(this.time).toISOString();
    }

    public subscribe(callback: (time: number) => void): () => void {
        this.subscribers.add(callback);
        // Immediately notify the new subscriber of the current time
        callback(this.time);
        return () => {
            this.subscribers.delete(callback);
        };
    }
}

// Singleton instance
const simulationClock = new SimulationClock();

// Export the instance for API usage
export const getSimulationClockInstance = () => simulationClock;


/**
 * Creates a centralized, ticking simulation clock.
 * This ensures all time-sensitive components across the app (Doctor, Admin dashboards)
 * use the exact same "now" time, which is crucial for consistent wait time calculations.
 * The clock is anchored to start at 08:00 AM on the current day.
 */
export const useSimulationClock = () => {
  const [time, setTime] = useState(() => simulationClock.getTime());

  useEffect(() => {
    const unsubscribe = simulationClock.subscribe(setTime);
    return unsubscribe;
  }, []);

  return time;
};

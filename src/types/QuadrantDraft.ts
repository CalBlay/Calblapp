// src/types/QuadrantDraft.ts
export interface QuadrantDraft {
  id: string;
  code: string;
  eventName: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  totalWorkers: number;
  numDrivers: number;
  location?: string | null;
  meetingPoint?: string;
  arrivalTime?: string | null;
  responsableId?: string;
  responsableName?: string;
  treballadors?: Array<string | { id?: string; name?: string }>;
  conductors?: Array<string | { id?: string; name?: string }>;
  brigades?: Array<Record<string, unknown>>;
  groups?: Array<Record<string, unknown>>;
  timetables?: Array<{ startTime: string; endTime: string }>;
  status: 'draft' | 'confirmed' | 'canceled';
  createdAt?: string;
  updatedAt?: string;
  service?: string | null;
  numPax?: number | null;
  commercial?: string | null;
}

export interface OrgSize {
  total: number;
  byLevel: { level: number; count: number }[];
}

export interface Headcount {
  byDivision: { division: string; level: number; count: number }[];
  byLocation: { location: string; count: number }[];
}

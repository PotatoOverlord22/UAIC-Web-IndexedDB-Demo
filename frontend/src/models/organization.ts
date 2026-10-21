export interface OrgSize {
  total: number;
  byLevel: { level: number; count: number }[];
}

export interface Headcount {
  byDivision: { division: string; level: number; count: number }[];
  byLocation: { location: string; count: number }[];
}

export const DIVISIONS = [
  "Aerospace",
  "Banking",
  "Corporate Affairs",
  "Cyberware",
  "Intelligence",
  "Media",
  "Research",
  "Security",
];

export const LOCATIONS = ["Berlin", "Hong Kong", "Kyoto", "Night City", "Osaka", "Seoul", "Singapore", "Tokyo"];

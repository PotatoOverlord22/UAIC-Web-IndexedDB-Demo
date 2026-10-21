export interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  level: number;
  division: string;
  location: string;
  managerId: number | null;
  startDate: string;
}

export interface EmployeeProfile extends Employee {
  managerChain: Employee[];
}

export const LEVEL_NAMES: Record<number, string> = {
  1: "Executive",
  2: "President",
  3: "SVP",
  4: "VP",
  5: "Director",
  6: "Senior manager",
  7: "Manager",
  8: "Individual contributor",
};

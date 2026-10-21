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

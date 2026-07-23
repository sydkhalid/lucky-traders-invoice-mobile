export type EmployeeStatus = 'active' | 'inactive';
export type SalaryMode = 'monthly' | 'daily';

export type EmployeeForm = {
  name: string;
  role: string;
  phone: string;
  salaryMode: SalaryMode;
  baseSalary: string;
  joinDate: string;
  status: EmployeeStatus;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  upiId: string;
};

export type EmployeeDocument = {
  id: string;
  employeeNo?: string;
  name: string;
  role: string;
  phone: string;
  salaryMode: SalaryMode;
  baseSalary: number;
  joinDate: string;
  status: EmployeeStatus;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankBranch: string;
  upiId: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export type SalaryForm = {
  employeeId: string;
  period: string;
  paymentDate: string;
  baseAmount: string;
  advance: string;
  deduction: string;
  paidAmount: string;
  note: string;
};

export type SalaryDocument = {
  id: string;
  employeeId: string;
  employeeNo?: string;
  employeeName: string;
  employeeRole: string;
  period: string;
  paymentDate: string;
  baseAmount: number;
  advance: number;
  deduction: number;
  paidAmount: number;
  note: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export const seedEmployeeDocuments: EmployeeDocument[] = [];
export const seedSalaryDocuments: SalaryDocument[] = [];

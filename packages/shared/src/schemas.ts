import { z } from 'zod';
import { UserRole, DevicePriority, DeviceStatus, QCDecision } from './enums';
import { validateIMEILuhn } from './imei';

export const registerLabSchema = z.object({
  labName: z.string().min(2, 'Lab name must be at least 2 characters'),
  labSlug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens').optional(),
  ownerName: z.string().min(2, 'Owner name must be at least 2 characters'),
  email: z.string().min(3, 'Username or email required'),
  password: z.string().min(4, 'Password/PIN must be at least 4 characters'),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const createEmployeeSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().min(3, 'Username or email required'),
  password: z.string().min(4, 'Temporary password/PIN must be at least 4 characters'),
  role: z.enum([
    UserRole.LAB_MANAGER,
    UserRole.QC_TECHNICIAN,
    UserRole.BOARD_TECHNICIAN,
    UserRole.VIEWER,
  ]),
  employeeId: z.string().optional(),
  phone: z.string().optional(),
});

export const newDeviceIntakeSchema = z.object({
  imei1: z.string().refine((val) => validateIMEILuhn(val).isValid, {
    message: 'IMEI 1 is invalid or fails Luhn checksum',
  }),
  imei2: z.string().optional().refine((val) => !val || validateIMEILuhn(val).isValid, {
    message: 'IMEI 2 fails Luhn checksum',
  }),
  serialNumber: z.string().optional(),
  modelId: z.string().min(1, 'iPhone model is required'),
  color: z.string().optional(),
  storage: z.string().optional(),
  physicalCondition: z.string().optional(),
  waterDamageStatus: z.boolean().default(false),
  receivedFrom: z.string().optional(),
  supplierReference: z.string().optional(),
  priority: z.enum([DevicePriority.NORMAL, DevicePriority.URGENT]).default(DevicePriority.NORMAL),
  initialNotes: z.string().optional(),
  faultIds: z.array(z.string()).min(1, 'At least one fault must be selected'),
  customFaults: z.array(z.string()).optional(),
  assignedTechnicianId: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

export const startRepairSchema = z.object({
  notes: z.string().optional(),
});

export const updateRepairProgressSchema = z.object({
  diagnosis: z.string().optional(),
  rootCause: z.string().optional(),
  workPerformed: z.string().optional(),
  componentsReplaced: z.string().optional(),
  repairNotes: z.string().min(3, 'Repair notes are required'),
  partsUsed: z.array(
    z.object({
      name: z.string().min(1),
      partNumber: z.string().optional(),
      cost: z.number().optional(),
    })
  ).optional(),
});

export const partsRequiredSchema = z.object({
  partsDescription: z.string().min(2, 'Detailed parts description is required'),
  notes: z.string().optional(),
});

export const repairNotPossibleSchema = z.object({
  reason: z.string().min(3, 'A clear reason is required for marking repair not possible'),
  notes: z.string().optional(),
});

export const submitToQCSchema = z.object({
  diagnosis: z.string().min(2, 'Diagnosis is required'),
  workPerformed: z.string().min(2, 'Summary of work performed is required'),
  repairNotes: z.string().min(2, 'Repair notes are required'),
  componentsReplaced: z.string().optional(),
  repairCost: z.number().optional(),
});

export const qcVerificationSchema = z.object({
  decision: z.enum([
    QCDecision.QC_PASSED,
    QCDecision.QC_FAILED,
    QCDecision.RETURN_TO_TECHNICIAN,
    QCDecision.MANAGER_REVIEW_REQUIRED,
  ]),
  notes: z.string().optional(),
  faultResults: z.array(
    z.object({
      faultId: z.string(),
      passed: z.boolean(),
      notes: z.string().optional(),
    })
  ).optional(),
  failureReason: z.string().optional(),
  reassignTechnicianId: z.string().optional(),
});

export const bulkDeviceIntakeSchema = z.object({
  receivedFrom: z.string().optional(),
  priority: z.enum([DevicePriority.NORMAL, DevicePriority.URGENT]).default(DevicePriority.NORMAL),
  assignedTechnicianId: z.string().optional(),
  batchName: z.string().optional(),
  items: z.array(
    z.object({
      imei1: z.string().refine((val) => validateIMEILuhn(val).isValid, {
        message: 'Invalid IMEI or Luhn check failed',
      }),
      imei2: z.string().optional(),
      serialNumber: z.string().optional(),
      modelId: z.string().min(1, 'Model required'),
      color: z.string().optional(),
      storage: z.string().optional(),
      waterDamageStatus: z.boolean().default(false),
      faultIds: z.array(z.string()).default([]),
      customFaults: z.array(z.string()).default([]),
      initialNotes: z.string().optional(),
      priority: z.enum([DevicePriority.NORMAL, DevicePriority.URGENT]).optional(),
    })
  ).min(1, 'At least one device required in batch'),
});

export const dispatchReturnSchema = z.object({
  returnedTo: z.string().optional(),
  workPerformed: z.string().optional(),
  dispatchNotes: z.string().optional(),
  dispatchDate: z.string().optional(),
  extraFaults: z.array(z.string()).optional(),
  partsCost: z.number().optional(),
  partsUsed: z.array(
    z.object({
      partName: z.string().min(1),
      partNumber: z.string().optional(),
      quantity: z.number().default(1),
      cost: z.number().optional(),
    })
  ).optional(),
});

export type RegisterLabInput = z.infer<typeof registerLabSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type NewDeviceIntakeInput = z.infer<typeof newDeviceIntakeSchema>;
export type BulkDeviceIntakeInput = z.infer<typeof bulkDeviceIntakeSchema>;
export type DispatchReturnInput = z.infer<typeof dispatchReturnSchema>;
export type UpdateRepairProgressInput = z.infer<typeof updateRepairProgressSchema>;
export type QCVerificationInput = z.infer<typeof qcVerificationSchema>;

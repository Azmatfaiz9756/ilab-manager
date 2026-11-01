import { prisma } from '../prisma';
import { ReturnClaimType } from '@ilab/shared';

export interface ReturnClaimEvaluation {
  isReturnClaim: boolean;
  claimType?: ReturnClaimType;
  existingDeviceId?: string;
  previousRepairJob?: {
    id: string;
    jobNumber: string;
    createdAt: Date;
    technicianName?: string;
    technicianId?: string;
    qcTechnicianName?: string;
    diagnosis?: string;
    repairNotes?: string;
    result?: string;
  };
  previousFaults: Array<{
    faultId?: string | null;
    faultName?: string;
    categoryName?: string;
    customName?: string | null;
  }>;
  matchingFaults: string[];
  totalPreviousReturns: number;
  warningMessage?: string;
}

export class ReturnClaimEngine {
  /**
   * Evaluates incoming device IMEIs and faults against historical records within the lab
   */
  static async evaluate(
    labId: string,
    imeis: string[],
    incomingFaultIds: string[],
    incomingCustomFaults: string[] = []
  ): Promise<ReturnClaimEvaluation> {
    const cleanImeis = imeis.map((i) => i.trim()).filter(Boolean);
    if (cleanImeis.length === 0) {
      return { isReturnClaim: false, previousFaults: [], matchingFaults: [], totalPreviousReturns: 0 };
    }

    // 1. Locate any existing device record matching ANY of the provided IMEIs within the same lab
    const matchingImeiRecords = await prisma.deviceImei.findMany({
      where: {
        labId,
        imei: { in: cleanImeis },
      },
      include: {
        device: {
          include: {
            model: true,
            repairJobs: {
              orderBy: { createdAt: 'desc' },
              include: {
                jobFaults: {
                  include: {
                    deviceFault: {
                      include: {
                        fault: {
                          include: { category: true },
                        },
                      },
                    },
                  },
                },
                assignments: {
                  include: { technician: true },
                  orderBy: { assignedAt: 'desc' },
                  take: 1,
                },
                attempts: {
                  orderBy: { attemptNumber: 'desc' },
                  take: 1,
                },
                qcInspections: {
                  include: { qcTechnician: true },
                  orderBy: { testedAt: 'desc' },
                  take: 1,
                },
              },
            },
            returnClaims: true,
          },
        },
      },
    });

    if (matchingImeiRecords.length === 0) {
      return { isReturnClaim: false, previousFaults: [], matchingFaults: [], totalPreviousReturns: 0 };
    }

    const matchedDevice = matchingImeiRecords[0].device;
    const previousJobs = matchedDevice.repairJobs;

    if (previousJobs.length === 0) {
      return {
        isReturnClaim: false,
        existingDeviceId: matchedDevice.id,
        previousFaults: [],
        matchingFaults: [],
        totalPreviousReturns: matchedDevice.totalReturnCount,
      };
    }

    // Most recent completed/previous repair job
    const lastJob = previousJobs[0];
    const latestAttempt = lastJob.attempts[0];
    const latestAssignment = lastJob.assignments[0];
    const latestQC = lastJob.qcInspections[0];

    // Collect all previous faults from the last job
    const previousFaults = lastJob.jobFaults.map((jf) => ({
      faultId: jf.deviceFault.faultId,
      faultName: jf.deviceFault.fault?.name || jf.deviceFault.customFaultName || 'Custom Fault',
      categoryName: jf.deviceFault.fault?.category.name || 'Custom',
      customName: jf.deviceFault.customFaultName,
    }));

    // Find overlapping faults
    const matchingFaults: string[] = [];
    for (const inFaultId of incomingFaultIds) {
      const match = previousFaults.find((pf) => pf.faultId === inFaultId);
      if (match) {
        matchingFaults.push(match.faultName);
      }
    }

    // Check custom fault string overlap (case-insensitive)
    for (const inCustom of incomingCustomFaults) {
      const match = previousFaults.find(
        (pf) => pf.customName && pf.customName.toLowerCase().trim() === inCustom.toLowerCase().trim()
      );
      if (match && match.customName) {
        matchingFaults.push(match.customName);
      }
    }

    // Determine Classification
    const returnCount = matchedDevice.totalReturnCount;
    let claimType: ReturnClaimType;

    if (matchingFaults.length > 0) {
      claimType = returnCount >= 1 ? ReturnClaimType.REPEAT_RETURN : ReturnClaimType.SAME_FAULT;
    } else {
      claimType = returnCount >= 1 ? ReturnClaimType.REPEAT_RETURN : ReturnClaimType.DIFFERENT_FAULT;
    }

    const warningMessage =
      claimType === ReturnClaimType.SAME_FAULT
        ? `WARNING: THIS DEVICE HAS PREVIOUSLY BEEN REPAIRED FOR THE SAME ISSUE (${matchingFaults.join(', ')}).`
        : claimType === ReturnClaimType.REPEAT_RETURN
        ? `REPEAT RETURN WARNING: This device has returned ${returnCount + 1} times to this laboratory.`
        : `PREVIOUS REPAIR NOTICE: Device was previously repaired for different faults (${previousFaults
            .map((f) => f.faultName)
            .join(', ')}).`;

    return {
      isReturnClaim: true,
      claimType,
      existingDeviceId: matchedDevice.id,
      previousRepairJob: {
        id: lastJob.id,
        jobNumber: lastJob.jobNumber,
        createdAt: lastJob.createdAt,
        technicianName: latestAssignment?.technician?.name,
        technicianId: latestAssignment?.technicianId,
        qcTechnicianName: latestQC?.qcTechnician?.name,
        diagnosis: latestAttempt?.diagnosis || undefined,
        repairNotes: latestAttempt?.workPerformed || undefined,
        result: latestAttempt?.result || undefined,
      },
      previousFaults,
      matchingFaults,
      totalPreviousReturns: returnCount,
      warningMessage,
    };
  }
}

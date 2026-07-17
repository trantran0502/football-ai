export type HealthCheckStatus =
  | "PASS"
  | "FAIL"
  | "WARNING"
  | "NOT CONFIGURED"
  | "NOT TESTABLE"
  | "OPTIONAL";

export interface HealthCheckItem {
  id: string;
  section: string;
  name: string;
  status: HealthCheckStatus;
  evidence?: string;
  message?: string;
}

export interface EnvVarAuditEntry {
  name: string;
  required: boolean;
  present: boolean;
  clientSafe: boolean;
  serverOnly: boolean;
  invalidFormat?: boolean;
  maskedValue?: string;
}

export interface ProductionHealthCheckReport {
  version: "v1";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  gitCommit: string;
  overallStatus: "PASS" | "PARTIAL PASS" | "FAIL";
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  supabaseStatus: HealthCheckStatus;
  apiFootballStatus: HealthCheckStatus;
  geminiStatus: HealthCheckStatus;
  schedulerStatus: HealthCheckStatus;
  pipelineStatus: HealthCheckStatus;
  productionStatus: HealthCheckStatus;
  items: HealthCheckItem[];
  envAudit: EnvVarAuditEntry[];
  pushResult: string;
}

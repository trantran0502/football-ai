export class WeightConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WeightConfigError";
    this.code = code;
  }
}

export class WeightConfigNotFoundError extends WeightConfigError {
  constructor(versionId: string) {
    super("WEIGHT_CONFIG_NOT_FOUND", `Weight config version not found: ${versionId}`);
    this.name = "WeightConfigNotFoundError";
  }
}

export class WeightConfigAlreadyActiveError extends WeightConfigError {
  constructor(versionId: string) {
    super(
      "WEIGHT_CONFIG_ALREADY_ACTIVE",
      `Weight config version is already active: ${versionId}`
    );
    this.name = "WeightConfigAlreadyActiveError";
  }
}

export class WeightConfigInvalidStatusError extends WeightConfigError {
  constructor(versionId: string, expected: string, actual: string) {
    super(
      "WEIGHT_CONFIG_INVALID_STATUS",
      `Weight config version ${versionId} must be ${expected}, got ${actual}`
    );
    this.name = "WeightConfigInvalidStatusError";
  }
}

export class WeightConfigRollbackTargetNotFoundError extends WeightConfigError {
  constructor(targetVersionId?: string) {
    super(
      "WEIGHT_CONFIG_ROLLBACK_TARGET_NOT_FOUND",
      targetVersionId
        ? `Rollback target archived version not found: ${targetVersionId}`
        : "No archived weight config version available for rollback"
    );
    this.name = "WeightConfigRollbackTargetNotFoundError";
  }
}

export class WeightConfigNoActiveVersionError extends WeightConfigError {
  constructor() {
    super("WEIGHT_CONFIG_NO_ACTIVE", "No active weight config version to rollback from");
    this.name = "WeightConfigNoActiveVersionError";
  }
}

export class WeightConfigTransactionError extends WeightConfigError {
  constructor(message: string) {
    super("WEIGHT_CONFIG_TRANSACTION_FAILED", message);
    this.name = "WeightConfigTransactionError";
  }
}

export class WeightConfigConflictError extends WeightConfigError {
  readonly postgresCode: string;

  constructor(postgresCode: string, message: string) {
    super("WEIGHT_CONFIG_CONFLICT", message);
    this.name = "WeightConfigConflictError";
    this.postgresCode = postgresCode;
  }
}

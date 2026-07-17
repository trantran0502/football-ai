import { runSystemValidationAndPrint } from "@/lib/systemValidation/systemValidationRunner";

const result = runSystemValidationAndPrint();
process.exit(result.report.overallStatus === "PASS" ? 0 : 1);

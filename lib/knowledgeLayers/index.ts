/**
 * Knowledge layer boundaries:
 * - `lib/knowledge` — static market interpretation for analysis/explain
 * - `lib/learning` — recommendation learning from validated history
 * - `lib/recommendation/marketKnowledge` — verified market-engine statistics
 *
 * Dependency direction: analysis -> knowledge; learning -> replay;
 * marketKnowledge -> marketEngine (never the reverse).
 */

export * from "@/lib/knowledge/index";
export * as recommendationLearning from "@/lib/learning/index";
export * as marketKnowledge from "@/lib/recommendation/marketKnowledge/index";

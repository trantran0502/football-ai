import { runMarketKnowledgeTests } from "@/lib/recommendation/marketKnowledge/marketKnowledge.test";
import { runMarketKnowledgeReplayTests } from "@/lib/recommendation/marketKnowledge/replay/marketKnowledgeReplay.test";

runMarketKnowledgeTests();
runMarketKnowledgeReplayTests();
console.log("Market Knowledge tests passed.");

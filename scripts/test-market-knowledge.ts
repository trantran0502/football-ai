import { runMarketKnowledgeIncrementalTests } from "@/lib/recommendation/marketKnowledge/incremental/marketKnowledgeIncremental.test";
import { runMarketKnowledgeTests } from "@/lib/recommendation/marketKnowledge/marketKnowledge.test";
import { runMarketKnowledgePersistenceTests } from "@/lib/recommendation/marketKnowledge/persistence/marketKnowledgePersistence.test";
import { runMarketKnowledgeReplayTests } from "@/lib/recommendation/marketKnowledge/replay/marketKnowledgeReplay.test";

runMarketKnowledgeTests();
runMarketKnowledgePersistenceTests();
runMarketKnowledgeReplayTests();
runMarketKnowledgeIncrementalTests();
console.log("Market Knowledge tests passed.");

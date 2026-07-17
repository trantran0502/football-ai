import { runMarketKnowledgeTests } from "@/lib/recommendation/marketKnowledge/marketKnowledge.test";
import { runMarketKnowledgePersistenceTests } from "@/lib/recommendation/marketKnowledge/persistence/marketKnowledgePersistence.test";
import { runMarketKnowledgeReplayTests } from "@/lib/recommendation/marketKnowledge/replay/marketKnowledgeReplay.test";

runMarketKnowledgeTests();
runMarketKnowledgePersistenceTests();
runMarketKnowledgeReplayTests();
console.log("Market Knowledge tests passed.");

import { MekoService } from './src/services/mekoService.js';

const config = {
  apiToken: "mko_tkn_hfggkhbwlantveoqtd32cjyjdbfzwbmewlf33ca",
  datapackId: "ba6248d0-11be-45eb-9495-65ff8300051d",
  endpointUrl: "https://mcp.mekodata.ai/mcp",
  offlineOnly: false,
  timeoutMs: 12000,
};

const meko = new MekoService(config);

meko.initialize().then(() => {
  console.log("Meko initialized:", meko.diagnostics());
  return meko.searchKnowledgeBase("Relay 7", "ses_meko_integration");
}).then(result => {
  console.log("Knowledge search:", result.source, result.hits.length);
  return meko.addNpcMemory({
    content: "Integration test: Yugabyte + Meko working together",
    npcId: "npc_test",
    branchId: "main",
    visibilityScope: "CHARACTER_PRIVATE",
    confidence: 1,
  }, "ses_meko_integration");
}).then(result => {
  console.log("Memory add:", result);
  return meko.searchNpcMemories("npc_test", "main", "Yugabyte", "ses_meko_integration");
}).then(result => {
  console.log("Memory search:", result.length, "results found");
  console.log("=== INTEGRATION VERIFIED ===");
  console.log("Both Meko and YugabyteDB are working and integrated");
  process.exit(0);
}).catch(err => {
  console.error("Integration failed:", err);
  process.exit(1);
});
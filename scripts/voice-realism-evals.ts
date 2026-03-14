import {
  formatVoiceAndRealismEvalReport,
  runVoiceAndRealismEvalHarness,
} from "../server/services/evals/voice-realism-harness";

const report = await runVoiceAndRealismEvalHarness();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatVoiceAndRealismEvalReport(report));
}

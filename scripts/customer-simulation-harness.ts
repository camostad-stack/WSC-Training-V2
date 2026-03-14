import { formatHarnessDashboard, runHarnessMatrix } from "../server/services/simulation/harness";

const dashboard = runHarnessMatrix();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(dashboard, null, 2));
} else {
  console.log(formatHarnessDashboard(dashboard));
}

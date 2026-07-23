import { installCarapaceBrowser } from "@cclrte/carapace/web";
import { createRoot } from "react-dom/client";

import "../src/styles.css";
import { createTodoCarapaceSession } from "./session";
import { TodoCarapaceError, TodoCarapaceWorkbench } from "./workbench";
import "./workbench.css";

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("Todo Carapace root element is missing.");
const root = createRoot(rootElement);
const created = createTodoCarapaceSession(globalThis.location.search);

if (!created.ok) {
  root.render(<TodoCarapaceError message={created.error.message} />);
} else {
  const session = created.value;
  const installedBrowser = installCarapaceBrowser({
    session,
    reset: () => {
      globalThis.location.reload();
      return undefined;
    },
    firewall: {
      onActivityError: session.harness.recordActivityFailure,
      onBlocked: session.harness.recordBlockedNetworkRequest,
    },
  });
  if (!installedBrowser.ok) {
    session.dispose();
    throw new Error(installedBrowser.error.message);
  }

  globalThis.addEventListener("pagehide", session.dispose, { once: true });
  root.render(
    <TodoCarapaceWorkbench
      activeScenario={session.activation.scenario}
      harness={session.harness}
    />,
  );
}

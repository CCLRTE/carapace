import { createCoverageCatalogSnapshot } from "@cclrte/carapace";
import {
  installCarapaceBrowserBridge,
  installCarapaceFetchFirewall,
} from "@cclrte/carapace/web";
import { createRoot } from "react-dom/client";

import "../src/styles.css";
import { todoCarapaceDefinition } from "./definition";
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
  const uninstallFirewall = installCarapaceFetchFirewall({
    beginActivity: () => {
      const lease = session.activity.begin("browser-fetch");
      if (!lease.ok) {
        session.product.recordActivityFailure();
        return () => undefined;
      }
      return () => {
        if (!lease.value.release().ok) session.product.recordActivityFailure();
      };
    },
    onBlocked: session.product.recordBlockedNetworkRequest,
  });
  const installedBridge = installCarapaceBrowserBridge({
    probe: session.probe,
    coverage: createCoverageCatalogSnapshot(todoCarapaceDefinition.coverage),
    reset: () => globalThis.location.reload(),
  });
  if (!installedBridge.ok) {
    uninstallFirewall();
    session.dispose();
    throw new Error(installedBridge.error.message);
  }

  const dispose = (): void => {
    installedBridge.value();
    uninstallFirewall();
    session.dispose();
  };
  globalThis.addEventListener("pagehide", dispose, { once: true });
  root.render(
    <TodoCarapaceWorkbench
      activeScenario={session.activation.scenario}
      harness={session.product}
    />,
  );
}

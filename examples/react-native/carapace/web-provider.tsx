import { createCarapaceReactBindings } from "@cclrte/carapace/react";
import { useLayoutEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DeviceStatusApp } from "../src/DeviceStatusApp";
import { mountDeviceStatusCarapace, type DeviceStatusSession } from "./mount";
import { DeviceStatusWorkbench } from "./workbench";
import type { DeviceStatusCarapaceWorld } from "./world";

const carapaceReact = createCarapaceReactBindings<DeviceStatusCarapaceWorld>();

function currentSearch(): string {
  return globalThis.location.search;
}

function ActivationError({ message }: { readonly message: string }) {
  return (
    <View accessibilityLabel={`Carapace error: ${message}`} nativeID="carapace-error" style={styles.error}>
      <Text accessibilityRole="header" style={styles.errorTitle}>Carapace activation failed</Text>
      <Text selectable style={styles.errorDetail}>{message}</Text>
    </View>
  );
}

function ActiveComposition({ session }: { readonly session: DeviceStatusSession }) {
  return (
    <carapaceReact.Provider store={session.store}>
      <DeviceStatusWorkbench activation={session.activation}>
        <DeviceStatusApp port={session.harness.port} />
      </DeviceStatusWorkbench>
    </carapaceReact.Provider>
  );
}

export function ReactNativeCarapaceRoot() {
  const source = currentSearch();
  const [state, setState] = useState<
    | { readonly kind: "starting" }
    | { readonly kind: "error"; readonly message: string }
    | { readonly kind: "active"; readonly session: DeviceStatusSession }
  >({ kind: "starting" });

  useLayoutEffect(() => {
    const mounted = mountDeviceStatusCarapace(source);
    if (!mounted.ok) {
      setState({ kind: "error", message: mounted.error.message });
      return;
    }
    setState({ kind: "active", session: mounted.value.session });
    return mounted.value.dispose;
  }, [source]);

  if (state.kind === "error") return <ActivationError message={state.message} />;
  if (state.kind === "starting") {
    return <View accessibilityLabel="Carapace starting" style={styles.starting} />;
  }
  return <ActiveComposition session={state.session} />;
}

const styles = StyleSheet.create({
  starting: { backgroundColor: "#10120f", flex: 1 },
  error: {
    alignItems: "center",
    backgroundColor: "#190f0f",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 28,
  },
  errorTitle: { color: "#ffb1aa", fontSize: 24, fontWeight: "800" },
  errorDetail: { color: "#d7aaa6", fontFamily: "monospace", fontSize: 13, maxWidth: 720 },
});

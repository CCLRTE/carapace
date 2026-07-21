import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { DeviceStatus, DeviceStatusPort } from "./device-status-port";

type ScreenState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly device: DeviceStatus }
  | { readonly status: "failed"; readonly message: string };

export function DeviceStatusApp({ port }: { readonly port: DeviceStatusPort }) {
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  const request = useRef(0);

  const inspect = useCallback(async (): Promise<void> => {
    const current = request.current + 1;
    request.current = current;
    setState({ status: "loading" });
    try {
      const device = await port.inspect();
      if (request.current === current) setState({ status: "ready", device });
    } catch (reason: unknown) {
      if (request.current !== current) return;
      setState({
        status: "failed",
        message: reason instanceof Error ? reason.message : "Device inspection failed.",
      });
    }
  }, [port]);

  useEffect(() => {
    void inspect();
    return () => {
      request.current += 1;
    };
  }, [inspect]);

  return (
    <View style={styles.screen} testID="device-status-example/screen/v1">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Device status</Text>
        <Text style={styles.detail}>One real screen, two runtime compositions.</Text>
      </View>

      <View accessibilityLiveRegion="polite" style={styles.card}>
        {state.status === "loading" ? (
          <Text accessibilityLabel="Device status loading" style={styles.loading}>Inspecting this device…</Text>
        ) : state.status === "failed" ? (
          <View style={styles.stack}>
            <Text accessibilityRole="alert" style={styles.errorTitle}>Inspection failed</Text>
            <Text style={styles.errorDetail}>{state.message}</Text>
          </View>
        ) : (
          <View style={styles.stack}>
            <Text style={styles.label}>PLATFORM</Text>
            <Text accessibilityLabel={`Platform: ${state.device.platform}`} style={styles.value}>
              {state.device.platform}
            </Text>
            <Text style={styles.label}>COLOR SCHEME</Text>
            <Text accessibilityLabel={`Color scheme: ${state.device.colorScheme}`} style={styles.value}>
              {state.device.colorScheme}
            </Text>
            <Text style={styles.label}>CAPTURED</Text>
            <Text accessibilityLabel={`Captured at: ${state.device.capturedAt}`} style={styles.timestamp}>
              {state.device.capturedAt}
            </Text>
          </View>
        )}
      </View>

      <Pressable accessibilityRole="button" onPress={() => void inspect()} style={styles.button}>
        <Text style={styles.buttonLabel}>Inspect again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#f4f1e8",
    flex: 1,
    gap: 22,
    justifyContent: "center",
    padding: 28,
  },
  header: { gap: 7 },
  title: { color: "#151711", fontSize: 34, fontWeight: "800", letterSpacing: -1 },
  detail: { color: "#5e6257", fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#c9c8be",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 270,
    padding: 24,
  },
  stack: { gap: 8 },
  label: { color: "#73776b", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 8 },
  value: { color: "#151711", fontSize: 25, fontWeight: "800", textTransform: "uppercase" },
  timestamp: { color: "#30342c", fontFamily: "monospace", fontSize: 13 },
  loading: { color: "#55594f", fontSize: 17, textAlign: "center" },
  errorTitle: { color: "#9f251c", fontSize: 22, fontWeight: "800" },
  errorDetail: { color: "#6f302b", fontSize: 14, lineHeight: 21 },
  button: {
    alignItems: "center",
    backgroundColor: "#20251b",
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonLabel: { color: "#f8faef", fontSize: 14, fontWeight: "800", textTransform: "uppercase" },
});

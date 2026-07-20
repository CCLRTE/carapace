import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";
import type { JsonValue } from "./core/json-value.js";
import type { CarapaceStore, CarapaceStoreSnapshot } from "./core/store.js";

export interface CarapaceProviderProps<World extends JsonValue> {
  readonly store: CarapaceStore<World>;
  readonly children: ReactNode;
}

export interface CarapaceReactBindings<World extends JsonValue> {
  readonly Context: Context<CarapaceStore<World> | null>;
  readonly Provider: (props: CarapaceProviderProps<World>) => ReactElement;
  readonly useStore: () => CarapaceStore<World>;
  readonly useSnapshot: () => CarapaceStoreSnapshot<World>;
  readonly useWorld: () => World;
}

export function createCarapaceReactBindings<World extends JsonValue>(): CarapaceReactBindings<World> {
  const StoreContext = createContext<CarapaceStore<World> | null>(null);

  const useStore = (): CarapaceStore<World> => {
    const store = useContext(StoreContext);
    if (store === null) {
      throw new Error("Carapace hooks require their matching Carapace Provider");
    }
    return store;
  };

  const useSnapshot = (): CarapaceStoreSnapshot<World> => {
    const store = useStore();
    return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  };

  const bindings: CarapaceReactBindings<World> = {
    Context: StoreContext,
    Provider: ({ store, children }: CarapaceProviderProps<World>) => createElement(
      StoreContext.Provider,
      { value: store },
      children,
    ),
    useStore,
    useSnapshot,
    useWorld: () => useSnapshot().world,
  };
  return Object.freeze(bindings);
}

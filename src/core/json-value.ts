export type JsonPrimitive = boolean | null | number | string;

export type JsonArray = readonly JsonValue[];

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

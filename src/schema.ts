import * as z from "zod";

// The generated spec is `as const`, so every schema is a deeply readonly object
// literal. zod's signature wants a mutable JSON Schema; nothing is mutated, so
// the cast is safe.
type JSONSchemaInput = Parameters<typeof z.fromJSONSchema>[0];

// Building the zod schema for every operation up front costs ~250ms. Operations
// are converted on first use instead and memoized on the spec object itself, so
// a client that touches three endpoints pays for three.
const cache = new WeakMap<object, z.ZodType>();

// `fromJSONSchema` can only ever return `ZodType<unknown>`. The caller knows
// which schema it passed, so it can supply the matching type — see
// `OperationOutput` / `OperationError`.
export function toZod<T = unknown>(schema: object): z.ZodType<T> {
  const cached = cache.get(schema);
  if (cached !== undefined) {
    return cached as z.ZodType<T>;
  }

  const built = z.fromJSONSchema(schema as JSONSchemaInput);
  cache.set(schema, built);

  return built as unknown as z.ZodType<T>;
}

import type { FromSchema } from "json-schema-to-ts";
import type * as z from "zod";

import { toZod } from "./schema.ts";
import { composeSpec } from "./spec.ts";

export type ComposeSpecification = FromSchema<typeof composeSpec>;

// `toZod` is untyped by construction; the schema and the type are derived from
// the same object, so this asserts a relationship the compiler can't see.
export const ComposeSpecificationSchema = toZod(composeSpec) as unknown as z.ZodType<ComposeSpecification>;

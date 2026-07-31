// Normalizes the Docker Engine API and Compose Specification schemas into a
// single data module (`src/spec.ts`).
//
// This step emits *data*, never code: the same `as const` object is consumed at
// runtime by zod's `fromJSONSchema` and at compile time by json-schema-to-ts's
// `FromSchema`, so the runtime validation and the static types can't drift.

import { writeFile } from "node:fs/promises";

import { dereference } from "@apidevtools/json-schema-ref-parser";
import { fetch } from "undici";
import * as YAML from "yaml";

import { applyFixes } from "./fixes.mjs";

const ENGINE_SCHEMA_URL = "https://docs.docker.com/reference/api/engine/version/v1.55.yaml";
// TODO: see if they finally added versioning: https://github.com/compose-spec/compose-spec/issues/104
const COMPOSE_SCHEMA_URL =
  "https://raw.githubusercontent.com/compose-spec/compose-spec/refs/heads/main/schema/compose-spec.json";

const STREAM_TYPES = new Set([
  "application/vnd.docker.raw-stream",
  "application/vnd.docker.multiplexed-stream",
]);

// keys of a swagger 2.0 parameter that are also json schema keywords; the rest
// (name, in, required, collectionFormat, ...) describe the parameter, not its shape
const PARAMETER_SCHEMA_KEYS = new Set([
  "type",
  "format",
  "items",
  "enum",
  "default",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "maxItems",
  "minItems",
  "uniqueItems",
  "multipleOf",
]);

// prose bloats the artifact several times over and carries no type or
// validation information
const PROSE_KEYS = new Set(["description", "example", "examples", "summary", "title", "x-nullable"]);

// keywords whose value is itself a schema
const SUBSCHEMA_KEYS = new Set([
  "not",
  "if",
  "then",
  "else",
  "contains",
  "propertyNames",
  "additionalProperties",
  "additionalItems",
  "unevaluatedProperties",
  "unevaluatedItems",
]);

// keywords whose value is a map of name -> schema. the names are user data, so
// they must never be treated as keywords (`Image.Search` really does return a
// property called `description`)
const SCHEMA_MAP_KEYS = new Set(["properties", "patternProperties", "definitions", "$defs", "dependentSchemas"]);

// keywords whose value is an array of schemas
const SCHEMA_ARRAY_KEYS = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);

async function main() {
  const engine = YAML.parse(await (await fetch(ENGINE_SCHEMA_URL)).text());
  applyFixes(engine);
  await dereference(engine);

  const compose = await (await fetch(COMPOSE_SCHEMA_URL)).json();
  await dereference(compose);

  const operations = buildOperations(engine);
  const composeSpec = strip(compose);

  await writeFile("./src/spec.ts", render(operations, composeSpec), { flush: true, mode: 0o644 });

  const count = Object.values(operations).reduce((acc, tag) => acc + Object.keys(tag).length, 0);
  console.log(`src/spec.ts: ${Object.keys(operations).length} tags, ${count} operations`);
}

function buildOperations(schema) {
  const byTag = {};

  for (const path in schema.paths) {
    for (const method in schema.paths[path]) {
      const props = schema.paths[path][method];
      const { parameters, responses, operationId, tags } = props;

      if (tags.length > 1) {
        throw Error(`multiple tags in ${path}:${method}`);
      }

      // TODO: not sure how to support websocket, container exits as soon as we attach
      if (props.websocket === true) {
        continue;
      }

      const tag = tags[0];
      const name = operationId === tag ? "Call" : operationId.replace(tag, "");

      const input = buildInput(parameters, path, method);
      const output = buildOutput(props, responses, path, method);

      byTag[tag] ??= {};
      byTag[tag][name] = {
        method: method.toUpperCase(),
        path,
        ...(input ? { input } : {}),
        output,
      };
    }
  }

  return byTag;
}

function buildInput(parameters, path, method) {
  if (!parameters) {
    return undefined;
  }

  const properties = {};
  const required = [];

  for (const location of ["path", "query"]) {
    const params = parameters.filter((p) => p.in === location);
    if (params.length === 0) {
      continue;
    }

    properties[location] = {
      type: "object",
      properties: Object.fromEntries(params.map((p) => [p.name, parameterSchema(p)])),
      required: params.filter((p) => p.required).map((p) => p.name),
      // the wrapper objects are ours, not docker's, so it is safe to be strict:
      // this is what makes typos in `path`/`query` a compile error
      additionalProperties: false,
    };

    if (properties[location].required.length > 0) {
      required.push(location);
    }
  }

  const body = parameters.filter((p) => p.in === "body");
  if (body.length > 1) {
    throw Error(`multi body at ${path}:${method}`);
  }

  if (body.length === 1) {
    properties.body = body[0].schema;
    if (body[0].required) {
      required.push("body");
    }
  }

  if (Object.keys(properties).length === 0) {
    return undefined;
  }

  return strip({ type: "object", properties, required, additionalProperties: false });
}

function buildOutput(props, responses, path, method) {
  const streams = new Set(props.produces).intersection(STREAM_TYPES).size > 0;

  let schema;
  let switchesProtocol = false;
  const errors = [];

  for (const [codeStr, response] of Object.entries(responses)) {
    const code = Number.parseInt(codeStr);

    if (code === 101) {
      switchesProtocol = true;
    } else if (code === 200 || code === 201) {
      if (response.schema) {
        schema = response.schema;
      }
    } else if (code === 204 || code === 304) {
      // no content / not modified
    } else if (code >= 400 && code <= 599) {
      const error = structuredClone(response.schema);
      error.required = [...new Set([...(error.required ?? []), "code"])];
      error.properties.code = { const: code, description: "The error code" };
      errors.push(error);
    } else {
      throw Error(`unhandled response ${code} at ${path}:${method}`);
    }
  }

  return {
    // an upgraded connection hands back a raw socket, a chunked one a stream of lines
    upgrade: streams && !props.chunked,
    chunked: Boolean(props.chunked) || (!switchesProtocol && streams),
    ...(schema ? { schema: strip(schema) } : {}),
    // json schema has no discriminated union; each branch pins `code` to a const,
    // which is enough for both parsing and type narrowing
    error: strip(errors.length === 1 ? errors[0] : { anyOf: errors }),
  };
}

function parameterSchema(param) {
  if (param.schema) {
    return param.schema;
  }

  return Object.fromEntries(Object.entries(param).filter(([key]) => PARAMETER_SCHEMA_KEYS.has(key)));
}

// Drops annotation keywords, walking only where subschemas actually live.
// Values of `enum`/`const`/`default` are data, not schemas, so they are copied
// through untouched.
function strip(schema) {
  if (Array.isArray(schema)) {
    return schema.map(strip);
  }

  if (schema === null || typeof schema !== "object") {
    return schema;
  }

  const out = {};

  for (const [key, value] of Object.entries(schema)) {
    if (PROSE_KEYS.has(key)) {
      continue;
    }

    if (SCHEMA_MAP_KEYS.has(key) && value !== null && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, strip(sub)]));
    } else if (SCHEMA_ARRAY_KEYS.has(key) && Array.isArray(value)) {
      out[key] = value.map(strip);
    } else if (SUBSCHEMA_KEYS.has(key) || key === "items") {
      // `items` is a single schema in draft-4/swagger and may be an array in older drafts
      out[key] = Array.isArray(value) ? value.map(strip) : strip(value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

function render(operations, composeSpec) {
  return [
    "// Generated by generator/generate.mjs from the Docker Engine API and Compose",
    "// Specification schemas. This file is data, not code — do not edit.",
    "",
    `export const ops = ${JSON.stringify(operations)} as const;`,
    "",
    `export const composeSpec = ${JSON.stringify(composeSpec)} as const;`,
    "",
  ].join("\n");
}

await main();

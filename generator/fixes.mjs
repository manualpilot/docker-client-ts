// Fixes mostly to work around the broken json marshaling in golang, translated
// into plain JSON Schema keywords.
//
// NOTE: zod's fromJSONSchema understands only standard JSON Schema, so
// nullability has to be expressed as `type: ["x", "null"]` (or an anyOf branch
// for $refs) rather than the swagger/openapi `nullable` / `x-nullable` vendor
// extensions, which it silently ignores.

// keywords whose value is a single schema sitting in a value position
const VALUE_KEYS = ["items", "additionalProperties"];

// keywords whose value is a map of name -> schema, each in a value position.
// the names are user data, never keywords
const VALUE_MAP_KEYS = ["properties", "patternProperties"];

// traversed but never fixed: widening one branch of an `allOf` says nothing
// useful about the composed type, and `Swarm` composes `ClusterInfo` that way
const COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf"];

function isSchema(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// A map is how golang's `map[string]T` is spelled; a nil one marshals to null
// exactly like a nil slice does.
function isMap(schema) {
  return schema.type === "object" && isSchema(schema.additionalProperties);
}

function isNullable(schema) {
  if (Array.isArray(schema.type)) {
    return schema.type.includes("null");
  }

  return Array.isArray(schema.anyOf) && schema.anyOf.some((branch) => branch.type === "null");
}

function makeNullable(schema) {
  if (isNullable(schema)) {
    return;
  }

  if (schema.type !== undefined && schema.type !== "null") {
    schema.type = Array.isArray(schema.type) ? [...new Set([...schema.type, "null"])] : [schema.type, "null"];
    return;
  }

  // a $ref (or anything else without an inline type) can't take a type array,
  // so widen it with a union instead
  if (schema.$ref !== undefined) {
    const { $ref, ...rest } = schema;
    for (const key of Object.keys(schema)) {
      delete schema[key];
    }
    Object.assign(schema, rest, { anyOf: [{ $ref }, { type: "null" }] });
  }
}

function fixSchema(schema) {
  // golang marshals a nil slice and a nil map as null rather than [] / {}.
  // `Volume.Labels` is even declared `x-nullable: false` and still comes back
  // null, so the declaration is not worth consulting here
  if (schema.type === "array" || isMap(schema)) {
    makeNullable(schema);
  }

  if (schema["x-nullable"] === true) {
    makeNullable(schema);
  }

  if (Array.isArray(schema.enum)) {
    if (schema.enum.some((value) => value !== null && typeof value === "object")) {
      // docker spells "an empty object, used as a set member" as `enum: [{}]`
      // (ContainerConfig.ExposedPorts, .Volumes). zod compiles enum members to
      // a value check that a fresh `{}` can never satisfy, and `type: object`
      // alone already says everything the enum was saying
      delete schema.enum;
    } else if (schema.enum.every((value) => typeof value === "string") && !schema.enum.includes("")) {
      // a golang zero value reaches the wire as "" whether or not it is a
      // documented member. only string enums: `ChangeType` is `enum: [0, 1, 2]`
      schema.enum.push("");
    }
  }

  // if an input type has a default value on the docker backend
  // then we want the option to omit it completely
  if (Object.hasOwn(schema, "default")) {
    delete schema.default;
  }
}

// Walks every subschema reachable from `root`, fixing the ones in a value
// position — where a concrete JSON value lands, and so where golang can put a
// null. Recursing (rather than reading `definitions.*.properties.*`) is what
// reaches `HostConfig`, whose 39 properties live inside an `allOf` branch.
function walk(root, seen) {
  if (!isSchema(root) || seen.has(root)) {
    return;
  }

  seen.add(root);

  for (const key of COMPOSITION_KEYS) {
    for (const branch of root[key] ?? []) {
      walk(branch, seen);
    }
  }

  for (const key of VALUE_MAP_KEYS) {
    for (const name in root[key]) {
      const child = root[key][name];
      if (isSchema(child)) {
        fixSchema(child);
        walk(child, seen);
      }
    }
  }

  for (const key of VALUE_KEYS) {
    const child = root[key];
    for (const item of Array.isArray(child) ? child : [child]) {
      if (isSchema(item)) {
        fixSchema(item);
        walk(item, seen);
      }
    }
  }
}

export function applyFixes(schema) {
  const seen = new Set();

  for (const definition in schema.definitions) {
    // the definition itself is a value position: `GenericResources` is a bare
    // array, and ~20 definitions (`ContainerState`, `EndpointIPAMConfig`, ...)
    // carry `x-nullable` on the type rather than on each use site. fixing it
    // here covers every `$ref` to it, since dereferencing shares the object
    fixSchema(schema.definitions[definition]);
    walk(schema.definitions[definition], seen);
  }

  // pointer fields the schema forgets to mark: all three are `*int64` / `*bool`
  // on the golang side and the daemon returns null for all three, but only
  // `PidsLimit` is declared `x-nullable`. no general rule sees these
  for (const property of ["MemorySwappiness", "OomKillDisable"]) {
    makeNullable(schema.definitions.Resources.properties[property]);
  }

  // it is not possible to infer that this endpoint returns a stream
  schema.paths["/images/create"].post.chunked = true;
  schema.paths["/containers/{id}/attach/ws"].get.websocket = true;

  // these four produce a raw/multiplexed stream without announcing an upgrade,
  // so they are indistinguishable from the hijacking endpoints in the schema.
  // without this they come out `upgrade: true` and undici waits on a 101 that
  // never arrives
  for (const path of ["/containers/{id}/logs", "/services/{id}/logs", "/tasks/{id}/logs"]) {
    schema.paths[path].get.chunked = true;
  }

  // the inverse: exec start really does hijack, but only documents the 200 it
  // returns when the client omits the Upgrade header. undici always sends one
  schema.paths["/exec/{id}/start"].post.responses[101] = {
    description: "no error, hints proxy about hijacking",
  };

  for (const path in schema.paths) {
    for (const endpoint in schema.paths[path]) {
      if (schema.paths[path][endpoint].parameters) {
        for (const param of schema.paths[path][endpoint].parameters) {
          if (Object.hasOwn(param, "default")) {
            // don't actually send the documented default value,
            // we know that the documentation can be wrong
            delete param.default;
          }

          // a body parameter carries a schema like any definition does
          if (isSchema(param.schema)) {
            walk(param.schema, seen);
          }
        }
      }
    }
  }

  for (const path in schema.paths) {
    for (const endpoint in schema.paths[path]) {
      const codes = new Set(Object.keys(schema.paths[path][endpoint].responses));

      // 400 Bad Request is commonly returned from many endpoints yet missing
      // from some responses -- `POST /containers/{id}/kill` documents only
      // 204/404/409/500 and answers an unknown signal with a 400
      if (!codes.has("400")) {
        schema.paths[path][endpoint].responses[400] = {
          description: "bad request",
          // the generator pins `code` to the status; the shape is whatever
          // every other error response in the document uses
          schema: { $ref: "#/definitions/ErrorResponse" },
        };
      }
    }
  }
}

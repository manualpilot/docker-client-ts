// fixes mostly to work around the broken json marshaling in golang
export function applyFixes(schema) {
  for (const definition in schema.definitions) {
    if (schema.definitions[definition].type === "array") {
      schema.definitions[definition].nullable = true;
    }

    for (const property in schema.definitions[definition].properties) {
      if (schema.definitions[definition].properties[property].type === "array") {
        schema.definitions[definition].properties[property].nullable = true;
      }

      if ("x-nullable" in schema.definitions[definition].properties[property]) {
        schema.definitions[definition].properties[property].nullable = true;
      }

      if ("enum" in schema.definitions[definition].properties[property]) {
        schema.definitions[definition].properties[property].enum.push("");
      }

      // if an input type has a default value on the docker backend
      // then we want the option to omit it completely
      if (
        schema.definitions[definition].properties[property].default ||
        schema.definitions[definition].properties[property].default === false
      ) {
        schema.definitions[definition].properties[property].default = undefined;
      }
    }
  }
}
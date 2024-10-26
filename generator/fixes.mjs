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

      if (
        "x-nullable" in schema.definitions[definition].properties[property] &&
        schema.definitions[definition].properties[property] === true
      ) {
        schema.definitions[definition].properties[property].nullable = true;
      }

      if ("enum" in schema.definitions[definition].properties[property]) {
        schema.definitions[definition].properties[property].enum.push("");
      }

      // if an input type has a default value on the docker backend
      // then we want the option to omit it completely
      if (schema.definitions[definition].properties[property].hasOwnProperty("default")) {
        schema.definitions[definition].properties[property].default = undefined;
      }
    }
  }

  // it is not possible to infer that this endpoint returns a stream
  schema.paths["/images/create"].post.chunked = true;

  //
  schema.paths["/containers/{id}/logs"].get.chunked = true;

  for (const path in schema.paths) {
    for (const endpoint in schema.paths[path]) {
      if (schema.paths[path][endpoint].parameters) {
        for (const param of schema.paths[path][endpoint].parameters) {
          if (param.hasOwnProperty("default")) {
            // don't actually send the documented default value,
            // we know that the documentation can be wrong
            param.default = undefined;
          }
        }
      }
    }
  }

  for (const path in schema.paths) {
    for (const endpoint in schema.paths[path]) {
      const codes = new Set(Object.keys(schema.paths[path][endpoint].responses));

      // 400 Bad Request is commonly returned from many endpoints yet missing from some responses
      if (!codes.has("400")) {
        schema.paths[path][endpoint].responses[400] = {
          description: "bad request",
          schema: {
            description : "Represents an error.",
            type : "object",
            required : [ "message", "code" ],
            properties : {
              message : {
                description : "The error message.",
                type : "string",
              },
              code : {
                const : 400,
                description : "The error code",
              },
            },
          }
        };
      }
    }
  }
}

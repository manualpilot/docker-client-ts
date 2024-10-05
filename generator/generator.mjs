import { cp, mkdir, rm, writeFile } from "node:fs/promises";

import { dereference } from "@apidevtools/json-schema-ref-parser";
import { jsonSchemaToZod } from "json-schema-to-zod";
import nunjucks from "nunjucks";
import * as YAML from "yaml";
import { fetch } from "undici";

import { applyFixes } from "./fixes.mjs";
import { TEMPLATES } from "./templates.mjs";

async function main() {

  const schema = YAML.parse(
    await (await fetch("https://docs.docker.com/reference/api/engine/version/v1.47.yaml")).text(),
  );

  applyFixes(schema);
  await dereference(schema);

  const byTag = {};

  for (const path in schema.paths) {
    for (const method in schema.paths[path]) {
      const props = schema.paths[path][method];
      const { parameters, responses, tags, operationId } = props;

      if (tags.length > 1) {
        throw Error(`multiple tags in ${path}:${method}`);
      }

      const tag = tags[0];
      const name = operationId === tag ? "Call" : operationId.replace(tag, "");
      const input = {};

      if (parameters) {
        const inPath = parameters.filter((q) => q.in === "path");
        const inQuery = parameters.filter((q) => q.in === "query");
        const inBody = parameters.filter((q) => q.in === "body");

        if (inPath.length > 0) {
          input.path = {
            type: "object",
            required: inPath.filter((i) => i.required).length > 0,
            properties: inPath.reduce((acc, val) => ({ ...acc, [val.name]: val }), {}),
          };
        }

        if (inQuery.length > 0) {
          input.query = {
            type: "object",
            required: inQuery.filter((i) => i.required).length > 0,
            properties: inQuery.reduce((acc, val) => ({ ...acc, [val.name]: val }), {}),
          };
        }

        if (inBody.length > 0) {
          if (inBody.length > 1) {
            throw Error(`multi body: ${parameters}`);
          }

          input.body = inBody[0].schema;
        }
      }

      const output = {
        errors: [],
        websocket: false,
        empty: false,
        noChange: false,
      };

      for (const [codeStr, response] of Object.entries(responses)) {
        const code = parseInt(codeStr);

        if (code === 101) {
          output.websocket = true;
        }

        else if (code === 200 || code === 201) {
          if (response.schema) {
            output.schema = response.schema;
          } else {
            output.empty = true;
          }
        }

        else if (code === 204) {
          output.empty = true;
        }

        else if (code === 304) {
          output.noChange = true;
        }

        else if (code >= 400 && code <= 599) {
          const errorSchema = JSON.parse(JSON.stringify(response.schema));
          errorSchema.required.push("code");
          errorSchema.properties.code = {
            type: "number",
            description: "The error code",
          }

          output.errors.push(errorSchema);
        }

        else {
          throw Error(`unhandled response ${code} at ${path}:${method}`)
        }
      }

      if (byTag[tag] === undefined) {
        byTag[tag] = {};
      }

      byTag[tag][name] = {
        output,
        path,
        method: method.toUpperCase(),
      };

      if (Object.keys(input).length > 0) {
        byTag[tag][name].input = {
          type: "object",
          properties: input,
        };
      }
    }
  }

  const files = {};
  const renderer = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: true,
    trimBlocks: true,
  });

  files["./src/index.ts"] = renderer.renderString(TEMPLATES.root, {
    tags: Object.keys(byTag),
  });

  files["./src/tags/index.ts"] = renderer.renderString(TEMPLATES.tagsIndex, {
    tags: Object.keys(byTag),
  });

  for (const [tag, endpoints] of Object.entries(byTag)) {

    const ctx = { tag, endpoints: [] };
    for (const [name, props] of Object.entries(endpoints)) {
      const attribs = {
        name,
        method: props.method,
        path: props.path,
        path_has_params: props.path.includes("{") && props.path.includes("}"),
      };

      if ("input" in props) {
        attribs.input_name = `${name}Input`;
        attribs.input_type = jsonSchemaToZod(props.input);

        if (props.input.properties.query) {
          attribs.input_has_query = true;
        }

        if (props.input.properties.body) {
          attribs.input_has_body = true;
        }
      }

      if (!props.output.empty) {
        attribs.output_name = `${name}Output`;
        attribs.output_type = jsonSchemaToZod(props.output.schema);
      }

      attribs.error = props.output.errors.length === 1 ?
        jsonSchemaToZod(props.output.errors[0]) :
        jsonSchemaToZod({ anyOf: props.output.errors });

      ctx.endpoints.push(attribs);
    }

    files[`./src/tags/${tag.toLowerCase()}.ts`] = renderer.renderString(TEMPLATES.tag, ctx);
  }

  await rm("./src", { recursive: true, force: true });
  await mkdir("./src/tags", { mode: 0o755, recursive: true });
  await cp("./static", "./src", { recursive: true });

  for (const [filePath, content] of Object.entries(files)) {
    await writeFile(filePath, content, { flush: true, mode: 0o644 });
  }
}

(async () => await main())();
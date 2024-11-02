import { writeFile } from "node:fs/promises";

import { compile } from "json-schema-to-typescript";
import { generate } from "ts-to-zod";
import { fetch } from "undici";

// TODO: see if they finally added versioning: https://github.com/compose-spec/compose-spec/issues/104
const SCHEMA_URL = "https://raw.githubusercontent.com/compose-spec/compose-spec/refs/heads/main/schema/compose-spec.json";

// json-schema -> typescript -> zod
// done this way because going to zod directly produces an extremely complex schema
// mostly due to patternProperties abuse
async function main() {
  const schema = await (await fetch(SCHEMA_URL)).json();
  const ts = await compile(schema, "docker-compose");
  const out = generate({ sourceText: ts, getSchemaName: (id) => id[0].toUpperCase() + id.slice(1) + "Schema" });
  await writeFile("./src/compose.ts", out.getZodSchemasFile(""));
}

(async () => await main())();

import type { Dispatcher, Pool } from "undici";

import { chunked, sub, terminal } from "./etc.ts";
import { toZod } from "./schema.ts";
import { ops } from "./spec.ts";
import type { DockerAPI } from "./types.ts";

type OperationSpec = {
  method: string;
  path: string;
  output: {
    upgrade: boolean;
    chunked: boolean;
    schema?: object;
    error: object;
  };
};

type CallInput = {
  path?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
};

// One dispatcher drives every operation; what used to be a rendered function
// body per endpoint is now a lookup in the spec.
async function call(pool: Pool, op: OperationSpec, input?: CallInput): Promise<unknown> {
  const method = op.method as Dispatcher.HttpMethod;
  const path = op.path.includes("{") ? sub(op.path, input?.path ?? {}) : op.path;

  if (op.output.upgrade) {
    // TODO: how do we post initial body? by the time upgrade returns, response headers already posted
    return terminal(await pool.upgrade({ method, path }));
  }

  const hasBody = input?.body !== undefined;

  const resp = await pool.request({
    method,
    path,
    ...(input?.query !== undefined ? { query: input.query } : {}),
    headers: hasBody ? { "Content-Type": "application/json" } : {},
    ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
  });

  if (resp.statusCode >= 200 && resp.statusCode <= 299) {
    if (op.output.chunked) {
      return chunked(resp);
    }

    if (op.output.schema !== undefined) {
      return toZod(op.output.schema).parse(await resp.body.json());
    }

    // an unread body keeps the connection checked out of the pool
    await resp.body.dump();
    return;
  }

  const errorBody = (await resp.body.json()) as object;
  throw toZod(op.output.error).parse({ code: resp.statusCode, ...errorBody });
}

export function buildAPI(pool: Pool): DockerAPI {
  const api: Record<string, Record<string, unknown>> = {};

  for (const [tag, endpoints] of Object.entries(ops)) {
    const group: Record<string, unknown> = {};

    for (const [name, op] of Object.entries(endpoints)) {
      group[name] = (input?: CallInput) => call(pool, op as unknown as OperationSpec, input);
    }

    api[tag] = group;
  }

  return api as unknown as DockerAPI;
}

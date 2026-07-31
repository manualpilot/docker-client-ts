import { expect, test } from "vitest";

import { DockerClient, type OperationError, ops, toZod } from "../src/index.ts";

// the per-tag schema modules are gone; every operation's schemas now hang off
// the spec and are converted on demand
const LogsError = toZod<OperationError<"Container", "Logs">>(ops.Container.Logs.output.error);

test("error", async () => {
  const client = await DockerClient({
    baseURL: new URL("unix:/var/run/docker.sock"),
  });

  expect.assertions(1);

  try {
    await client.Container.Logs({ path: { id: "fake_id" } });
  } catch (e: unknown) {
    const err = LogsError.safeParse(e);
    expect(err.data?.code).toBeDefined();
  }
});

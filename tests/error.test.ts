import { DockerClient } from "~/index.ts";
import { LogsError } from "~/tags/container.ts";

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

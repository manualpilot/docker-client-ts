import * as console from "node:console";
import { DockerClient } from "~/index.ts";

test("DockerClient", async () => {
  const client = DockerClient(new URL("unix:/var/run/docker.sock"));
  const systemInfo = await client.System.Info();
  expect(systemInfo.ID).toHaveLength(36);

  await client.Image.Create({
    query: {
      platform: "",  // TODO: fix defaults in query params
      fromImage: "hello-world",
      tag: "latest",
    },
  });

  // TODO: is there a better way, do we have to use containerd?
  let found = false;
  while (!found) {
    const resp = await client.Image.List({});
    found = resp.find((i) => i.RepoTags?.includes('hello-world:latest')) !== undefined;
  }

  const createResp = await client.Container.Create({
    body: {
      Image: "hello-world",
    },
  });

  expect(createResp.Id).toBeDefined();

  await client.Container.Start({
    path: {
      id: createResp.Id!,
    },
  });

  const waitResp = await client.Container.Wait({
    path: {
      id: createResp.Id!,
    },
  });

  expect(waitResp.StatusCode).toBe(0);

  await client.Container.Delete({
    path: {
      id: createResp.Id!,
    },
  });
});

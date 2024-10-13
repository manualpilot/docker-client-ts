import { DockerClient } from "~/index.ts";

test("plain", async () => {
  const client = await DockerClient({
    baseURL: new URL("unix:/var/run/docker.sock"),
  });

  const systemInfo = await client.System.Info();
  expect(systemInfo.ID).toHaveLength(36);

  // TODO: this returns transfer-encoding chunked
  await client.Image.Create({
    query: {
      fromImage: "hello-world",
      tag: "latest",
    },
    // TODO: support private registry auth header
  });

  // TODO: pull image is an streaming endpoint, shouldn't need this kind of check
  let found = false;
  while (!found) {
    const resp = await client.Image.List();
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

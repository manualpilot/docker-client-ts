import type { Observable } from "rxjs";
import { buffer, toArray } from "rxjs/operators";

import { DockerClient } from "~/index.ts";

test("plain", async () => {
  const client = await DockerClient({
    baseURL: new URL("unix:/var/run/docker.sock"),
  });

  const systemInfo = await client.System.Info();
  expect(systemInfo.ID).toHaveLength(36);

  const pullResp = await client.Image.Create({
    query: {
      fromImage: "hello-world",
      tag: "latest",
    },
    // TODO: support private registry auth header
  });

  const pullLogs = await collect(pullResp);
  console.log(pullLogs);

  const createResp = await client.Container.Create({
    body: {
      Image: "hello-world",
    },
  });

  const containerID = createResp.Id;
  if (!containerID) {
    // force non-null cast for rest of the test
    fail("container id not defined");
  }

  await client.Container.Start({
    path: {
      id: containerID,
    },
  });

  const waitResp = await client.Container.Wait({
    path: {
      id: containerID,
    },
  });

  expect(waitResp.StatusCode).toBe(0);

  await client.Container.Delete({
    path: {
      id: containerID,
    },
  });
});

async function collect(observable: Observable<string>): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
    observable.pipe(buffer(observable), toArray()).subscribe((value) => {
      resolve(value.flat());
    });
  });
}

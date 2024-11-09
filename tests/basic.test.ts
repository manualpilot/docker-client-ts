import { DockerClient } from "../lib";
import { collect } from "./utils";

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
  });

  const pullLogs = await collect(pullResp);
  expect(pullLogs.length).toBeGreaterThan(0);

  const createResp = await client.Container.Create({
    body: {
      Image: "hello-world",
    },
  });

  await client.Container.Start({
    path: {
      id: createResp.Id,
    },
  });

  const waitResp = await client.Container.Wait({
    path: {
      id: createResp.Id,
    },
  });

  expect(waitResp.StatusCode).toBe(0);

  const containerLogsResp = await client.Container.Logs({
    path: {
      id: createResp.Id,
    },
    query: {
      stdout: true,
      stderr: true,
    },
  });

  const containerLogs = await collect(containerLogsResp);
  expect(containerLogs.length).toBeGreaterThan(0);

  await client.Container.Delete({
    path: {
      id: createResp.Id,
    },
  });
});

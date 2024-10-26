import { DockerClient } from "../src";
import { collect } from "./utils";

test("terminal", async () => {
  const client = await DockerClient({
    baseURL: new URL("unix:/var/run/docker.sock"),
  });

  const pullResp = await client.Image.Create({
    query: {
      fromImage: "debian",
      tag: "latest",
    },
  });

  await collect(pullResp);

  const createResp = await client.Container.Create({
    body: {
      Image: "debian",
      Cmd: ["bash"],
      Tty: true,
    },
  });

  await client.Container.Start({
    path: { id: createResp.Id },
  });

  const execResp = await client.Exec.Container({
    path: { id: createResp.Id },
    body: {
      Privileged: false, // TODO: this shouldn't be mandatory
      Cmd: ["/bin/bash"],
      Tty: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    },
  });

  const terminal = await client.Exec.Start({
    path: { id: execResp.Id },
    // TODO: initial body
  });

  const output: string[] = [];
  terminal.output.subscribe((value) => output.push(value));

  terminal.input.next("whoami");
  terminal.input.next("uname -s");

  await delay(1);

  expect(output).toHaveLength(2);
  expect(output[0].trim()).toEqual("root");
  expect(output[1].trim()).toEqual("Linux");

  terminal.close();

  await client.Container.Stop({
    path: { id: createResp.Id },
  });

  await client.Container.Delete({
    path: { id: createResp.Id },
  });
});

async function delay(s: number) {
  return new Promise((resolve) => setTimeout(resolve, s * 1000));
}

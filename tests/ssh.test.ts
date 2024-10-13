import { createConnection } from "node:net";

import { Server, utils } from "ssh2";

import { DockerClient } from "~/index.ts";

const SSH_PORT = 34567;

test("ssh", async () => {
  const onPiped = jest.fn();
  await runServer(onPiped);

  const client = await DockerClient({
    baseURL: new URL("unix:/var/run/docker.sock"),
    ssh: {
      user: "hello",
      host: "127.0.0.1",
      port: SSH_PORT,
      key: Buffer.from(utils.generateKeyPairSync("ed25519").private, "utf8"),
    },
  });

  const systemInfo = await client.System.Info();
  expect(systemInfo.ID).toHaveLength(36);

  expect(onPiped).toHaveBeenCalled();

  // TODO: wait for clean-up after connection ended
  await delay(5);
});

async function delay(seconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1_000);
  });
}

async function runServer(onPiped: jest.Mock) {
  return new Promise<void>((resolve) => {
    new Server({ hostKeys: [utils.generateKeyPairSync("ed25519").private] }, (client) => {
      client
        .on("authentication", (context) => {
          context.accept();
        })
        .on("ready", () => {
          client.on("openssh.streamlocal", (accept, _, info) => {
            const socket = createConnection(info.socketPath);
            socket.on("ready", () => {
              const stream = accept();
              stream.pipe(socket);
              socket.pipe(stream);
              onPiped();
            });
          });
        });
    }).listen(SSH_PORT, "127.0.0.1", () => {
      return resolve();
    });
  });
}

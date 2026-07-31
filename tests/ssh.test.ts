import { createConnection } from "node:net";

import { Server, utils } from "ssh2";
import { expect, type Mock, test, vi } from "vitest";

import { DockerClient } from "../src/index.ts";

const SSH_PORT = 34567;

test("ssh", async () => {
  const onPiped = vi.fn();
  const server = await startServer(onPiped);

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

  await client.close();
  await stopServer(server);
});

async function stopServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

async function startServer(onPiped: Mock) {
  return new Promise<Server>((resolve) => {
    const server = new Server({ hostKeys: [utils.generateKeyPairSync("ed25519").private] }, (client) => {
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
    });

    server.listen(SSH_PORT, "127.0.0.1", () => {
      return resolve(server);
    });
  });
}

import { randomUUID } from "node:crypto";
import { access, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

import { Client } from "ssh2";

type Connection = {
  id: string;
  client: Client;
  free: boolean;
};

type SSHContext = {
  socketPath: string;
  close: () => Promise<void>;
};

// TODO: less callback hell
// TODO: logging interface
export async function setupSSH(
  username: string,
  host: string,
  port: number,
  privateKey: Buffer,
  remoteSocket: string,
): Promise<SSHContext> {
  const socketPath = joinPath(tmpdir(), "docker-client-ts.sock");
  const pool: Connection[] = [];

  try {
    await access(socketPath);
    await unlink(socketPath);
    console.log(`[DockerClient] unlinked socket @ ${socketPath}`);
  } catch (e) {
    // nothing to do, it doesn't exist
  }

  return new Promise<SSHContext>((resolve, reject) => {
    const server = createServer((socket) => {
      let connected = false;
      let con = pool.find((con) => con.free);
      if (con === undefined) {
        if (pool.length >= 10) {
          throw new Error("max pool size exceeded");
        }

        con = {
          id: randomUUID(),
          free: true,
          client: new Client(),
        };

        con.client.on("error", (err) => {
          console.error("[DockerClient] ssh connection error", err);
        });

        // TODO: handle connection error
        console.log("[DockerClient] establishing new ssh connection", con.id);
        con.client.connect({ username, host, port, privateKey });
        pool.push(con);
      } else {
        connected = true;
      }

      con.free = false;

      console.log("[DockerClient] using connection", con.id);

      function forward(con: Connection) {
        con.client.openssh_forwardOutStreamLocal(remoteSocket, (err, channel) => {
          if (err) {
            con.free = true;
            console.error("[DockerClient] failed to forward to remote socket", err);
            return;
          }

          console.log("[DockerClient] acquired forward channel for connection", con.id);

          channel.pipe(socket);
          socket.pipe(channel);

          socket.on("end", () => {
            console.log("on end");
            channel.end(() => {
              con.free = true;
            });
            channel.unpipe(socket);
            socket.unpipe(channel);
          });
        });
      }

      if (connected) {
        forward(con);
      } else {
        con.client.once("ready", () => {
          console.log("[DockerClient] ssh connection ready", con.id);
          forward(con);
        });
      }
    });

    async function close() {
      return new Promise<void>((resolve) => {
        const errors: Error[] = [];
        server.close((err) => {
          if (err) {
            errors.push(err);
          }

          for (const connection of pool) {
            try {
              connection.client.end();
            } catch (e) {
              errors.push(e as Error);
            }
          }

          if (errors.length > 0) {
            console.error(`[DockerClient] shutdown errors ${errors}`);
          }

          return resolve();
        });
      });
    }

    server.on("error", (err) => {
      console.error("[DockerClient] socket server error", err);
      return reject(err);
    });

    server.on("listening", () => {
      console.log(`[DockerClient] created socket @ ${socketPath}`);
      return resolve({ socketPath, close });
    });

    server.on("close", () => {
      console.log(`[DockerClient] cleaning up socket @ ${socketPath}`);
    });

    server.listen(socketPath);
  });
}

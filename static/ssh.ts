import { randomUUID } from "node:crypto";
import { access, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";

import { Client } from "ssh2";

import { type DockerClientParams, getLogger } from "~/etc";

type Connection = {
  id: string;
  client: Client;
  free: boolean;
};

type SSHContext = {
  socketPath: string;
  close: () => Promise<void>;
};

let socketID = 0;

// TODO: less callback hell
export async function setupSSH(params: DockerClientParams): Promise<SSHContext> {
  const logger = getLogger(params);
  const socketPath = joinPath(tmpdir(), `docker-client-ts-${socketID++}.sock`);
  const pool: Connection[] = [];

  try {
    await access(socketPath);
    await unlink(socketPath);
    logger.log(`[DockerClient] unlinked socket @ ${socketPath}`);
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
          logger.error("[DockerClient] ssh connection error", err);
        });

        // TODO: handle connection error
        con.client.connect({
          username: params.ssh?.user,
          host: params.ssh?.host,
          port: params.ssh?.port,
          privateKey: params.ssh?.key,
        });

        pool.push(con);
        logger.log("[DockerClient] establishing new ssh connection", con.id);
      } else {
        connected = true;
      }

      con.free = false;

      logger.log("[DockerClient] using connection", con.id);

      function forward(con: Connection) {
        con.client.openssh_forwardOutStreamLocal(params.baseURL.pathname, (err, channel) => {
          if (err) {
            con.free = true;
            logger.error("[DockerClient] failed to forward to remote socket", err);
            return;
          }

          logger.log("[DockerClient] acquired forward channel for connection", con.id);

          channel.pipe(socket);
          socket.pipe(channel);

          socket.on("end", () => {
            logger.log("[DockerClient] forward channel ended for connection", con.id);
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
          logger.log("[DockerClient] ssh connection ready", con.id);
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
            logger.error(`[DockerClient] shutdown errors ${errors}`);
          }

          return resolve();
        });
      });
    }

    server.on("error", (err) => {
      logger.error("[DockerClient] socket server error", err);
      return reject(err);
    });

    server.on("listening", () => {
      logger.log(`[DockerClient] created socket @ ${socketPath}`);
      return resolve({ socketPath, close });
    });

    server.on("close", () => {
      logger.log(`[DockerClient] cleaning up socket @ ${socketPath}`);
    });

    server.listen(socketPath);
  });
}

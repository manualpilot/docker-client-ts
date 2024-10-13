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

// TODO: less callback hell
// TODO: logging interface
export async function setupSSH(username: string, host: string, port: number, privateKey: Buffer): Promise<string> {
  const socketPath = joinPath(tmpdir(), "docker-client-ts.sock");
  const pool: Connection[] = [];

  try {
    await access(socketPath);
    await unlink(socketPath);
    console.log(`unlinked socket @ ${socketPath}`)
  } catch (e) {
    // nothing to do, it doesn't exist
  }

  return new Promise<string>((resolve, reject) => {
    createServer((socket) => {
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
          console.error("ssh connection error", err);
        })

        // TODO: handle connection error
        console.log("establishing new ssh connection", con.id);
        con.client.connect({ username, host, port, privateKey });
        pool.push(con);
      } else {
        connected = true;
      }

      con.free = false;

      console.log("using connection", con.id);

      function forward(con: Connection) {
        con.client.openssh_forwardOutStreamLocal("/var/run/docker.sock", (err, channel) => {
          if (err) {
            con.free = true;
            console.error("failed to forward to remote socket", err);
            return;
          }

          console.log("acquired forward channel for connection", con.id);

          channel.pipe(socket)
          socket.pipe(channel);

          socket.on("end", () => {
            console.log("on end")
            channel.end(() => { con.free = true });
            channel.unpipe(socket);
            socket.unpipe(channel);
          });
        });
      }

      if (connected) {
        forward(con);
      } else {
        con.client.once("ready", () => {
          console.log("ssh connection ready", con.id);
          forward(con);
        });
      }

    }).on("error", (err) => {
      console.error("socket server error", err);
      return reject(err);
    }).on("listening", () => {
      console.log(`created socket @ ${socketPath}`);
      return resolve(socketPath);
    }).on("close", () => {
      console.log(`cleaning up socket @ ${socketPath}`);
    }).listen(socketPath);
  })
}

import { type Observable, ReplaySubject } from "rxjs";
import { type Dispatcher, Pool } from "undici";
import { setupSSH } from "../src/ssh";

export type DockerClientParams = {
  baseURL: URL;
  console?: {
    log: typeof console.log;
    error: typeof console.error;
  };
  ssh?: {
    user: string;
    host: string;
    port: number;
    key: Buffer;
  };
};

export function getLogger(params: DockerClientParams): NonNullable<DockerClientParams["console"]> {
  return {
    log: params.console?.log ?? console.log,
    error: params.console?.error ?? console.error,
  };
}

export async function getPool(params: DockerClientParams): Promise<{ pool: Pool; close?: () => Promise<void> }> {
  const defaultParams: Pool.Options = {
    headersTimeout: 30_000,
  };

  if (params.ssh) {
    const { socketPath, close } = await setupSSH(params);

    return {
      close,
      pool: new Pool("http://localhost", {
        socketPath,
        ...defaultParams,
      }),
    };
  }

  if (params.baseURL.protocol === "unix:") {
    return {
      pool: new Pool("http://localhost", {
        socketPath: params.baseURL.pathname,
        ...defaultParams,
      }),
    };
  }

  return { pool: new Pool(params.baseURL, defaultParams) };
}

export const sub = (path: string, params: { [key: string]: string }) =>
  Object.entries(params).reduce((acc, [key, val]) => acc.replaceAll(`{${key}}`, val), path);

// TODO: want typed return data but docker doesnt provide json schema
export function chunked(resp: Dispatcher.ResponseData): Observable<string> {
  const stream = new ReplaySubject<string>();

  resp.body.on("data", (chunk) => {
    const lines = chunk
      .toString("utf-8")
      .split("\r\n")
      .filter((line: string) => line.length > 0);

    for (const line of lines) {
      stream.next(line);
    }
  });

  resp.body.on("close", () => {
    stream.complete();
  });

  return stream.asObservable();
}

export function interactive() {}
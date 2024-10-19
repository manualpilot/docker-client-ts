import { type Observable, ReplaySubject } from "rxjs";
import type { Dispatcher } from "undici";

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

console.log();

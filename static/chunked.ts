import { type Observable, ReplaySubject } from "rxjs";
import type { Dispatcher } from "undici";

// TODO: want typed return data but docker doesnt provide json schema
export function chunked(resp: Dispatcher.ResponseData): Observable<string> {
  const stream = new ReplaySubject<string>();

  resp.body.on("data", (chunk) => {
    for (const line of chunk
      .toString("utf-8")
      .split("\r\n")
      .filter((line: string) => line.length > 0)) {
      stream.next(line);
    }
  });

  resp.body.on("close", () => {
    stream.complete();
  });

  return stream.asObservable();
}

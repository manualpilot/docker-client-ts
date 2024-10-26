import { type Observable, firstValueFrom } from "rxjs";
import { buffer, toArray } from "rxjs/operators";

export async function collect(observable: Observable<string>): Promise<string[]> {
  const res = await firstValueFrom(observable.pipe(buffer(observable), toArray()));
  return res.flat();
}

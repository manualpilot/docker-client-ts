import type { FromSchema } from "json-schema-to-ts";
import type { Observable } from "rxjs";

import type { CombinedTerminalSession } from "~/etc";
import type { ops } from "~/spec";

type Operations = typeof ops;

type InputOf<O> = O extends { input: infer S extends object } ? FromSchema<S> : never;

type ErrorOf<O> = O extends { output: { error: infer S extends object } } ? FromSchema<S> : never;

type OutputOf<O> = O extends { output: { upgrade: true } }
  ? CombinedTerminalSession
  : O extends { output: { chunked: true } }
    ? Observable<string>
    : O extends { output: { schema: infer S extends object } }
      ? FromSchema<S>
      : undefined;

// An operation whose parameters are all optional can be called with no
// argument at all; one with a path parameter or a required body cannot.
type Endpoint<O> = O extends { input: object }
  ? Record<never, never> extends InputOf<O>
    ? (input?: InputOf<O>) => Promise<OutputOf<O>>
    : (input: InputOf<O>) => Promise<OutputOf<O>>
  : () => Promise<OutputOf<O>>;

export type DockerAPI = {
  [T in keyof Operations]: {
    [N in keyof Operations[T]]: Endpoint<Operations[T][N]>;
  };
};

export type OperationInput<T extends keyof Operations, N extends keyof Operations[T]> = InputOf<Operations[T][N]>;

export type OperationOutput<T extends keyof Operations, N extends keyof Operations[T]> = OutputOf<Operations[T][N]>;

// what an operation throws: a union discriminated on `code`
export type OperationError<T extends keyof Operations, N extends keyof Operations[T]> = ErrorOf<Operations[T][N]>;

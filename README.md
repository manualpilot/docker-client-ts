# docker-client-ts

## installation
```shell
npm add docker-client-ts
```

## usage
```typescript
import { DockerClient } from "docker-client-ts";

const client = await DockerClient({
  baseURL: new URL("unix:/var/run/docker.sock"),
  ssh: {
    user: "username",
    host: "127.0.0.1",
    port: 22,
    key: Buffer.from("ssh private key", "utf8"),
  },
});

const { Id } = await client.Container.Create({
  body: {
    Image: "debian",
    Cmd: ["bash"],
    Tty: true,
  },
});

await client.Container.Start({
  path: { id: Id },
});
```

see [tests](tests) for more example usage

## how it works

`npm run generate` fetches the [Docker Engine API](https://docs.docker.com/reference/api/engine/)
and [Compose Specification](https://github.com/compose-spec/compose-spec) schemas and normalizes
them into a single data module, `src/spec.ts`. Nothing is code generated — that one `as const`
object is the only source of truth, and it is read twice:

- at runtime, by zod's `fromJSONSchema`, to validate responses
- at compile time, by `json-schema-to-ts`'s `FromSchema`, to type the client

so the validation and the types cannot drift apart.

Schemas are converted lazily and memoized, so a client only pays for the operations it calls.
Every operation's schemas are reachable if you need them directly:

```typescript
import { type OperationError, ops, toZod } from "docker-client-ts";

const LogsError = toZod<OperationError<"Container", "Logs">>(ops.Container.Logs.output.error);
```

`OperationInput` and `OperationOutput` are available the same way.

<sub>
Docker and the Docker logo are trademarks or registered trademarks of Docker, Inc. in the United States
and/or other countries. Docker, Inc. and other parties may also have trademark rights in other terms used herein.
</sub>

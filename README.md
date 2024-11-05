# docker-client-ts

## installation
```shell
npm add docker-client-ts
```

## usage
```typescript
import { DockerClient } from "docker-client-ts";

const docker = await DockerClient({
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

<sub>
Docker and the Docker logo are trademarks or registered trademarks of Docker, Inc. in the United States
and/or other countries. Docker, Inc. and other parties may also have trademark rights in other terms used herein.
</sub>

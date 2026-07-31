import { buildAPI } from "./client.ts";
import { type DockerClientParams, getPool } from "./etc.ts";

export { type ComposeSpecification, ComposeSpecificationSchema } from "./compose.ts";
export type { CombinedTerminalSession, DockerClientParams } from "./etc.ts";
export { toZod } from "./schema.ts";
export { ops } from "./spec.ts";
export type { DockerAPI, OperationError, OperationInput, OperationOutput } from "./types.ts";

export type DockerClientType = Awaited<ReturnType<typeof DockerClient>>;

export async function DockerClient(params: DockerClientParams) {
  const { pool, close } = await getPool(params);

  return {
    ...buildAPI(pool),
    close: async () => {
      await pool.close();
      if (close) {
        await close();
      }
    },
  };
}

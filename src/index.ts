import { buildAPI } from "~/client";
import { type DockerClientParams, getPool } from "~/etc";

export { type ComposeSpecification, ComposeSpecificationSchema } from "~/compose";
export type { CombinedTerminalSession, DockerClientParams } from "~/etc";
export { toZod } from "~/schema";
export { ops } from "~/spec";
export type { DockerAPI, OperationError, OperationInput, OperationOutput } from "~/types";

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

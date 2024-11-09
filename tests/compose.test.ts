import * as YAML from "yaml";

import { ComposeSpecificationSchema } from "../lib";

// TODO: is there an equivalent of python dedent in js?
test("compose", async () => {
  const yaml = YAML.parse(`
services:
  hello_world:
    image: hello-world
  `);

  const res = ComposeSpecificationSchema.safeParse(yaml);
  expect(res.success).toStrictEqual(true);
  expect(res.data?.services?.hello_world?.image).toEqual("hello-world");
});

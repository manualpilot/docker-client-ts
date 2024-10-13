
const root = `
import { Pool } from "undici";

import { setupSSH } from "~/ssh.ts";

{% for tag in tags %}
import {{ tag }} from "~/tags/{{ tag | lower }}.ts"
{% endfor %}

export type DockerClientParams = {
  baseURL: URL;
  ssh?: {
    user: string;
    host: string;
    port: number;
    key: Buffer;
  };
};

export async function DockerClient(params: DockerClientParams) {
  const pool = await getPool(params);

  return {
  {% for tag in tags %}
    {{ tag }}: {{ tag }}(pool),
  {% endfor %}
  };
}

async function getPool(params: DockerClientParams): Promise<Pool> {
  const defaultParams: Pool.Options = {
    headersTimeout: 30_000,
  };
  
  if (params.ssh) {
    const socketPath = await setupSSH(
      params.ssh.user,
      params.ssh.host,
      params.ssh.port,
      params.ssh.key,
      params.baseURL.pathname,
    );

    return new Pool("http://localhost", {
      socketPath,
      ...defaultParams,
    });
  }

  if (params.baseURL.protocol === "unix:") {
    return new Pool("http://localhost", {
      socketPath: params.baseURL.pathname,
      ...defaultParams,
    });
  }

  return new Pool(params.baseURL, defaultParams);
}
`;

const tag = `
import { Pool } from "undici";
import { z } from "zod";
import { sub } from "~/utils"

{% for endpoint in endpoints %}

{% if endpoint.input_type %}
export const {{ endpoint.input_name }} = {{ endpoint.input_type }};
{% endif %}

{% if endpoint.output_type %}
export const {{ endpoint.output_name }} = {{ endpoint.output_type }};
{% endif %}

{% endfor %}

export default function {{ tag }}(pool: Pool) {
  return {
{% for endpoint in endpoints %}
    {{ endpoint.name }}: async (
    {% if endpoint.input_type %}
      input{% if endpoint.input_required %}?{% endif %}: z.infer<typeof {{ endpoint.input_name }}>,
    {% endif %}
    ): Promise<
    {% if endpoint.output_type %}
      z.infer<typeof {{ endpoint.output_name }}>
    {% else %}
      void
    {% endif %}
    > => {

    const resp = await pool.request({
      method: "{{ endpoint.method }}",
      {% if endpoint.path_has_params %}
      path: sub("{{ endpoint.path }}", input.path),
      {% else %}
      path: "{{ endpoint.path }}",
      {% endif %}
      {% if endpoint.input_has_query %}
      query: input{% if endpoint.input_required %}?{% endif %}.query,
      {% endif %}
      headers: {
        {% if endpoint.input_has_body %}
          "Content-Type": "application/json",
        {% endif %}
      },
      {% if endpoint.input_has_body %}
      body: JSON.stringify(input.body),
      {% endif %}
    });

    if (resp.statusCode >= 200 && resp.statusCode <= 299) {
      {% if endpoint.output_type %}
        return {{ endpoint.output_name }}.parse(await resp.body.json());
      {% else %}
        return;
      {% endif %}
    }

    // TODO: parse into the error types
    throw Error(await resp.body.text());
    },
{% endfor %}
  };
}
`;

export const TEMPLATES = { root, tag };

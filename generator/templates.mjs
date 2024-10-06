
const root = `
import { Pool } from "undici";

import {
{% for tag in tags %}
 {{ tag }},
{% endfor %}
} from "~/tags";

export function DockerClient(base: URL) {
  let pool: Pool;
  if (base.protocol === 'unix:') {
    pool = new Pool(
      "http://localhost",
      {
        socketPath: base.pathname,
      },
    );
  } else {
    pool = new Pool(base);
  }

  return {
  {% for tag in tags %}
    {{ tag }}: {{ tag }}(pool),
  {% endfor %}
  };
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

const tagsIndex = `
{% for tag in tags %}
export { default as {{tag}} } from "~/tags/{{ tag | lower }}.ts";
{% endfor %}
`;

export const TEMPLATES = { root, tag, tagsIndex };

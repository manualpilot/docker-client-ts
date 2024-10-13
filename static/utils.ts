export const sub = (path: string, params: { [key: string]: string }) =>
  Object.entries(params).reduce((acc, [key, val]) => acc.replaceAll(`{${key}}`, val), path);

export function getDocsUrl(path: string): string | undefined {
  const base = process.env.DOCS_BASE_URL;
  if (!base) return undefined;

  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function withDocUrl(path: string): { doc_url?: string } {
  const docUrl = getDocsUrl(path);
  return docUrl ? { doc_url: docUrl } : {};
}

// This file dynamically imports all .txt files from the /sources directory at build time.
// You can add your TXT files to the /sources folder and they will be bundled automatically.

const modules = import.meta.glob('/sources/*.txt', { query: '?raw', eager: true });

export const EMBEDDED_SOURCES: Record<string, string> = {};

for (const path in modules) {
  const fileName = path.split('/').pop()?.replace('.txt', '') || path;
  EMBEDDED_SOURCES[fileName] = (modules[path] as any).default || modules[path];
}

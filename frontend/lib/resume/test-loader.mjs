import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const loaderDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(loaderDir, '../..');
const extensions = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'];

function resolveWithExtensions(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }

  for (const extension of extensions) {
    const candidate = `${basePath}${extension}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function resolveFromAlias(specifier) {
  if (!specifier.startsWith('@/')) return null;
  const subPath = specifier.slice(2);
  const absolutePath = path.join(projectRoot, subPath);
  return resolveWithExtensions(absolutePath);
}

function resolveRelative(specifier, parentURL) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  if (!parentURL) return null;

  const parentPath = fileURLToPath(parentURL);
  const parentDir = path.dirname(parentPath);
  const absolutePath = path.resolve(parentDir, specifier);
  return resolveWithExtensions(absolutePath);
}

export async function resolve(specifier, context, defaultResolve) {
  const aliasResolved = resolveFromAlias(specifier);
  if (aliasResolved) {
    return {
      url: pathToFileURL(aliasResolved).href,
      shortCircuit: true,
    };
  }

  const relativeResolved = resolveRelative(specifier, context.parentURL);
  if (relativeResolved) {
    return {
      url: pathToFileURL(relativeResolved).href,
      shortCircuit: true,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

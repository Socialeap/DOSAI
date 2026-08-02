import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { parse } from '@babel/parser';

export async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path) : [path];
    }),
  );
  return files.flat();
}

export async function collectSourceFiles(directory) {
  return (await collectFiles(directory)).filter((path) => ['.ts', '.tsx'].includes(extname(path)));
}

export function importedModules(source, path) {
  const sourceFile = parse(source, {
    createImportExpressions: true,
    plugins: ['jsx', 'typescript'],
    sourceFilename: path,
    sourceType: 'module',
  });
  const modules = [];

  const visit = (node) => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(node.type) && node.source?.type === 'StringLiteral') {
      modules.push(node.source.value);
    }
    if (node.type === 'ImportExpression') {
      if (node.source.type !== 'StringLiteral') {
        throw new Error(`${path} contains a non-literal dynamic import`);
      }
      modules.push(node.source.value);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const [argument] = node.arguments;
      if (argument?.type !== 'StringLiteral') {
        throw new Error(`${path} contains a non-literal require call`);
      }
      modules.push(argument.value);
    }

    Object.values(node).forEach(visit);
  };

  visit(sourceFile);
  return modules;
}

export async function readImportedModules(path) {
  return importedModules(await readFile(path, 'utf8'), path);
}

import { builtinModules } from 'node:module';

import { parse } from '@babel/parser';

const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const memberTypes = new Set(['MemberExpression', 'OptionalMemberExpression']);
const callTypes = new Set(['CallExpression', 'OptionalCallExpression']);

function categoryEntries(policy, field) {
  return Object.entries(policy.categories).flatMap(([category, rules]) =>
    rules[field].map((value) => ({ category, value })),
  );
}

function classifyImport(specifier, policy) {
  for (const { category, value } of categoryEntries(policy, 'forbidden_imports')) {
    if (specifier === value || specifier.startsWith(`${value}/`)) {
      return category;
    }
  }
  for (const { category, value } of categoryEntries(policy, 'forbidden_import_prefixes')) {
    if (specifier.startsWith(value)) {
      return category;
    }
  }
  if (policy.forbid_all_node_builtins && nodeBuiltins.has(specifier)) {
    return 'raw_process';
  }
  return undefined;
}

function staticPropertyName(member) {
  if (!member.computed && member.property.type === 'Identifier') {
    return member.property.name;
  }
  if (member.computed && member.property.type === 'StringLiteral') {
    return member.property.value;
  }
  return undefined;
}

function memberPath(member) {
  const parts = [];
  let current = member;
  let computed = false;

  while (memberTypes.has(current.type)) {
    computed ||= current.computed;
    const property = staticPropertyName(current);
    if (property === undefined) {
      parts.unshift('<computed>');
      current = current.object;
      continue;
    }
    parts.unshift(property);
    current = current.object;
  }

  if (current.type !== 'Identifier') {
    return { computed, parts: [] };
  }
  parts.unshift(current.name);
  return { computed, parts };
}

function isStaticPropertyKey(node, parent, key) {
  if (parent?.type === 'TSModuleDeclaration' && key === 'id') {
    return true;
  }
  if (parent === undefined || key !== 'key' || parent.computed) {
    return false;
  }
  if (parent.type === 'ObjectProperty') {
    return !parent.shorthand;
  }
  return [
    'ClassMethod',
    'ClassPrivateMethod',
    'ClassProperty',
    'ObjectMethod',
    'TSMethodSignature',
    'TSPropertySignature',
  ].includes(parent.type);
}

function addViolation(violations, category, rule, detail, path, node) {
  violations.push({
    category,
    column: node.loc?.start.column ?? 0,
    detail,
    line: node.loc?.start.line ?? 0,
    path,
    rule,
  });
}

function inspectBridgeMember(node, parent, policy, path, violations) {
  const resolved = memberPath(node);
  if (resolved.parts.length < 2) {
    return;
  }

  const member = resolved.parts.join('.');
  const bridgeRoot = policy.typed_bridge.roots.find(
    (root) => member === root || member.startsWith(`${root}.`),
  );
  if (bridgeRoot === undefined) {
    if (resolved.parts.includes('dosai')) {
      addViolation(violations, 'arbitrary_ipc', 'bridge-root', member, path, node);
    }
    return;
  }

  if (resolved.computed && policy.typed_bridge.forbid_computed_access) {
    addViolation(violations, 'arbitrary_ipc', 'bridge-computed', member, path, node);
    return;
  }

  const allowed = policy.typed_bridge.allowed_calls.find(
    ({ path: allowedPath }) => member === allowedPath || allowedPath.startsWith(`${member}.`),
  );
  if (allowed === undefined) {
    addViolation(violations, 'arbitrary_ipc', 'bridge-path', member, path, node);
    return;
  }

  if (member === allowed.path) {
    if (
      parent === undefined ||
      !callTypes.has(parent.type) ||
      parent.callee !== node ||
      parent.arguments.length !== allowed.argument_count
    ) {
      addViolation(violations, 'arbitrary_ipc', 'bridge-call', member, path, node);
    }
    return;
  }

  if (
    policy.typed_bridge.forbid_aliasing &&
    (parent === undefined || !memberTypes.has(parent.type) || parent.object !== node)
  ) {
    addViolation(violations, 'arbitrary_ipc', 'bridge-alias', member, path, node);
  }
}

function inspectMessageListener(node, path, violations) {
  if (!callTypes.has(node.type) || !memberTypes.has(node.callee.type)) {
    return;
  }
  const calledPath = memberPath(node.callee).parts.join('.');
  const [eventName] = node.arguments;
  if (
    ['window.addEventListener', 'globalThis.addEventListener'].includes(calledPath) &&
    eventName?.type === 'StringLiteral' &&
    eventName.value === 'message'
  ) {
    addViolation(violations, 'arbitrary_ipc', 'message-listener', calledPath, path, node);
  }
}

function inspectSensitiveInput(node, path, violations) {
  if (node.type !== 'JSXOpeningElement' || node.name.type !== 'JSXIdentifier' || node.name.name !== 'input') {
    return;
  }
  const typeAttribute = node.attributes.find(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === 'type',
  );
  if (typeAttribute?.value?.type !== 'StringLiteral') {
    return;
  }
  const inputType = typeAttribute.value.value.toLowerCase();
  if (inputType === 'file') {
    addViolation(violations, 'filesystem', 'file-input', '<input type="file">', path, node);
  }
  if (inputType === 'password') {
    addViolation(violations, 'credential', 'password-input', '<input type="password">', path, node);
  }
}

export function analyzeRendererAuthority(source, path, policy) {
  const ast = parse(source, {
    createImportExpressions: true,
    plugins: ['jsx', 'typescript'],
    sourceFilename: path,
    sourceType: 'module',
  });
  const violations = [];
  const forbiddenIdentifiers = new Map(
    categoryEntries(policy, 'forbidden_identifiers').map(({ category, value }) => [value, category]),
  );
  const forbiddenProperties = new Map(
    categoryEntries(policy, 'forbidden_properties').map(({ category, value }) => [value, category]),
  );

  const visit = (node, parent, key) => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, parent, key));
      return;
    }

    if (
      ['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(node.type) &&
      node.source?.type === 'StringLiteral'
    ) {
      const category = classifyImport(node.source.value, policy);
      if (category !== undefined) {
        addViolation(violations, category, 'forbidden-import', node.source.value, path, node);
      }
    }
    if (node.type === 'ImportExpression' && node.source.type === 'StringLiteral') {
      const category = classifyImport(node.source.value, policy);
      if (category !== undefined) {
        addViolation(violations, category, 'forbidden-import', node.source.value, path, node);
      }
    }
    if (node.type === 'TSImportType' && node.argument.type === 'StringLiteral') {
      const category = classifyImport(node.argument.value, policy);
      if (category !== undefined) {
        addViolation(violations, category, 'forbidden-import-type', node.argument.value, path, node);
      }
    }
    if (node.type === 'Identifier' && !isStaticPropertyKey(node, parent, key)) {
      const category = forbiddenIdentifiers.get(node.name);
      if (category !== undefined) {
        addViolation(violations, category, 'forbidden-identifier', node.name, path, node);
      }
      if (
        policy.protected_computed_roots.includes(node.name) &&
        (parent === undefined || !memberTypes.has(parent.type) || parent.object !== node)
      ) {
        addViolation(violations, 'arbitrary_ipc', 'protected-root-alias', node.name, path, node);
      }
    }
    if (memberTypes.has(node.type)) {
      const property = staticPropertyName(node);
      const category = property === undefined ? undefined : forbiddenProperties.get(property);
      if (category !== undefined) {
        addViolation(violations, category, 'forbidden-property', property, path, node);
      }
      const resolved = memberPath(node);
      if (
        resolved.computed &&
        resolved.parts.length > 0 &&
        policy.protected_computed_roots.includes(resolved.parts[0])
      ) {
        addViolation(
          violations,
          'arbitrary_ipc',
          'protected-computed-access',
          resolved.parts.join('.'),
          path,
          node,
        );
      }
      inspectBridgeMember(node, parent, policy, path, violations);
    }
    if (node.type === 'DebuggerStatement') {
      addViolation(violations, 'debugger', 'debugger-statement', 'debugger', path, node);
    }
    inspectMessageListener(node, path, violations);
    inspectSensitiveInput(node, path, violations);

    for (const [childKey, child] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra'].includes(childKey)) {
        continue;
      }
      visit(child, node, childKey);
    }
  };

  visit(ast, undefined, undefined);
  return violations;
}

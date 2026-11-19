import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const files = new URL('../../../tools/coordination-prototype/', import.meta.url);
const read = name => readFileSync(new URL(name, files), 'utf8');

class Element {
  dataset = {};
  children = [];
  textContent = '';
  value = '';
  disabled = false;
  handlers = {};
  addEventListener(type, handler) { this.handlers[type] = handler; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  trigger(type) { if (!this.disabled) this.handlers[type](); }
}

export function mountDashboard(globals) {
  const html = read('index.html');
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  const body = new Element();
  const context = createContext({
    document: { body, getElementById: id => nodes.get(id), createElement: () => new Element() },
    ...globals,
  });
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(([, src]) => src);
  for (const script of scripts) runInContext(read(script), context, { filename: script });
  return { body, html, nodes, scripts };
}

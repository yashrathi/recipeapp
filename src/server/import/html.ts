export interface HtmlTextNode {
  type: "text";
  value: string;
  parent: HtmlElement | null;
}

export interface HtmlElement {
  type: "element";
  tagName: string;
  attributes: Record<string, string>;
  children: HtmlNode[];
  parent: HtmlElement | null;
}

export type HtmlNode = HtmlTextNode | HtmlElement;

const voidElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);?/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const parsed = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0x10ffff) return match;
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return "\ufffd";
      }
    }
    return namedEntities[entity.toLowerCase()] ?? match;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (index >= source.length || source[index] === "/") break;
    const nameStart = index;
    while (index < source.length && !/[\s=/>]/.test(source[index]!)) index += 1;
    const name = source.slice(nameStart, index).toLowerCase();
    while (/\s/.test(source[index] ?? "")) index += 1;
    let value = "";
    if (source[index] === "=") {
      index += 1;
      while (/\s/.test(source[index] ?? "")) index += 1;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < source.length && source[index] !== quote) index += 1;
        value = source.slice(valueStart, index);
        if (source[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < source.length && !/[\s>]/.test(source[index]!)) index += 1;
        value = source.slice(valueStart, index);
      }
    }
    if (name && !(name in attributes)) attributes[name] = decodeHtmlEntities(value);
  }
  return attributes;
}

function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index]!;
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

export function parseHtml(html: string): HtmlElement {
  const root: HtmlElement = {
    type: "element",
    tagName: "#document",
    attributes: {},
    children: [],
    parent: null,
  };
  const stack = [root];
  let index = 0;

  const appendText = (value: string, decode = true) => {
    if (!value) return;
    const parent = stack.at(-1)!;
    parent.children.push({ type: "text", value: decode ? decodeHtmlEntities(value) : value, parent });
  };

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open < 0) {
      appendText(html.slice(index));
      break;
    }
    appendText(html.slice(index, open));
    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4);
      index = close < 0 ? html.length : close + 3;
      continue;
    }
    const close = findTagEnd(html, open + 1);
    if (close < 0) {
      appendText(html.slice(open));
      break;
    }
    const inside = html.slice(open + 1, close);
    if (/^\s*[!?]/.test(inside)) {
      index = close + 1;
      continue;
    }
    const closing = /^\s*\/\s*([^\s>]+)/.exec(inside);
    if (closing) {
      const tagName = closing[1]!.toLowerCase();
      const stackIndex = stack.map((element) => element.tagName).lastIndexOf(tagName);
      if (stackIndex > 0) stack.length = stackIndex;
      index = close + 1;
      continue;
    }

    const start = /^\s*([a-z][^\s/>]*)/i.exec(inside);
    if (!start) {
      appendText(html.slice(open, close + 1));
      index = close + 1;
      continue;
    }
    const tagName = start[1]!.toLowerCase();
    const parent = stack.at(-1)!;
    const element: HtmlElement = {
      type: "element",
      tagName,
      attributes: parseAttributes(inside.slice(start.index + start[0].length)),
      children: [],
      parent,
    };
    parent.children.push(element);
    index = close + 1;

    if (tagName === "script" || tagName === "style") {
      const closingPattern = new RegExp(`<\\/\\s*${tagName}\\s*>`, "ig");
      closingPattern.lastIndex = index;
      const match = closingPattern.exec(html);
      const rawEnd = match?.index ?? html.length;
      element.children.push({ type: "text", value: html.slice(index, rawEnd), parent: element });
      index = match ? closingPattern.lastIndex : html.length;
      continue;
    }
    if (!voidElements.has(tagName) && !/\/\s*$/.test(inside)) stack.push(element);
  }
  return root;
}

export function walkElements(root: HtmlElement): HtmlElement[] {
  const result: HtmlElement[] = [];
  const visit = (node: HtmlNode) => {
    if (node.type === "text") return;
    if (node !== root) result.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return result;
}

export function elementText(element: HtmlElement): string {
  const parts: string[] = [];
  const visit = (node: HtmlNode) => {
    if (node.type === "text") {
      parts.push(node.value);
      return;
    }
    if (node.tagName === "script" || node.tagName === "style") return;
    node.children.forEach(visit);
  };
  element.children.forEach(visit);
  return parts.join("");
}

export function htmlValueToText(value: string): string {
  return elementText(parseHtml(`<div>${value}</div>`));
}

export function attributeTokens(element: HtmlElement, name: string): string[] {
  return (element.attributes[name] ?? "").split(/\s+/).filter(Boolean);
}

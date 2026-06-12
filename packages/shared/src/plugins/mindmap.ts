/* Mind Map Generator — Mermaid/Markdown output */

export interface MindMapNode {
  id: string;
  label: string;
  children: MindMapNode[];
}

export interface MindMapOutput {
  format: "mermaid" | "markdown";
  content: string;
  nodes: MindMapNode;
  generatedAt: number;
}

export function buildMindMapNode(label: string, children: MindMapNode[] = []): MindMapNode {
  return { id: `node-${Math.random().toString(36).slice(2, 8)}`, label, children };
}

function toMermaid(node: MindMapNode, indent = 0): string {
  const pad = "  ".repeat(indent);
  let result = `${pad}${node.label.replace(/[()]/g, "'$&'")}\n`;
  for (const child of node.children) {
    result += toMermaid(child, indent + 1);
  }
  return result;
}

export function generateMindMap(root: MindMapNode, format: "mermaid" | "markdown" = "mermaid"): MindMapOutput {
  let content: string;
  if (format === "mermaid") {
    content = "```mermaid\nmindmap\n" + toMermaid(root) + "```\n";
  } else {
    content = `# ${root.label}\n\n` + toMarkdownList(root);
  }
  return { format, content, nodes: root, generatedAt: Date.now() };
}

function toMarkdownList(node: MindMapNode, indent = 0): string {
  const pad = "  ".repeat(indent);
  let result = `${pad}- ${node.label}\n`;
  for (const child of node.children) {
    result += toMarkdownList(child, indent + 1);
  }
  return result;
}

/* Parse agent output into a mind map structure */
export function parseToMindMap(text: string, rootLabel: string): MindMapNode {
  const lines = text.split("\n").filter((l) => l.trim());
  const root = buildMindMapNode(rootLabel);
  let currentParent = root;
  let lastIndent = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const leading = line.length - line.trimStart().length;
    const node = buildMindMapNode(trimmed);

    if (leading > lastIndent) {
      currentParent = currentParent.children[currentParent.children.length - 1] || currentParent;
    } else if (leading < lastIndent) {
      currentParent = root;
    }

    currentParent.children.push(node);
    lastIndent = leading;
  }
  return root;
}
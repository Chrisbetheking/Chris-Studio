export interface ProjectFileNode {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
  sizeBytes?: number;
  fileType?: string;
  children?: ProjectFileNode[];
}

const SUPPORTED_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "md", "txt", "json", "yml", "yaml",
  "py", "java", "cpp", "c", "h", "cs", "html", "css",
  "rs", "go", "php", "xml", "toml", "ini", "env",
]);

export function getFileType(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return "other";
  const ext = fileName.slice(dot + 1).toLowerCase();
  if (SUPPORTED_EXTENSIONS.has(ext)) return ext;
  return "other";
}

export function isSupportedFile(fileName: string): boolean {
  return SUPPORTED_EXTENSIONS.has(getFileType(fileName));
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Maximum file size for Context Pack (20 MB) */
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum files in a scan */
export const MAX_SCAN_FILES = 1000;

/** Maximum scan depth */
export const MAX_SCAN_DEPTH = 6;

/** Maximum files in Context Pack */
export const MAX_CONTEXT_FILES = 50;

/**
 * Pick the separator the project path itself uses.
 *
 * Chris Studio is a macOS app that can also open a project path handed in from
 * elsewhere, and the mock tree previously hard-coded a backslash. On macOS every
 * synthetic path then contained `\`, which is an ordinary filename character
 * there rather than a separator, so none of the paths resolved. The separator is
 * now derived from the input instead of assumed.
 */
function separatorFor(projectPath: string): string {
  return projectPath.includes("\\") && !projectPath.includes("/") ? "\\" : "/";
}

/**
 * Build a mock file tree (fallback when Tauri is not available).
 *
 * This provides a meaningful example tree for the UI preview. Every node keeps
 * its full path and relative path: nested entries used to be created with only
 * their own name, so `src/index.ts` was reported as `index.ts` and a caller
 * could not tell it apart from a root-level file.
 */
export function buildMockFileTree(projectPath: string): ProjectFileNode[] {
  const separator = separatorFor(projectPath);
  const normalizedRoot = projectPath.replace(/[\\/]+$/, "");
  const rootName = normalizedRoot.split(/[\\/]/).filter(Boolean).pop() || "project";

  const createNode = (
    name: string,
    type: "file" | "directory",
    parentPath: string,
    parentRelative: string,
    children?: ProjectFileNode[],
    size?: number,
  ): ProjectFileNode => {
    const relativePath = parentRelative ? `${parentRelative}/${name}` : name;
    return {
      id: uid(),
      name,
      path: `${parentPath}${separator}${name}`,
      relativePath,
      type,
      sizeBytes: size,
      fileType: type === "file" ? getFileType(name) : undefined,
      children,
    };
  };

  const rootRelative = "";
  const srcDir = createNode("src", "directory", normalizedRoot, rootRelative);
  srcDir.children = [
    createNode("index.ts", "file", srcDir.path, srcDir.relativePath, undefined, 1234),
    createNode("App.tsx", "file", srcDir.path, srcDir.relativePath, undefined, 3456),
    createNode("utils.ts", "file", srcDir.path, srcDir.relativePath, undefined, 890),
  ];
  const componentsDir = createNode("components", "directory", srcDir.path, srcDir.relativePath);
  componentsDir.children = [
    createNode("Header.tsx", "file", componentsDir.path, componentsDir.relativePath, undefined, 2100),
    createNode("Sidebar.tsx", "file", componentsDir.path, componentsDir.relativePath, undefined, 3200),
    createNode("Footer.tsx", "file", componentsDir.path, componentsDir.relativePath, undefined, 1500),
  ];
  srcDir.children.push(componentsDir);

  const docsDir = createNode("docs", "directory", normalizedRoot, rootRelative);
  docsDir.children = [
    createNode("README.md", "file", docsDir.path, docsDir.relativePath, undefined, 5000),
    createNode("CHANGELOG.md", "file", docsDir.path, docsDir.relativePath, undefined, 2400),
  ];

  const configDir = createNode("config", "directory", normalizedRoot, rootRelative);
  configDir.children = [
    createNode("settings.json", "file", configDir.path, configDir.relativePath, undefined, 800),
    createNode("env.yaml", "file", configDir.path, configDir.relativePath, undefined, 600),
  ];

  return [{
    id: uid(),
    name: rootName,
    path: normalizedRoot,
    relativePath: rootRelative,
    type: "directory",
    children: [
      srcDir,
      docsDir,
      configDir,
      createNode("package.json", "file", normalizedRoot, rootRelative, undefined, 1200),
      createNode("tsconfig.json", "file", normalizedRoot, rootRelative, undefined, 900),
    ],
  }];
}

export function flattenFileTree(nodes: ProjectFileNode[]): ProjectFileNode[] {
  const result: ProjectFileNode[] = [];
  function walk(list: ProjectFileNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return result;
}
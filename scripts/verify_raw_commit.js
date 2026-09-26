const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const COMMIT = process.argv[2];
if (!COMMIT) {
  console.error("Usage: node scripts/verify_raw_commit.js <commit-sha>");
  console.error("Example: node scripts/verify_raw_commit.js abc123def");
  process.exit(1);
}

const BASE = "https://raw.githubusercontent.com/Chrisbetheking/tokenfence-studio/" + COMMIT + "/";
const TMP = path.join(os.tmpdir(), "tokenfence-raw-verify-" + COMMIT.substring(0, 8));
if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });

const FILES = [
  { path: "apps/desktop/ui/src/App.tsx", min: 250 },
  { path: "apps/desktop/ui/src/components/AppTitleBar.tsx", min: 80 },
  { path: "apps/desktop/ui/src/components/AgentPatchPanel.tsx", min: 220 },
  { path: "apps/desktop/ui/src/agentModelBridge.ts", min: 120 },
  { path: "apps/desktop/ui/src/screens/ToolboxScreen.tsx", min: 180 },
  { path: "apps/desktop/ui/src/data/project-workspace.ts", min: 120 },
  { path: "apps/desktop/ui/src/components/RecentProjectsPanel.tsx", min: 120 },
  { path: "apps/desktop/ui/src/components/ProjectEmptyState.tsx", min: 60 },

  { path: "apps/desktop/src-tauri/src/main.rs", min: 100 },
  { path: "scripts/source_guard.js", min: 150 },
  { path: "scripts/release_sanity.js", min: 80 },
  { path: ".github/workflows/ci.yml", min: 50 },
  { path: "README.zh-CN.md", min: 80 },
];

let errors = [];
let passed = 0;

function fail(msg) {
  errors.push(msg);
  console.error("  FAIL: " + msg);
}

function ok(msg) {
  passed++;
  console.log("  OK: " + msg);
}

function download(url, dest) {
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(dest);
    https.get(url, function(response) {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error("HTTP " + response.statusCode));
        return;
      }
      response.pipe(file);
      file.on("finish", function() {
        file.close();
        resolve();
      });
    }).on("error", function(err) {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  console.log("=== Raw commit verification for " + COMMIT + " ===\n");

  for (var i = 0; i < FILES.length; i++) {
    var item = FILES[i];
    var url = BASE + item.path;
    var localName = item.path.replace(/[\\\/]/g, "_");
    var localPath = path.join(TMP, localName);

    console.log("--- " + item.path + " ---");
    try {
      await download(url, localPath);
      console.log("  downloaded: " + url);

      var buf = fs.readFileSync(localPath);
      var text = buf.toString("utf-8");
      var lines = text.split("\n").length;

      // Line count
      if (lines < item.min) {
        fail(item.path + ": " + lines + " lines (min " + item.min + ")");
      } else {
        ok(item.path + ": " + lines + " lines");
      }

      // BOM check
      if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        fail(item.path + ": has UTF-8 BOM");
      } else if (buf.length > 0) {
        ok(item.path + ": no BOM");
      }

      // CR check
      var crCount = 0;
      for (var bi = 0; bi < buf.length; bi++) {
        if (buf[bi] === 0x0D) crCount++;
      }
      if (crCount > 0) {
        fail(item.path + ": " + crCount + " CR bytes (should be LF-only)");
      }

      // Minified check
      if (lines < 5 && text.length > 200) {
        fail(item.path + ": appears minified (" + lines + " lines, " + text.length + " bytes)");
      } else {
        ok(item.path + ": not minified");
      }

      // Bare #/### check (for source files, not README)
      if (!item.path.endsWith(".md")) {
        var hasBareHash = false;
        var sourceLines = text.split("\n");
        // Track template literal state
        var inTemplate = false;
        for (var li = 0; li < sourceLines.length; li++) {
          var line = sourceLines[li];
          var trimmed = line.trimStart();

          // Track backtick template literals
          var bticks = (line.match(/(?<!\\)/g) || []).length;
          if (bticks % 2 === 1) inTemplate = !inTemplate;
          if (inTemplate) continue;

          // Skip Rust attributes
          if (item.path.endsWith(".rs") && (trimmed.startsWith("#[") || trimmed.startsWith("#!["))) continue;

          if (/^#[^#!\[\/]/.test(trimmed) && !/^\s*\/\//.test(line)) {
            fail(item.path + ":" + (li+1) + ': bare #: "' + trimmed.substring(0, 40) + '"');
            hasBareHash = true;
          }
          if (/^###[^#]/.test(trimmed) && !/^\s*\/\//.test(line)) {
            fail(item.path + ":" + (li+1) + ': bare ###: "' + trimmed.substring(0, 40) + '"');
            hasBareHash = true;
          }
        }
        if (!hasBareHash) ok(item.path + ": no bare #/###");
      }

      // Mojibake check
      var hasMojibake = false;
      for (var bi = 0; bi < buf.length - 1; bi++) {
        if (buf[bi] === 0xEF && buf[bi+1] === 0xBF && buf.length > bi+2 && buf[bi+2] === 0xBD) {
          fail(item.path + ": replacement character (U+FFFD) at offset " + bi);
          hasMojibake = true;
          break;
        }
      }
      if (!hasMojibake) ok(item.path + ": no mojibake");

    } catch (e) {
      fail(item.path + ": download failed - " + e.message);
    }
    console.log("");
  }

  console.log("=== RESULT: " + errors.length + " error(s), " + passed + " passed ===");
  if (errors.length > 0) {
    console.log("Failures:");
    errors.forEach(function(e) { console.log("  - " + e); });
    process.exit(1);
  } else {
    console.log("Raw commit verification passed.");
    process.exit(0);
  }
}

main();

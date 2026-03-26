const fs = require("fs");
const path = require("path");

function copyIfExists(fromPath, toPath) {
  if (!fs.existsSync(fromPath)) return false;
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.copyFileSync(fromPath, toPath);
  return true;
}

const projectRootIdlDir = path.join(__dirname, "../../target/idl");
const distIdlDir = path.join(__dirname, "../dist/target/idl");

const hookIdlFrom = path.join(projectRootIdlDir, "clearpath_hook.json");
const treasuryIdlFrom = path.join(
  projectRootIdlDir,
  "clearpath_treasury.json"
);

const hookIdlTo = path.join(distIdlDir, "clearpath_hook.json");
const treasuryIdlTo = path.join(distIdlDir, "clearpath_treasury.json");

const copiedHook = copyIfExists(hookIdlFrom, hookIdlTo);
const copiedTreasury = copyIfExists(treasuryIdlFrom, treasuryIdlTo);

if (!copiedHook || !copiedTreasury) {
  console.warn(
    "Warning: IDL files not fully copied to dist. " +
      "Some Solana-backed routes may fail. " +
      `from='${projectRootIdlDir}' to='${distIdlDir}'`
  );
}


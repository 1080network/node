#!/usr/bin/env node
// The generated TypeScript imports every dependency by relative path, which only works when everything is in one
// tree. In the role packages (issuer, acceptor), rewrite imports of the shared code, which lives in
// @1080network/mica-common, to package imports.
//
// Usage: rewrite-imports.mjs <package src dir> <own top-level generated dir, e.g. mica/issuer>
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const [srcDir, ownDir] = process.argv.slice(2);
if (!srcDir || !ownDir) {
  console.error("usage: rewrite-imports.mjs <package src dir> <own generated dir>");
  process.exit(1);
}
const root = resolve(srcDir);
const own = join(root, ownDir) + sep;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (path.endsWith(".ts")) yield path;
  }
}

let rewritten = 0;
for (const file of files(join(root, ownDir))) {
  const source = readFileSync(file, "utf8");
  const updated = source.replace(/(from\s+")(\.{1,2}\/[^"]+)(")/g, (match, before, spec, after) => {
    const target = resolve(dirname(file), spec);
    if ((target + sep).startsWith(own) || target.startsWith(own)) return match; // within this package
    const path = relative(root, target).split(sep).join("/");
    const shared = ["micashared/", "mica/common/", "mica/member/", "validate/", "google/"];
    if (!shared.some((prefix) => path.startsWith(prefix)))
      throw new Error(`${file}: import ${spec} is neither in this package nor in @1080network/mica-common`);
    rewritten++;
    return `${before}@1080network/mica-common/${path}${after}`;
  });
  if (updated !== source) writeFileSync(file, updated);
}
console.log(`rewrote ${rewritten} shared imports in ${ownDir}`);

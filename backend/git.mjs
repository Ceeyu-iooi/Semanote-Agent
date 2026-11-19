import { spawn } from "node:child_process";
import { ApiError } from "./data.mjs";

export function gitService(root) {
  async function git(args, allowTruncation = false) {
    const limit = 1024 ** 2;
    const output = await new Promise((resolve, reject) => {
      const process = spawn("git", ["--no-pager", "-c", "core.quotepath=false", ...args], {
        cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "ignore"], signal: AbortSignal.timeout(10000),
      });
      const unavailable = () => reject(new ApiError(503, "gitUnavailable", "Git 记录暂不可读，请确认项目仓库可访问。"));
      const chunks = [];
      let size = 0, truncated = false;
      process.stdout.on("data", (chunk) => {
        const retained = chunk.subarray(0, Math.max(0, limit - size));
        if (retained.length) chunks.push(retained);
        size += retained.length;
        truncated ||= retained.length < chunk.length;
      });
      process.on("error", unavailable);
      process.on("close", (code) => code ? unavailable() : resolve({ text: Buffer.concat(chunks).toString("utf8"), truncated }));
    });
    if (allowTruncation) return output;
    if (output.truncated) throw new ApiError(503, "gitOutputLimit", "Git 记录超出当前展示范围。");
    return output.text;
  }
  return {
    async history() {
      const [log, branch, head] = await Promise.all([
        git(["log", "--all", "--topo-order", "--max-count=200", "--format=%H%x09%P%x09%cI%x09%D%x09%s"]),
        git(["branch", "--show-current"]), git(["rev-parse", "HEAD"]),
      ]);
      const commits = log.trimEnd().split(/\r?\n/).map((line) => {
        const [id, parents, date, refs, ...subject] = line.split("\t");
        return { id, parents: parents ? parents.split(" ") : [], date, refs, subject: subject.join("\t") };
      });
      return { branch: branch.trim(), head: head.trim(), commits, limit: 200 };
    },
    async changes(id) {
      if (!/^[a-f0-9]{40}$/.test(id)) throw new ApiError(400, "invalidRevision", "请选择有效提交。");
      const [numstat, patch, summary] = await Promise.all([
        git(["show", "--format=", "--first-parent", "--root", "--numstat", "--no-renames", "-z", id, "--"]),
        git(["show", "--format=", "--first-parent", "--no-ext-diff", "--no-renames", "--unified=3", id, "--",
          "README.md", "AGENTS.md", "CHANGELOG.md", "frontend/src", "frontend/tests", "frontend/package.json", "backend", "agent",
          "tools", "docs/*.md", "docs/design/tokens.css", "docs/design/preview.css", "docs/design/preview.js"], true),
        git(["show", "--format=fuller", "--first-parent", "--stat", "--no-renames", id, "--"]),
      ]);
      const files = numstat.split("\0").filter(Boolean).map((line) => {
        const [additions, deletions, ...path] = line.split("\t");
        return { path: path.join("\t"), binary: additions === "-", additions: additions === "-" ? null : +additions, deletions: deletions === "-" ? null : +deletions };
      });
      return { id, files, patch: patch.text, patchTruncated: patch.truncated, comparison: "firstParent", summary };
    },
  };
}

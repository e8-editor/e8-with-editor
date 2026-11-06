// SPDX-License-Identifier: GPL-3.0-or-later
//
// with-editor's tests, with ERT: a program run with with-editor's
// environment and filter asks E8 to edit a file, which E8 visits in
// with-editor-mode; C-c C-c saves it and lets the program go on, C-c C-k
// lets it go on told the edit was cancelled. The program is a shell that
// runs $EDITOR as git does, then prints the editor's exit status.
// `make test` runs them in e8 --batch, as CI does.

import { ertDeftest, should, shouldEqual, shouldError } from "ert";
import { withEditorEnv, withEditorFilter, withEditorP } from "with-editor";

/** A file to edit, in a directory of its own, holding TEXT. */
function tempFile(text: string): { dir: string; file: string } {
  const dir = e8.fileTruename(e8.makeTempFile("with-editor-test", { dir: true }));
  const file = e8.expandFileName("MSG", dir);
  e8.writeTextFile(file, text);
  return { dir, file };
}

/** Waits for DONE, taking in the program's output meanwhile, for up to ten seconds. */
function settle(done: () => boolean): void {
  for (let i = 0; i < 200 && !done(); i++) e8.acceptProcessOutput(undefined, 0.05);
}

/**
 * Runs `$EDITOR ARGS...` through a shell, as git runs its editor, with
 * with-editor's environment and filter, and waits for E8 to visit the
 * file. Gives the process and what it printed besides the request.
 */
function edit(dir: string, args: string[]): { process: string; output: string[] } {
  const output: string[] = [];
  const process = e8.makeProcess({
    name: "with-editor-test",
    command: ["sh", "-c", 'eval "$EDITOR \\"\\$@\\""; echo "status $?"', "sh", ...args],
    directory: dir,
    env: withEditorEnv(),
    filter: withEditorFilter((_, text) => void output.push(text)),
  });
  const visiting = () => withEditorP() && e8.fileTruename(e8.bufferFileName() ?? "").startsWith(dir);
  settle(visiting);
  should(visiting(), "E8 visits the file the editor asks for");
  return { process, output };
}

/** Waits for the program to finish, and gives its output. */
function finished(run: { process: string; output: string[] }): string {
  settle(() => run.output.join("").includes("status"));
  return run.output.join("").trim();
}

/** Kills any buffer left visiting a file in DIR, a test having failed, and deletes DIR. */
function cleanUp(dir: string): void {
  for (const b of e8.bufferList()) {
    const file = e8.withCurrentBuffer(b, () => e8.bufferFileName());
    if (file && e8.fileTruename(file).startsWith(dir)) {
      e8.withCurrentBuffer(b, () => e8.setBufferModified(false));
      e8.call("kill-buffer", b);
    }
  }
  e8.deleteDirectory(dir, { recursive: true });
}

ertDeftest("with-editor-the-environment-makes-e8-every-editor-git-asks", () => {
  const env = withEditorEnv();
  shouldEqual(Object.keys(env).sort(), ["EDITOR", "GIT_EDITOR", "GIT_SEQUENCE_EDITOR", "VISUAL"]);
  should(env.EDITOR.startsWith("sh -c '"), "a sleeping editor in sh");
});

ertDeftest("with-editor-c-c-c-c-saves-and-lets-the-program-go-on", () => {
  const { dir, file } = tempFile("old\n");
  try {
    let visited: string | undefined;
    const onVisit = () => void (visited = e8.bufferFileName());
    e8.addHook("with-editor-filter-visit-hook", onVisit);
    let run;
    try {
      run = edit(dir, ["MSG"]);
    } finally {
      e8.removeHook("with-editor-filter-visit-hook", onVisit);
    }
    shouldEqual(e8.bufferFileName(), file);
    shouldEqual(visited, file);
    shouldEqual(e8.variable("with-editor-mode"), true);
    shouldEqual(e8.messages().at(-1), "Type C-c C-c to finish, or C-c C-k to cancel");
    shouldEqual(e8.processStatus(run.process), "run", "the program waits");
    let finishedIn: string | undefined;
    const onFinish = () => void (finishedIn = e8.bufferName());
    e8.addHook("with-editor-post-finish-hook", onFinish);
    try {
      e8.executeKbdMacro("C-e SPC n e w C-c C-c");
    } finally {
      e8.removeHook("with-editor-post-finish-hook", onFinish);
    }
    shouldEqual(finished(run), "status 0");
    should(finishedIn !== undefined, "with-editor-post-finish-hook ran");
    should(!e8.bufferList().includes("MSG"), "the buffer is killed");
    shouldEqual(e8.readTextFile(file), "old new\n");
  } finally {
    cleanUp(dir);
  }
});

ertDeftest("with-editor-c-c-c-k-cancels-leaving-the-file", () => {
  const { dir, file } = tempFile("old\n");
  try {
    const run = edit(dir, ["MSG"]);
    let cancelled = false;
    const onCancel = () => void (cancelled = true);
    e8.addHook("with-editor-post-cancel-hook", onCancel);
    try {
      e8.executeKbdMacro("C-e SPC n e w C-c C-k");
    } finally {
      e8.removeHook("with-editor-post-cancel-hook", onCancel);
    }
    shouldEqual(finished(run), "status 1");
    should(cancelled, "with-editor-post-cancel-hook ran");
    shouldEqual(e8.readTextFile(file), "old\n");
  } finally {
    cleanUp(dir);
  }
});

ertDeftest("with-editor-plus-line-puts-point-on-that-line", () => {
  const { dir } = tempFile("one\ntwo\nthree\n");
  try {
    const run = edit(dir, ["+3", "MSG"]);
    shouldEqual(e8.lineText(e8.lineOf(e8.point())), "three");
    e8.executeKbdMacro("C-c C-c");
    shouldEqual(finished(run), "status 0");
  } finally {
    cleanUp(dir);
  }
});

ertDeftest("with-editor-file-modes-set-the-major-mode", () => {
  const { dir } = tempFile("text\n");
  try {
    const run = e8.letBind({ "with-editor-file-modes": [["/MSG\\'", "text-mode"]] }, () => edit(dir, ["MSG"]));
    shouldEqual(e8.variable("major-mode"), "text-mode");
    shouldEqual(e8.variable("with-editor-mode"), true);
    e8.executeKbdMacro("C-c C-k");
    shouldEqual(finished(run), "status 1");
  } finally {
    cleanUp(dir);
  }
});

ertDeftest("with-editor-the-filter-passes-on-the-rest-a-line-at-a-time", () => {
  const passed: string[] = [];
  const filter = withEditorFilter((_, text) => void passed.push(text));
  filter("p", "first li");
  shouldEqual(passed, [], "half a line waits for the rest");
  filter("p", "ne\nsecond line\nthird");
  shouldEqual(passed, ["first line\nsecond line\n"]);
  filter("p", "\nWITH-EDITOR: 1 OPEN");
  shouldEqual(passed, ["first line\nsecond line\n", "third\n"]);
});

ertDeftest("with-editor-finishing-needs-a-program-waiting", () => {
  e8.call("switch-to-buffer", "with-editor-none");
  shouldError(() => e8.call("with-editor-finish" as e8.DefinedCommand), { type: "user-error" });
});

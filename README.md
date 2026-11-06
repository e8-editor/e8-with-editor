# e8-with-editor

E8 as the editor of the programs it runs, for [E8](https://github.com/e8-editor/e8): when a program such as `git commit` or `git rebase -i` started from E8 wants its `$EDITOR`, E8 visits the file in `with-editor-mode`, `C-c C-c` saves it and lets the program go on, and `C-c C-k` cancels. [e8-magit](https://github.com/e8-editor/e8-magit) writes commit messages and rebase todo lists this way. A port of with-editor.el 3.4.6.

## Installing

Most people get it as a requirement of e8-magit, which installs it. To use it on its own, in `~/.config/e8/init.ts`:

```ts
e8.usePackage("e8-editor/e8-with-editor");
```

E8 installs it at its newest version tag into `repos/` beside `init.ts`, records the commit in `e8-lock.json`, and requires it. `M-x package-vc-upgrade` brings it up to date. Pin a version with `{ rev: "v0.1.0" }`. It needs E8 0.3.1 or newer.

## Using it

It is for packages that start programs. Give the program with-editor's environment, and its output to with-editor's filter:

```ts
import { withEditorEnv, withEditorFilter } from "with-editor";

e8.makeProcess({
  name: "git-commit",
  command: ["git", "commit"],
  env: withEditorEnv(),
  filter: withEditorFilter((process, output) => e8.message(output)),
});
```

`withEditorEnv()` sets `EDITOR`, `VISUAL`, `GIT_EDITOR` and `GIT_SEQUENCE_EDITOR` to a small shell script, with-editor's "sleeping editor", which prints which file it was asked to edit and waits. `withEditorFilter(next)` reads that request from the program's output, visits the file, and passes the rest of the output on to `next`, a line at a time. An editor started with `+LINE FILE` puts point on that line.

In the file's buffer:

| Key | Does |
| --- | --- |
| `C-c C-c` | `with-editor-finish`: save the file, kill the buffer and let the program go on |
| `C-c C-k` | `with-editor-cancel`: kill the buffer unsaved and let the program go on, told it was cancelled (the editor exits with status 1) |

- `with-editor-file-modes`: `[regexp, mode]` pairs, the major mode for the files whose names match, as e8-magit sets for `COMMIT_EDITMSG` and `git-rebase-todo`.
- `with-editor-filter-visit-hook` runs in the buffer of a file visited for a program, `with-editor-post-finish-hook` after `C-c C-c` and `with-editor-post-cancel-hook` after `C-c C-k`.
- `withEditorP()` says whether the current buffer is one a program waits for.

## Differences from with-editor.el

- There is only the sleeping editor, so only programs E8 starts itself can use it. There is no `emacsclient`, and so no editing for programs started elsewhere, such as in a terminal or over TRAMP.
- There are no `with-editor-async-shell-command`, `with-editor-shell-command` or `with-editor-export-editor` commands, and no `shell-command-with-editor-mode`: a package passes `withEditorEnv()` to `e8.makeProcess` itself.
- `with-editor-file-modes` is the port's own: a package names there the major mode for the files it has programs ask for, after the mode `find-file` chose. There is no `with-editor-cancel-message`, and no `with-editor-debug`.

## Credit

This is a port to E8 of [with-editor](https://github.com/magit/with-editor) 3.4.6, by Jonas Bernoulli and [its contributors](https://github.com/magit/with-editor/graphs/contributors), copyright The Magit Project Contributors, and distributed in NonGNU ELPA and MELPA, under the GNU General Public License version 3 or later. It is not the upstream authors' work as published, and they do not endorse it: report problems with the port here, not upstream.

## Developing

With an E8 on your PATH (a [release](https://github.com/e8-editor/e8/releases), or built from source) and TypeScript 5.8 or newer:

```bash
make test
make types
```

The tests in `test/with-editor-tests.ts` run a shell that calls `$EDITOR` as git does, with with-editor's environment and filter, and check that E8 visits the file in `with-editor-mode` (on the line `+LINE` asks for, in the mode `with-editor-file-modes` gives), that `C-c C-c` saves it and the editor exits 0, that `C-c C-k` leaves it and the editor exits 1, that the hooks run, and that the filter passes the program's other output on a line at a time. They need `sh` and `kill`, as with-editor itself does.

## Licence

GPL-3.0-or-later: see `LICENSE`.

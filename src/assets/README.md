# Welcom to WebShell

Edit files on Browser PoC. (only for GoogleChrome)

If you find any errors, please let me know!

https://twitter.com/mizchi

## How to use

Focus terminal(`Ctrl-2`) and run commands.

```sh
# demo bundle on temporal storage
/workspace
# run
$ exec main.ts
# bundle to ./dist
$ bundle main.ts
gen > /workspace/dist/main.js

$ mount
# choose your local directory
# ...now I choose fs-test directory
/fs-test
# create empty file
$ touch test
$ ls
test

# open file on left editor(here)
$ open main.ts
# edit and (Ctrl or Cmd)+S
$ ls
test
main.ts
$ bundle main.ts
> gen > /fs-test/dist/main.ts
```

CAUTION: `/workspace` is a temporal storage. Sometimes browsers remove this.

## Shortcut Keys

- `Ctrl-1`: focus editr
- `Ctrl-2`: focus terminal
- `Ctrl-L`: clear terminal log
- Mac: `Cmd-S`: Save current editing file
- Win: `Ctrl-S`: ↑

## Special command

- `mount`: Choose your local file and mount
- `open <path>`: Open editor on left (here).
- `Ctrl-L`: Refresh shell history

## UnixLike Commands

- [x] cmd: cd `<dest>`
- [x] cmd: mkdir `<dirname>`
- [x] cmd: touch
- [x] cmd: rm
- [x] cmd: rmdir
- [x] cmd: echo
- [x] cmd: ls
- [x] cmd: cp `<from>` `<to>`
- [x] cmd: cat `<file>`
- [x] cmd: exec `<file>`
- [x] cmd: eval `<code>`
- [x] cmd: bundle `<path>`: generate `dist/...`
- [x] op: pipeline `|>` example. `echo myfile |> touch`
- [x] op: `&&`
- [x] op: `||`
- [ ] cmd: minify
- [ ] prompt
- [ ] glob pattern `**`
- [ ] parse flags
- [ ] Abort Execution
- [ ] op: pipe `|`
- [ ] op: stdin `>`
- [ ] wasi module import
- [ ] filepath autocomplete
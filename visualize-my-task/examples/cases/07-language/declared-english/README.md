# Harbor Notes multilingual team example

Primary language: English

This synthetic existing project declares English as its primary language. Its current task plan is written in Chinese because those source records belong to a Chinese-speaking contributor. The board follows the declared project language while preserving the contributor's original text.

From the skill directory:

```sh
node scripts/board.mjs --root examples/cases/07-language/declared-english --plan PLAN.md --lang auto --check
```

Expect `language: "en"` and two tasks. `DECL-01` is in progress; `DECL-02` is the next task after that prerequisite. Replace `--check` with `--port 0` to inspect English interface labels beside unchanged Chinese task text. Add `--lang zh` to choose a Chinese interface explicitly.

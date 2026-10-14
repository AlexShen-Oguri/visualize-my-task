# Case 07: Follow the project's language

This is a synthetic existing project named Harbor Notes. Names, tasks, states and dates are sample data. The task plan, product specification and change history are written in English. This project has no explicit primary-language declaration, so the selected task documents provide the language evidence.

From the skill directory, open the example:

```sh
node scripts/board.mjs --root examples/cases/07-language --plan PLAN.md --spec docs/product-spec.md --changelog CHANGELOG.md --lang auto --port 0
```

1. The snapshot's `language` is `en`. Interface controls, task-detail labels, source/history panels, status messages and accessible names use English.
2. The map contains three tasks. `LANG-01` is in progress; `LANG-02` is the next step once its recorded prerequisite is complete. Verification and human acceptance remain unrecorded.
3. The specification provides reference text and does not create tasks or prove acceptance. Source text remains verbatim.
4. Start the same command with `--lang zh`: the interface switches to Chinese while task titles, recorded states, specification text and history remain English.

To inspect language resolution without starting a server, replace `--port 0` with `--check`.

## Declared English with Chinese task documents

The [declared-english](declared-english/README.md) subproject explicitly declares English in its README while its task document is Chinese. It demonstrates that the project's declared primary language takes priority over document-language detection:

```sh
node scripts/board.mjs --root examples/cases/07-language/declared-english --plan PLAN.md --lang auto --port 0
```

Expect `language: "en"` and two task nodes. The interface stays English; the Chinese task names, recorded states and notes stay Chinese. Adding `--lang zh` overrides the project declaration. Reading either example does not modify its sources.

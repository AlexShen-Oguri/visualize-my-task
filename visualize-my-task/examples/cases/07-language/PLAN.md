# Harbor Notes implementation plan

This synthetic existing project has selected the following implementation steps. The current goal is to let a person find a note and read its source. These are sample task facts, not records of delivered application work.

## Current work

| ID | Task | Status | Tests | Acceptance | Delivery | Dependencies | Route | Workstream | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LANG-01 | Build the note list and local filter | In progress | Unrecorded | Unrecorded | Not delivered | none | main | development | Preserve the note title and source path exactly as recorded. |
| LANG-02 | Open a note and show its source | Not started | Unrecorded | Unrecorded | Not delivered | LANG-01 | main | development | Requires the list interaction selected in LANG-01. |
| LANG-03 | Add keyboard navigation and an empty result message | Not started | Unrecorded | Unrecorded | Not delivered | LANG-02 | main | development | Record actual verification and human acceptance separately. |

The product specification is in `docs/product-spec.md`. Historical planning decisions are in `CHANGELOG.md`. Neither file establishes task completion or human acceptance.

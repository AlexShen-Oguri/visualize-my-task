# Security

Visualize My Task is a local Markdown viewer. Its server binds to `127.0.0.1`, checks Host and Origin, and serves fixed GET / HEAD routes. It has no source-writing API, raw-file download endpoint, runtime model calls, or chat listener. The separate plan initializer and development agent may write plans only within the user's authorized planning scope.

Use the server on the local machine. Do not expose it through a reverse proxy, public tunnel, or shared host. Selected source text is visible in the local dashboard; only select documents intended for that view. Repository privacy does not make local source data safe to publish. Release packages contain synthetic examples and exclude private development records and generated artifacts.

## Reporting a vulnerability

Report security issues privately to this private repository's maintainer through GitHub's [security advisories](https://github.com/AlexShen-Oguri/visualize-my-task/security/advisories). Access depends on repository permissions and the enabled reporting features. If a private report option is unavailable, contact a repository administrator through an existing private channel.

Include the affected version, reproduction steps, expected behavior, actual behavior, and a minimal synthetic example. Do not include credentials or private project records. This policy describes intended boundaries; it is not a claim that an audit has passed.

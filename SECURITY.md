# Security

The supported version is the current `main` branch. Report suspected vulnerabilities privately through [GitHub private vulnerability reporting](https://github.com/Arnav66692/is-it-an-ebike/security/advisories/new). Do not put credentials, personal rider information or working attacks against deployed services into a public issue.

The listing fetcher permits HTTP(S) on standard ports, rejects private/special-use destinations, pins validated DNS answers to the socket, and repeats validation at each redirect. Regression tests cover address changes, redirects, response limits and connection cleanup. This defense does not replace hosting-level outbound network controls.

API rate limits are best effort and per process. Operators should configure trusted proxy headers, request-size limits and shared rate limiting for their deployment. See [deployment notes](docs/DEPLOYMENT.md).

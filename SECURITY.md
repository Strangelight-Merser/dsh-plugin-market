# Security policy

## Supported version

Security fixes are provided for the latest release. The current development
line is `0.4.x` and supports exactly DSH `0.1.0-rc.6`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not
open a public issue with exploit details, credentials, or private paths. Include
the affected version, DSH version, reproduction steps, impact, and any proposed
mitigation. You should receive an acknowledgement within seven days.

## Security boundary

The market reduces accidental and supply-chain risk; it is not a sandbox.

- State-changing HTTP requests require the exact page origin and JSON input.
- Installation uses argument arrays, not shell command strings.
- npm versions and GitHub commits are resolved exactly and shown before the
  user confirms installation.
- Dependency installation scripts are disabled.
- Package name, DSH bundle declaration, host entrypoint, installed artifacts,
  profile state, and verified licenses are checked where applicable.
- Failed mutations restore profile metadata and repair dependencies.

After installation, a third-party plugin runs inside DSH with the user's host
permissions. It may read files and credentials or access the network. The market
cannot protect against a plugin that is validly packaged but malicious.

The local DSH Web origin is a shared trust boundary: another already-loaded
same-origin plugin may access the market API. Do not expose DSH Web to untrusted
networks, and install only plugins whose source you trust.

# Security policy

Opentrail builds and sends transactions that move real funds. We take every report seriously.

## Report a vulnerability

Report privately. Don't open a public issue, pull request or discussion.

- **Preferred:** [open a private security advisory](https://github.com/aeron-playground/Opentrail/security/advisories/new) on GitHub.
- **Or email:** [agab0323@gmail.com](mailto:agab0323@gmail.com)

Please include:

- what the problem is and what an attacker could do with it
- steps to reproduce, or a proof of concept
- the commit or version you tested
- your name or handle, if you'd like credit

Never include real private keys, seed phrases or other people's data in a report.

## What to expect

- We reply within 3 working days to confirm we got your report.
- We keep you updated while we work on a fix.
- We agree on a disclosure date with you, and we credit you in the advisory unless you prefer not.

There is no bug bounty yet.

## Scope

In scope: the code in this repository, including the web app, the API, the indexer, transaction
building and verification, fee logic and the docs site.

Out of scope:

- vulnerabilities in outside services we use (report those to the service itself)
- denial of service, spam and rate-limit testing against hosted instances
- social engineering, phishing and physical attacks
- reports from automated scanners without a working impact

## Supported versions

Opentrail is in early development. Only the latest commit on `main` gets security fixes.

## Stay safe

Opentrail never asks for your private key or seed phrase. Anyone who does is not us.

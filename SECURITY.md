# Security Policy

## Supported Surface

The default branch is the supported repository surface. Historical artifacts, research, prototypes, and archived material are not production-ready unless the repository explicitly says otherwise.

## Reporting

Report suspected vulnerabilities privately to the Old School maintainers. For a public repository, use **Security → Advisories → Report a vulnerability**. If that option is unavailable, contact an organization owner through an existing private channel.

Do not open a public issue for exploitable behavior, leaked credentials, live access concerns, or details that would materially help an attacker.

Include:

- the affected component, workflow, or data surface
- impact and realistic exploitability
- minimal reproduction steps or evidence
- whether any secret, private key, personal data, or internal operational detail may be exposed

## Maintainer Handling

- Triage privately before public disclosure.
- Never rotate or transmit secrets through pull requests.
- Revoke exposed credentials before discussing remediation publicly.
- Document user-impacting fixes without publishing unnecessary exploit detail.
- Treat unexpected permission, deployment, dependency, or access-control changes as security incidents until reviewed.


# Security Policy

## Supported versions

Security fixes are provided for the latest released version of Wormhole Connector. Prereleases are supported only while they are the current test version.

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting form for this repository when it is available. Otherwise, open a minimal issue asking for a private contact channel without including exploit details, DNS connector addresses, usernames, passwords, application passwords, session identifiers, internal hostnames, or other sensitive data.

Please include the affected extension version, browser, operating system, impact, and the smallest safe reproduction description. Do not test against systems you do not own or have explicit permission to assess.

## Credential handling

Wormhole Connector stores Pi-hole and AdGuard Home credentials only in local extension storage. Usernames, passwords, application passwords, SIDs, CSRF values, and running temporary actions are excluded from local backup files and browser synchronization. Pi-hole API sessions are held in session storage and explicitly closed when connection settings are replaced where the instance remains reachable.

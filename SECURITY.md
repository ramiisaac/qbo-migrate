# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in `qbo-migrate`, please report it privately.

**Email:** raisaac@icloud.com

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Affected versions, if known

I will acknowledge receipt within 7 days and aim to provide an initial response within 14 days. Please give me a reasonable opportunity to address the issue before public disclosure.

## Supported Versions

Security fixes are backported only to the latest minor version. Older versions receive no security maintenance.

## Scope

This tool interacts with the QuickBooks Online API using OAuth tokens you provide. It does not collect telemetry, call home, or transmit data to any third party other than Intuit's QBO API. Review `src/` to verify before use in production.

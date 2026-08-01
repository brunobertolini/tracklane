## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] Tests cover the change (`pnpm test`)
- [ ] `pnpm check` passes locally
- [ ] A changeset is included (`pnpm changeset`). Skip only for docs and CI-only changes

## Adding or changing a provider

<!-- Delete this section if the change does not touch a provider. -->

A `204` means the request arrived, not that the event exists, so a passing test suite
proves nothing here. See CONTRIBUTING.md.

- [ ] The outgoing request, captured from the built library, with the parameters it sent
- [ ] A screenshot of the vendor's own report with the event visible in it
- [ ] Captured with an ordinary desktop user agent, not a headless one
- [ ] Both halves covered, browser and server, or the PR says which is missing and why

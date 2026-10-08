# Releasing

Claude does not publish, push tags or touch npm settings (see `CLAUDE.md`). The owner does these steps.

How npm works for this package (checked against the npm docs on 8 Oct 2026): publishes are **staged**. A staged version is not public until a maintainer approves it with 2FA, and `npm stage list/view/approve/reject` cannot use OIDC tokens. The first publish (0.1.0) went this way: npm showed a `0.0.0-stage` placeholder until it was approved. The `0.0.0-stage` version stays in the version list; `latest` points at the real release.

## One-time setup (trusted publishing)

1. On npmjs.com: package `@nouisi/orb` → Settings → Trusted publishing → GitHub Actions. Owner `upadhyayprakash`, repository `noui-orb`, workflow filename `release.yml`. Leave environment empty.
2. Do the next section soon after. A new trusted-publisher setup **expires if it has no successful publish within 2 days** and then has to be deleted and recreated. npm does not validate the setup when you save it, so a typo only shows up as a failed publish.
3. Package → Settings → Publishing access: the docs recommend allowing only `npm stage publish`, so every CI release waits for approval. That is what `release.yml` runs. (Enabling "Require two-factor authentication and disallow tokens" does not affect trusted publishers.)

## Each release

1. Update `CHANGELOG.md`, bump the version (`npm version <x.y.z> --no-git-tag-version`), commit and push to `main`. CI must be green.
2. Tag and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The workflow fails if the tag and `package.json` disagree.
3. The workflow stages the version. Then, with npm 11.15 or later (`npm i -g npm@latest`):
   - `npm stage list @nouisi/orb`
   - `npm stage view <stage-id>` (check the version and the 23 or so files)
   - `npm stage approve <stage-id>` and enter your one-time code
   Approval can also be done on npmjs.com instead of the CLI (the `stage` commands need a recent npm and Node 22.14 or later).
4. Check: `npm view @nouisi/orb version` shows the new version, `npm audit signatures` in a project that installed it reports a verified attestation, and the package page shows the provenance badge. Confirmed on 0.1.1: a staged publish through trusted publishing does record provenance.

## After the first successful release

On npmjs.com: package → Settings → Publishing access → "Require two-factor authentication and disallow tokens".

# Changesets

This monorepo uses [changesets](https://github.com/changesets/changesets) for independent versioning of each wallet package.

```bash
npx changeset                # record an intent (which package, severity, summary)
npx changeset version        # bump versions, regenerate per-package CHANGELOG.md
```

Releases are published manually per package: `npm publish -w <pkg> --access public`.

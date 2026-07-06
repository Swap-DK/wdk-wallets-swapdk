# Upstream PR artifacts

Ready-to-apply materials for submitting the OP_RETURN memo support to [`tetherto/wdk-wallet-btc`](https://github.com/tetherto/wdk-wallet-btc).

The diff in this folder is the same change that lives in `src/wallet-account-btc.js` and `src/wallet-account-read-only-btc.js` of this package, but stripped of the SwapDK fork-note comments — i.e. clean, ready for upstream review.

## Files

| File | Purpose |
|---|---|
| `op-return-memo.patch` | Combined patch against `@tetherto/wdk-wallet-btc@1.0.0-beta.9` |
| `op-return-unit.test.js` | Unit tests (Jest, ESM) — place at `tests/op-return-unit.test.js` |
| `op-return-integration.test.js` | Regtest integration tests — place at `tests/integration/op-return.integration.test.js` |
| `PR_DESCRIPTION.md` | Body for `gh pr create --body-file PR_DESCRIPTION.md` |

## Workflow

```bash
# 1. Fork tetherto/wdk-wallet-btc on GitHub.
# 2. Clone your fork locally.
git clone git@github.com:<your-user>/wdk-wallet-btc.git
cd wdk-wallet-btc

# 3. Pin to the version this patch was authored against.
git checkout v1.0.0-beta.9   # or whatever tag/branch matches beta.9

# 4. Create a feature branch.
git checkout -b feat/op-return-memo

# 5. Apply the source patch.
git apply <path-to-this-folder>/op-return-memo.patch

# 6. Drop in the test files.
cp <path-to-this-folder>/op-return-unit.test.js tests/
mkdir -p tests/integration
cp <path-to-this-folder>/op-return-integration.test.js tests/integration/op-return.integration.test.js

# 7. Verify locally.
npm install
npm run lint
npm run test:unit
# (Optional) regtest harness — uses upstream's existing setup
# npm run test:integration

# 8. Commit and push.
git add -A
git commit -m "feat: add optional OP_RETURN memo to sendTransaction / signTransaction"
git push -u origin feat/op-return-memo

# 9. Open the PR with the prepared description.
gh pr create \
  --repo tetherto/wdk-wallet-btc \
  --base main \
  --head <your-user>:feat/op-return-memo \
  --title "Add optional \`memo\` (OP_RETURN) to sendTransaction / signTransaction" \
  --body-file <path-to-this-folder>/PR_DESCRIPTION.md
```

## Versioning note

The patch was generated against the public tarball of `@tetherto/wdk-wallet-btc@1.0.0-beta.9`. If upstream's `main` has drifted (e.g. beta.10+ refactored the PSBT builder), the patch may need a manual rebase. The actual diff is small (~80 lines) and the change is localized to `_getRawTransaction` + `_planSpend`, so rebasing is straightforward.

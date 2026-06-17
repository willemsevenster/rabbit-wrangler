# Releasing Rabbit Wrangler

Releases are built and published to **GitHub Releases** by `.github/workflows/release.yml`,
triggered when a `v*` tag is pushed. The running app (via `electron-updater`) checks
those Releases and offers in-app updates.

## Versioning

The app uses **semantic versioning**. The Git tag must match `package.json`'s
`version` exactly, with a `v` prefix: tag `v0.1.1` ⇄ `"version": "0.1.1"`. The
release workflow's `verify` job fails the build if they disagree.

## Cut a release

Releases ship from `main` (git-flow: promote `develop` → `main` first).

```sh
# 1. Make sure main has what you want to ship (merge develop → main).
git checkout main && git pull

# 2. Bump the version in package.json (e.g. 0.1.0 → 0.1.1), commit.
#    (edit "version" in package.json)
git commit -am "chore: release v0.1.1"
git push

# 3. Tag and push the tag — this triggers the Release workflow.
git tag v0.1.1
git push origin v0.1.1
```

The workflow then, on `windows-latest` + `ubuntu-latest`:

- builds the app (`pnpm build`),
- packages the **NSIS installer** (Windows) and **AppImage + `.deb` + `.rpm`**
  (Linux) with `electron-builder --publish always` (the Linux job installs the
  `rpm` tool first, which `.rpm` packaging needs),
- uploads them plus the update metadata (`latest.yml`, `latest-linux.yml`, and
  `*.blockmap` for differential downloads) to a new GitHub Release for the tag.

Existing installs detect the new version on next launch (or via **Help → Check
for Updates…**) and offer to download + restart.

> **Linux installers:** the **AppImage** is the auto-updating artifact —
> `electron-updater` only self-updates the AppImage on Linux. The **`.deb`** and
> **`.rpm`** are conventional installers (apt/dnf) and are **manual-install /
> manual-upgrade**: install a newer release through the package manager. (`.deb`
> requires the `maintainer` field set in `electron-builder.yml`.)

## Code signing (not yet enabled)

Builds are currently **unsigned**:

- **Windows:** users see a one-time SmartScreen "unknown publisher" warning on
  first install; auto-update still works. To sign later, obtain a code-signing
  certificate (must live on a hardware token / cloud HSM since 2023), add
  `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` as repo secrets, and uncomment the
  `CSC_*` env in `release.yml`. No other change is needed — electron-builder
  reads those automatically.
- **Linux:** AppImage has no signing requirement; auto-update works unsigned.

## Notes

- **macOS is not built/shipped** (auto-update there requires Apple notarization).
- Auto-update **cannot** be exercised in `electron-vite dev` (no `app-update.yml`);
  test it by installing a real release and publishing a higher version. See the
  verification notes in the implementation plan.
- **Linux AppImage** updates only when the app is run from the packaged AppImage
  (it replaces the file in place and relaunches).

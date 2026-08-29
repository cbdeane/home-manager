# AGENTS.md

## Repository Workflow

These instructions apply to all work in this repository.

- Work directly on `main` for routine changes.
- Do not create or switch to a feature branch or Git worktree unless the user explicitly requests one.
- The automated OpenCode update pull request is the only standing exception to the direct-`main` workflow.
- Keep changes focused and preserve unrelated work already in the working tree.
- Commit or push only when the user explicitly requests it. When requested, commit and push `main` directly unless told otherwise.
- Never force-push or rewrite published history.

Before editing, confirm the repository state:

```bash
git branch --show-current
git status --short --branch
```

## Secret Safety

This is a public repository. Treat credentials, private keys, tokens, kubeconfigs, Talos configs, private certificates, customer data, internal identifiers, and infrastructure details as sensitive unless they are intentionally public.

- Never commit plaintext secrets, even temporarily.
- Never include secret values in prompts, chat responses, terminal output, logs, diffs, commit messages, issue text, or workflow output.
- Never inspect or print decrypted secret contents unless the user explicitly requires it and there is no safer validation method.
- Never pass secret values on command lines. Prefer runtime file references with mode `0600`.
- Never put secrets in Nix expressions, derivation arguments, generated configuration text, or anything else copied into the world-readable Nix store.
- Use `sops-nix` runtime secret paths for service and application consumption.
- Keep plaintext source material outside this repository with restrictive permissions, and remove it after encryption and verification.
- Keep secret backups outside this repository with directory mode `0700` and file mode `0600`; encrypt backups when they leave the machine.

### SOPS Rules

- Store repository-managed secret material only as SOPS-encrypted files under `encrypted/`.
- The `.enc` suffix is not proof of encryption. Verify each file with:

```bash
sops filestatus --input-type binary encrypted/<name>.enc
```

- The result must report `{"encrypted":true}` before the file is staged.
- Use full-file binary SOPS encryption for files under `encrypted/` so names and structure are not exposed.
- Do not add Gitleaks allow markers, ignore fingerprints, or custom scanner configuration without explicit user review.
- The age recipient in `.sops.yaml` is public and may be committed.
- The private age identity at `~/.config/sops/age/keys.txt` must never enter this repository, a Nix store path, logs, or agent context.
- Do not run `sops --decrypt` to the terminal. Direct decrypted output only to its intended protected consumer when decryption is genuinely required.
- After changing age recipients, update keys with SOPS and verify every encrypted file before committing.

If a secret may have reached Git history, logs, or an agent transcript, stop normal work and notify the user. Rotate or revoke the credential first; deleting the file or rewriting history alone is not sufficient.

## Required Checks

Before every commit or push, run:

```bash
./scripts/check-secrets
git diff --check
nix flake check --no-build
```

For NixOS or Home Manager changes, also run:

```bash
nixos-rebuild build --flake /home/char0/nixconfig#nixos
```

Do not claim activation succeeded unless `nixos-rebuild switch` completed. If `sudo` needs an interactive password, ask the user to run the switch command and then verify the active generation.

When reporting secret-scan findings, redact values completely. Report only the finding type, file, safe line reference, and remediation.

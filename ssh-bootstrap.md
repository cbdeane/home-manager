# SSH Bootstrap

This configuration stores SSH private keys and the managed `known_hosts` file
as binary SOPS secrets. Before applying it on another machine, restore the age
identity used by SOPS at:

```text
~/.config/sops/age/keys.txt
```

Set its permissions to `0600`, clone this repository, and apply the NixOS
configuration:

```bash
chmod 600 ~/.config/sops/age/keys.txt
sudo nixos-rebuild switch --flake /home/char0/nixconfig#nixos
```

The age identity must be restored from a protected backup before the encrypted
repository files can be decrypted. Keep that backup separate from this
repository. A future migration can add a hardware-backed or password-manager
bootstrap mechanism.

SSH connections use the declarative hosts `arturo`, `beelink`, and `ntfy`:

```bash
ssh arturo
ssh beelink
ssh ntfy
```

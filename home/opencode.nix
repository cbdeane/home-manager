{ config, pkgs, ... }:
let
  mcpPackages = pkgs.callPackage ../pkgs/mcp.nix { };
in {
  home.packages = [
    mcpPackages.kubernetes-mcp-server
    mcpPackages.mcp-proxmox
  ];

  home.sessionVariables = {
    KUBECONFIG = config.sops.secrets.kubeconfig.path;
    TALOSCONFIG = config.sops.secrets.talosconfig.path;
  };

  sops = {
    age.keyFile = "${config.home.homeDirectory}/.config/sops/age/keys.txt";
    secrets = {
      kubeconfig = {
        sopsFile = ../encrypted/kubeconfig.enc;
        format = "binary";
        mode = "0600";
      };
      proxmox-token = {
        sopsFile = ../encrypted/proxmox-token.enc;
        format = "binary";
        mode = "0600";
      };
      talosconfig = {
        sopsFile = ../encrypted/talosconfig.enc;
        format = "binary";
        mode = "0600";
      };
    };
  };

  home.file = {
    ".config/opencode/opencode.jsonc" = {
      force = true;
      text = builtins.toJSON {
        "$schema" = "https://opencode.ai/config.json";
        default_agent = "build";
        small_model = "openai/gpt-5.6-luna";
        enabled_providers = [ "openai" ];
        plugin = [ "@mohak34/opencode-notifier@0.2.8" ];
        agent = {
          build = {
            model = "openai/gpt-5.6-sol";
            permission.task = {
              "*" = "deny";
              engineer = "allow";
              investigate = "allow";
              review = "allow";
              scout = "allow";
            };
            tools."proxmox_*" = true;
            permission."proxmox_*" = "ask";
          };
          engineer = {
            tools."proxmox_*" = true;
            permission."proxmox_*" = "ask";
          };
        };
        mcp = {
          kubernetes = {
            type = "local";
            command = [ "${mcpPackages.kubernetes-mcp-server}/bin/kubernetes-mcp-server" "--read-only" "--kubeconfig" config.sops.secrets.kubeconfig.path ];
            enabled = true;
          };
          proxmox = {
            type = "local";
            command = [ "${mcpPackages.mcp-proxmox}/bin/mcp-proxmox" ];
            enabled = true;
            environment = {
              PROXMOX_HOST = "proxmox0002.pacific.luhono.com";
              PROXMOX_PORT = "8006";
              PROXMOX_USER = "root@pam";
              PROXMOX_TOKEN_NAME = "tofu";
              PROXMOX_TOKEN_VALUE = "{file:${config.sops.secrets.proxmox-token.path}}";
              PROXMOX_ALLOW_ELEVATED = "true";
              PROXMOX_VERIFY_TLS = "false";
            };
          };
        };
        tools."proxmox_*" = false;
      };
    };
    ".config/opencode/AGENTS.md" = {
      force = true;
      source = ./opencode/AGENTS.md;
    };
    ".config/opencode/opencode-notifier.json" = {
      force = true;
      text = builtins.toJSON {
        sound = false;
      };
    };
    ".config/opencode/agents/engineer.md" = {
      force = true;
      source = ./opencode/agents/engineer.md;
    };
    ".config/opencode/agents/investigate.md" = {
      force = true;
      source = ./opencode/agents/investigate.md;
    };
    ".config/opencode/agents/review.md" = {
      force = true;
      source = ./opencode/agents/review.md;
    };
    ".config/opencode/agents/scout.md" = {
      force = true;
      source = ./opencode/agents/scout.md;
    };
  };
}

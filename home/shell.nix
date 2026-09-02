{pkgs, ...}: {
  programs.git = {
    enable = true;
    settings = {
      user = {
        name = "Charles Deane";
        email = "30459123+cbdeane@users.noreply.github.com";
      };
      init.defaultBranch = "main";
      fetch.prune = true;
      diff.colorMoved = "default";
      push.autoSetupRemote = true;
    };
  };

  programs.delta = {
    enable = true;
    enableGitIntegration = true;
    options = {
      line-numbers = true;
      navigate = true;
    };
  };

  programs.btop = {
    enable = true;
    settings.color_theme = "dracula";
  };

  programs.direnv = {
    enable = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };

  programs.starship = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.tmux = {
    enable = true;
    terminal = "tmux-256color";
    baseIndex = 1;
    mouse = true;
    keyMode = "vi";
    prefix = "C-Space";

    plugins = with pkgs.tmuxPlugins; [
      yank
      resurrect
      continuum
      {
        plugin = dracula;
        extraConfig = ''
          set -g @dracula-refresh-rate 1
          set -g @dracula-plugins 'git ssh-session'
          set -g @dracula-show-empty-plugins false

          set -g @dracula-show-powerline true
          set -g @dracula-transparent-powerline-bg true
          set -g @dracula-show-left-sep ""
          set -g @dracula-show-right-sep ""
          set -g @dracula-inverse-divider ""
          set -g @dracula-show-left-icon ""

          set -g @dracula-git-show-current-symbol "󰗠"
          set -g @dracula-git-show-diff-symbol ""
          set -g @dracula-git-show-repo-name true

          set -g @dracula-show-ssh-only-when-connected true
        '';
      }
    ];

    extraConfig = ''
      set -g prefix2 C-b
      set -ag terminal-overrides ",*:RGB"
      set -g renumber-windows on
      set -g set-clipboard on

      unbind C-h
      bind r source-file ~/.config/tmux/tmux.conf \; display 'Reloaded!'

      bind h select-pane -L
      bind j select-pane -D
      bind k select-pane -U
      bind l select-pane -R

      bind H previous-window
      bind L next-window
    '';
  };

  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    defaultKeymap = "viins";

      shellAliases = {
        arturo = "ssh -i ~/.ssh/arturo root@arturo";
        ntfy = "ssh -i ~/.ssh/char0 ubuntu@ntfy";
        cat = "bat --paging=never --style=plain";
        ls = "eza --icons";
        ll = "eza -la --icons --git";
        la = "eza -la --icons";
        lt = "eza --tree --icons";
        du = "dust";
        df = "duf";
        top = "btop";
        htop = "btop";
      };

    history = {
      path = "$HOME/.histfile";
      size = 1000;
      save = 1000;
    };

    initContent = ''
      unsetopt beep
      setopt autocd

      cursor_mode() {
          cursor_block='\e[2 q'
          cursor_beam='\e[6 q'

          function zle-keymap-select {
              if [[ ''${KEYMAP} == vicmd ]] || [[ $1 = 'block' ]]; then
                  echo -ne $cursor_block
              elif [[ ''${KEYMAP} == main ]] ||
                   [[ ''${KEYMAP} == viins ]] ||
                   [[ ''${KEYMAP} = "" ]] ||
                   [[ $1 = 'beam' ]]; then
                  echo -ne $cursor_beam
              fi
          }

          zle-line-init() {
              echo -ne $cursor_beam
          }

          zle -N zle-keymap-select
          zle -N zle-line-init
      }

      cursor_mode

      nvd-summary() {
          nvd diff "$1" "$2" | while IFS= read -r line; do
              case "$line" in
                  "<<< "*|">>> "*|"Closure size:"*|"") ;;
                  *) printf '%s\n' "$line" ;;
              esac
          done
      }

      nvd-last() {
          local generations previous current
          generations=(''${(f)"$(nix-env --profile /nix/var/nix/profiles/system --list-generations | awk '{ print $1 }')"})

          if [ "''${#generations[@]}" -lt 2 ]; then
              printf 'Not enough system generations to diff.\n' >&2
              return 1
          fi

          previous="''${generations[-2]}"
          current="''${generations[-1]}"
          nvd diff "/nix/var/nix/profiles/system-$previous-link" "/nix/var/nix/profiles/system-$current-link"
      }

      nrb() {
          local system
          system="$(nix build path:/home/char0/nixconfig#nixosConfigurations.nixos.config.system.build.toplevel --no-link --print-out-paths)" || return
          nvd diff /run/current-system "$system"
      }

      nrs() {
          local before
          before="$(readlink -f /run/current-system)" || return

          sudo nixos-rebuild switch --flake /home/char0/nixconfig#nixos || return
          nvd-summary "$before" /run/current-system
      }

      nru() {
          local before
          before="$(readlink -f /run/current-system)" || return

          nix flake update --flake /home/char0/nixconfig || return
          sudo nixos-rebuild switch --flake /home/char0/nixconfig#nixos || return
          nvd-summary "$before" /run/current-system
      }

      export TERM=xterm-ghostty
      ssh() {
          TERM=xterm-256color command ssh "$@"
      }

      case "$TERM" in xterm-color|*-256color|xterm-ghostty) color_prompt=yes;; esac

      export GPG_TTY=$(tty)
    '';
  };
}

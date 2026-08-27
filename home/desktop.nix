{
  config,
  inputs,
  lib,
  pkgs,
  ...
}: let
  agsPackages = inputs.ags.packages.${pkgs.stdenv.hostPlatform.system};
  appleMusic = pkgs.writeShellApplication {
    name = "apple-music";
    runtimeInputs = [pkgs.ungoogled-chromium];
    text = ''
      exec chromium \
        --user-data-dir="''${XDG_DATA_HOME:-$HOME/.local/share}/apple-music-chromium" \
        --app=https://music.apple.com \
        --class=AppleMusic \
        "$@"
    '';
  };
  appleMusicDesktop = pkgs.makeDesktopItem {
    name = "apple-music";
    desktopName = "Apple Music";
    comment = "Listen to Apple Music";
    exec = "apple-music";
    terminal = false;
    categories = ["Audio" "Music" "Player"];
    icon = "multimedia-player";
  };
  usbNotify = pkgs.writeShellScript "udiskie-usb-notify" ''
    event="$1"
    label="''${2:-''${3:-USB drive}}"
    state_dir="''${XDG_RUNTIME_DIR:-/tmp}/udiskie-usb-notify"
    added_stamp="$state_dir/device-added"

    case "$event" in
      device_added)
        ${pkgs.coreutils}/bin/mkdir -p "$state_dir"
        now="$(${pkgs.coreutils}/bin/date +%s)"
        last="$(${pkgs.coreutils}/bin/test -f "$added_stamp" && ${pkgs.coreutils}/bin/cat "$added_stamp" || ${pkgs.coreutils}/bin/printf 0)"

        if [ "$((now - last))" -lt 3 ]; then
          exit 0
        fi

        ${pkgs.coreutils}/bin/printf '%s' "$now" > "$added_stamp"

        ${pkgs.libnotify}/bin/notify-send \
          -a udiskie \
          -i drive-removable-media \
          "USB device added" \
          "$label detected"
        ;;

      device_unmounted)
        ${pkgs.libnotify}/bin/notify-send \
          -a udiskie \
          -i media-eject \
          "USB safe to remove" \
          "$label can be removed safely"
        ;;
    esac
  '';
in {
  xdg.enable = true;

  home.packages = [
    pkgs.libnotify
    appleMusic
    appleMusicDesktop
    (pkgs.writeShellApplication {
      name = "walker-open";
      runtimeInputs = [
        config.programs.walker.package
        pkgs.netcat-openbsd
      ];
      text = ''
        socket="/run/user/$(id -u)/walker/walker.sock"

        if [ -S "$socket" ]; then
          exec nc -U "$socket"
        fi

        exec walker
      '';
    })
    (pkgs.writeShellApplication {
      name = "wallpaper";
      runtimeInputs = [
        config.programs.ags.package
        pkgs.awww
        pkgs.procps
      ];
      text = ''
          if ! pgrep -x awww-daemon >/dev/null; then
            awww-daemon >/tmp/awww-daemon.log 2>&1 &
          fi

        exec ags toggle wallpaper-panel
      '';
    })
  ];

  gtk = {
    enable = true;

    theme = {
      name = "Dracula";
      package = pkgs.dracula-theme;
    };

    iconTheme = {
      name = "Dracula";
      package = pkgs.dracula-icon-theme;
    };

    gtk3.extraConfig = {
      gtk-application-prefer-dark-theme = true;
    };

    gtk4.extraConfig = {
      gtk-application-prefer-dark-theme = true;
    };
  };

  dconf.settings."org/gnome/desktop/interface" = {
    color-scheme = "prefer-dark";
  };

  dconf.settings."org/nemo/preferences" = {
    show-location-entry = true;
    show-full-path-titles = true;
    sort-favorites-first = false;
  };

  dconf.settings."org/nemo/window-state" = {
    bookmarks-expanded = false;
  };

  dconf.settings."org/nemo/preferences/menu-config" = {
    selection-menu-favorite = false;
  };

  xdg.mimeApps = {
    enable = true;

    defaultApplications = {
      "inode/directory" = ["nemo.desktop"];
      "application/x-gnome-saved-search" = ["nemo.desktop"];
    };
  };

  services.udiskie = {
    enable = true;
    tray = "never";
    notify = false;
    settings.program_options = {
      event_hook = [
        "${usbNotify}"
        "{event}"
        "{ui_device_label}"
        "{device_file}"
      ];
    };
  };

  xdg.userDirs = {
    enable = true;

    desktop = "$HOME";
    download = "$HOME/downloads";
    pictures = "$HOME/pictures";

    documents = "$HOME/documents";
    music = "$HOME";
    publicShare = "$HOME/share";
    templates = "$HOME";
    videos = "$HOME";
  };

  xdg.desktopEntries.wallpaper = {
    name = "Wallpaper";
    comment = "Change wallpaper";
    exec = "wallpaper";
    icon = "preferences-desktop-wallpaper";
    terminal = false;
    categories = ["Settings" "Utility"];
  };

  programs.walker = {
    enable = true;
    runAsService = true;

    config = {
      theme = "dracula";

      providers.default = [
        "desktopapplications"
        "calc"
        "websearch"
      ];
    };

    themes.dracula.style = ''
      @define-color window_bg_color #282a36;
      @define-color accent_bg_color #bd93f9;
      @define-color theme_fg_color #f8f8f2;
      @define-color muted_fg_color #6272a4;
      @define-color selection_bg_color #44475a;
      @define-color error_bg_color #ff5555;
      @define-color error_fg_color #282a36;

      * {
        all: unset;
        font-family: Hack;
      }

      popover {
        background: @window_bg_color;
        border: 1px solid alpha(@accent_bg_color, 0.65);
        border-radius: 16px;
        padding: 8px;
      }

      .normal-icons {
        -gtk-icon-size: 16px;
      }

      .large-icons {
        -gtk-icon-size: 32px;
      }

      scrollbar {
        opacity: 0;
      }

      .box-wrapper {
        background: @window_bg_color;
        border: 1px solid alpha(@accent_bg_color, 0.75);
        border-radius: 18px;
        padding: 14px;
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
      }

      .preview-box,
      .elephant-hint,
      .placeholder,
      .list,
      .preview {
        color: @theme_fg_color;
      }

      .input {
        caret-color: @accent_bg_color;
        background: @selection_bg_color;
        color: @theme_fg_color;
        border-radius: 10px;
        padding: 10px 12px;
      }

      .input selection {
        background: alpha(@accent_bg_color, 0.45);
      }

      .input placeholder,
      .item-subtext,
      .keybind-button,
      .keybind-bind {
        color: @muted_fg_color;
      }

      .item-box {
        border-radius: 10px;
        padding: 9px 10px;
      }

      child:selected .item-box,
      row:selected .item-box {
        background: @selection_bg_color;
      }

      .item-quick-activation {
        background: @selection_bg_color;
        border-radius: 6px;
        padding: 8px;
        color: @accent_bg_color;
      }

      .item-image-text {
        font-size: 28px;
      }

      .item-subtext {
        font-size: 12px;
      }

      .providerlist .item-subtext {
        font-size: unset;
        opacity: 0.75;
      }

      .keybinds {
        padding-top: 10px;
        border-top: 1px solid alpha(@accent_bg_color, 0.35);
        font-size: 12px;
        color: @theme_fg_color;
      }

      .keybind-button {
        opacity: 0.55;
      }

      .keybind-button:hover {
        opacity: 0.75;
      }

      .keybind-bind {
        text-transform: lowercase;
        opacity: 0.45;
      }

      .keybind-label {
        padding: 2px 5px;
        border-radius: 5px;
        border: 1px solid alpha(@accent_bg_color, 0.7);
      }

      .error {
        padding: 10px;
        background: @error_bg_color;
        color: @error_fg_color;
      }

      .calc .item-text {
        font-size: 24px;
      }

      .symbols .item-image {
        font-size: 24px;
      }

      .preview {
        border: 1px solid alpha(@accent_bg_color, 0.35);
        border-radius: 10px;
      }

      .preview .large-icons {
        -gtk-icon-size: 64px;
      }

      :not(.calc).current {
        font-style: italic;
      }
    '';

    elephant = {
      providers = [
        "bluetooth"
        "calc"
        "clipboard"
        "desktopapplications"
        "files"
        "providerlist"
        "runner"
        "symbols"
        "websearch"
      ];
    };
  };

  programs.ags = {
    enable = true;
    configDir = ./ags;
    extraPackages = [
      agsPackages.bluetooth
      agsPackages.mpris
      agsPackages.network
    ];
    systemd.enable = true;
  };

  home.activation.restartLaunchers = lib.hm.dag.entryAfter ["writeBoundary"] ''
    XDG_RUNTIME_DIR="/run/user/$(${pkgs.coreutils}/bin/id -u)" \
      $DRY_RUN_CMD ${pkgs.systemd}/bin/systemctl --user restart elephant.service walker.service || true
  '';
}

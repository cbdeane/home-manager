{ pkgs, ... }:

let
  screensaverBin = pkgs.writeShellApplication {
    name = "ascii-screensaver-bin";
    runtimeInputs = [ pkgs.coreutils ];
    text = ''
      for candidate in \
        "$HOME/dev/screensavers/result/bin/ascii-screensaver" \
        "$HOME/dev/screensavers/target/release/ascii-screensaver" \
        "$HOME/dev/screensavers/target/debug/ascii-screensaver"; do
        if [ -x "$candidate" ]; then
          printf '%s\n' "$candidate"
          exit 0
        fi
      done

      printf 'ascii-screensaver binary not found; build ~/dev/screensavers first\n' >&2
      exit 1
    '';
  };

  startScreensaver = pkgs.writeShellApplication {
    name = "ascii-screensaver-start";
    runtimeInputs = [ pkgs.coreutils pkgs.ghostty pkgs.hyprland pkgs.jq ];
    text = ''
      runtime_dir="''${XDG_RUNTIME_DIR:-/tmp}"
      pidfile="$runtime_dir/ascii-screensaver.pid"
      ignore_resume="$runtime_dir/ascii-screensaver.ignore-resume"
      lock_dir="$runtime_dir/ascii-screensaver.lock"
      logfile="$runtime_dir/ascii-screensaver.log"

      if ! mkdir "$lock_dir" 2>/dev/null; then
        exit 0
      fi
      trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT INT TERM

      if [ -f "$pidfile" ]; then
        pid="$(cat "$pidfile" 2>/dev/null || true)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
          exit 0
        fi
      fi

      screensaver="$(${screensaverBin}/bin/ascii-screensaver-bin)"

      if hyprctl clients -j 2>/dev/null | jq -e '
        any(.[];
          (.class != "ascii-screensaver") and
          (.title != "ascii-screensaver") and
          (.mapped == true) and
          (.hidden == false) and
          (((.fullscreen // 0) != 0) or ((.fullscreenClient // 0) != 0))
        )
      ' >/dev/null; then
        exit 0
      fi

      ghostty \
        --gtk-single-instance=false \
        --title=ascii-screensaver \
        --class=ascii-screensaver \
        --confirm-close-surface=false \
        --window-decoration=false \
        --background-opacity=1 \
        --font-size=14 \
        -e "$screensaver" run \
        >"$logfile" 2>&1 &

      printf '%s\n' "$!" > "$pidfile"
      printf '%s\n' "$!" > "$ignore_resume"
    '';
  };

  stopScreensaver = pkgs.writeShellApplication {
    name = "ascii-screensaver-stop";
    runtimeInputs = [ pkgs.coreutils pkgs.hyprland ];
    text = ''
      runtime_dir="''${XDG_RUNTIME_DIR:-/tmp}"
      pidfile="$runtime_dir/ascii-screensaver.pid"
      ignore_resume="$runtime_dir/ascii-screensaver.ignore-resume"

      close_windows() {
        hyprctl dispatch closewindow 'title:^ascii-screensaver$' >/dev/null 2>&1 || true
        hyprctl dispatch closewindow 'class:^ascii-screensaver$' >/dev/null 2>&1 || true
      }

      if [ ! -f "$pidfile" ]; then
        rm -f "$ignore_resume"
        close_windows
        exit 0
      fi

      # Hyprland's idle notifier reports a resume when Ghostty maps/focuses the
      # screensaver window. Ignore that first synthetic resume only; subsequent
      # resumes are real activity and should close immediately.
      if [ -f "$ignore_resume" ]; then
        rm -f "$ignore_resume"
        exit 0
      fi

      pid="$(cat "$pidfile" 2>/dev/null || true)"
      rm -f "$pidfile"
      rm -f "$ignore_resume"

      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
      fi

      close_windows
    '';
  };

  hypridleScreensaver = pkgs.writeShellApplication {
    name = "ascii-screensaver-hypridle";
    runtimeInputs = [ pkgs.coreutils pkgs.hypridle pkgs.jq ];
    text = ''
      runtime_dir="''${XDG_RUNTIME_DIR:-/tmp}"
      config="$runtime_dir/ascii-screensaver-hypridle.conf"
      idle_seconds=300

      if screensaver="$(${screensaverBin}/bin/ascii-screensaver-bin 2>/dev/null)"; then
        idle_seconds="$($screensaver current --json 2>/dev/null | jq -r '.idle_seconds // 300')"
      fi

      case "$idle_seconds" in
        ""|*[!0-9]*) idle_seconds=300 ;;
      esac

      # hypridle 0.1.7+ requires a main config to exist even when -c is used;
      # ensure a minimal one exists to avoid "Could not find config in HOME..."
      mkdir -p "$HOME/.config/hypr"
      if [ ! -f "$HOME/.config/hypr/hypridle.conf" ]; then
        printf 'general {\n}\n' > "$HOME/.config/hypr/hypridle.conf"
      fi

      if [ "$idle_seconds" -le 0 ]; then
        exec sleep infinity
      else
        cat > "$config" <<EOF
general {
}

listener {
    timeout = $idle_seconds
    on-timeout = ${startScreensaver}/bin/ascii-screensaver-start
    on-resume = ${stopScreensaver}/bin/ascii-screensaver-stop
}
EOF
      fi

      exec hypridle -c "$config"
    '';
  };
in

{
  home.packages = [
    screensaverBin
    startScreensaver
    stopScreensaver
  ];

  systemd.user.services.ascii-screensaver-hypridle = {
    Unit = {
      Description = "ASCII screensaver idle launcher";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
    };

    Service = {
      ExecStart = "${hypridleScreensaver}/bin/ascii-screensaver-hypridle";
      Restart = "on-failure";
      RestartSec = 5;
    };

    Install.WantedBy = [ "graphical-session.target" ];
  };
}

{ pkgs, ... }:

let
  callHomeReminder = pkgs.writeShellApplication {
    name = "call-home-reminder";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.libnotify
      pkgs.pipewire
    ];
    text = ''
      sound="${pkgs.sound-theme-freedesktop}/share/sounds/freedesktop/stereo/phone-incoming-call.oga"

      notify-send \
        --wait \
        --urgency=critical \
        --app-name=reminder \
        --icon="${pkgs.dracula-icon-theme}/share/icons/Dracula/scalable/devices/phone.svg" \
        "CALL HOME" &
      notification_pid="$!"

      while kill -0 "$notification_pid" 2>/dev/null; do
        pw-play "$sound" &
        sound_pid="$!"

        while kill -0 "$notification_pid" 2>/dev/null && kill -0 "$sound_pid" 2>/dev/null; do
          sleep 0.2
        done

        if kill -0 "$sound_pid" 2>/dev/null; then
          kill "$sound_pid" 2>/dev/null || true
          wait "$sound_pid" 2>/dev/null || true
        fi

        sleep 2
      done

      wait "$notification_pid" 2>/dev/null || true
    '';
  };
in

{
  home.packages = [ callHomeReminder ];

  systemd.user.services.call-home-reminder = {
    Unit = {
      Description = "Call home reminder";
    };

    Service = {
      Type = "oneshot";
      ExecStart = "${callHomeReminder}/bin/call-home-reminder";
    };
  };

  systemd.user.timers.call-home-reminder = {
    Unit = {
      Description = "Call home reminder timer";
    };

    Timer = {
      OnCalendar = "Sun,Mon..Fri *-*-* 13:15:00";
      Unit = "call-home-reminder.service";
    };

    Install = {
      WantedBy = [ "timers.target" ];
    };
  };
}

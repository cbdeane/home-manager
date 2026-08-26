{ pkgs, lib, ... }:

let
  l14MonitorProfile = pkgs.writeShellApplication {
    name = "l14-monitor-profile";
    runtimeInputs = [
      pkgs.coreutils
      pkgs.hyprland
      pkgs.jq
    ];
    text = ''
      set -eu

      laptop_output="eDP-1"
      external_outputs="HDMI-A-1 DP-1 DP-2"
      runtime_dir="''${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
      lock_dir="$runtime_dir/l14-monitor-profile.lock"

      log() {
        printf '%s\n' "$*"
      }

      monitors_json() {
        hyprctl monitors all -j
      }

      drm_status() {
        output="$1"

        for status_file in /sys/class/drm/card*-"$output"/status; do
          [ -e "$status_file" ] || continue
          tr -d '\n' < "$status_file"
          return
        done

        printf 'missing'
      }

      drm_connected() {
        [ "$(drm_status "$1")" = connected ]
      }

      connected_external_output() {
        for output in $external_outputs; do
          if drm_connected "$output"; then
            printf '%s\n' "$output"
            return
          fi
        done
      }

      desired_output() {
        output="$(connected_external_output)"

        if [ -n "$output" ]; then
          printf '%s\n' "$output"
        else
          printf '%s\n' "$laptop_output"
        fi
      }

      output_active() {
        output="$1"
        monitors_json | jq -e --arg output "$output" '
          .[]
          | select(.name == $output)
          | select(.disabled == false)
        ' >/dev/null
      }

      hypr_eval() {
        hyprctl eval "$1" >/dev/null
      }

      focus_output() {
        output="$1"

        if output_active "$output"; then
          hypr_eval "hl.dispatch(hl.dsp.focus({ monitor = \"$output\" }))"
          hypr_eval 'hl.dispatch(hl.dsp.focus({ workspace = 1 }))'
        else
          log "not focusing inactive output $output"
        fi
      }

      disable_other_outputs() {
        active_output="$1"

        monitors_json | jq -r --arg active_output "$active_output" '
          .[]
          | select(.name != $active_output)
          | select(.disabled == false)
          | .name
        ' | while IFS= read -r output; do
          [ -n "$output" ] || continue
          hypr_eval "hl.monitor({ output = \"$output\", disabled = true })"
        done
      }

      apply_external() {
        output="$1"

        if output_active "$output" && ! output_active "$laptop_output"; then
          log "already external on $output"
          return
        fi

        log "applying external on $output"
        hypr_eval "hl.monitor({ output = \"$output\", mode = \"preferred\", position = \"0x0\", scale = 1 })"
        sleep 1

        if output_active "$output"; then
          hypr_eval "hl.monitor({ output = \"$laptop_output\", disabled = true })"
          focus_output "$output"
        else
          log "external did not become active; keeping laptop enabled"
        fi
      }

      apply_laptop() {
        if output_active "$laptop_output" && [ -z "$(connected_external_output)" ]; then
          log "already laptop"
          return
        fi

        log "applying laptop"
        hypr_eval "hl.monitor({ output = \"$laptop_output\", mode = \"preferred\", position = \"0x0\", scale = 1 })"
        sleep 0.5

        if output_active "$laptop_output"; then
          focus_output "$laptop_output"
          disable_other_outputs "$laptop_output"
        else
          log "laptop output did not become active"
        fi
      }

      reconcile_once() {
        if ! mkdir "$lock_dir" 2>/dev/null; then
          log "previous reconcile still running"
          return
        fi

        trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT INT TERM

        desired="$(desired_output)"
        sleep 1

        if [ "$desired" != "$(desired_output)" ]; then
          log "connector state changed during debounce"
        elif [ "$desired" = "$laptop_output" ]; then
          apply_laptop
        else
          apply_external "$desired"
        fi

        rmdir "$lock_dir" 2>/dev/null || true
        trap - EXIT INT TERM
      }

      while true; do
        reconcile_once || true
        sleep 2
      done
    '';
  };
in

{
  systemd.user.services.l14-monitor-profile = {
    Unit = {
      Description = "L14 monitor profile reconciler";
      After = [ "graphical-session.target" ];
      PartOf = [ "graphical-session.target" ];
    };

    Service = {
      ExecStart = "${l14MonitorProfile}/bin/l14-monitor-profile";
      Restart = "always";
      RestartSec = 1;
    };

    Install.WantedBy = [ "graphical-session.target" ];
  };

  home.activation.removeLegacyMonitorProfile = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    $DRY_RUN_CMD systemctl --user disable --now monitor-profile.service >/dev/null 2>&1 || true
    $DRY_RUN_CMD rm -f \
      "$HOME/.config/systemd/user/monitor-profile.service" \
      "$HOME/.config/systemd/user/graphical-session.target.wants/monitor-profile.service"
    $DRY_RUN_CMD systemctl --user daemon-reload >/dev/null 2>&1 || true
  '';
}

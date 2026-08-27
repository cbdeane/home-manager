{ inputs, ... }:

{
  imports = [
    inputs.ags.homeManagerModules.default
    inputs.walker.homeManagerModules.default
    ./packages.nix
    ./shell.nix
    ./neovim.nix
    ./ghostty.nix
    ./hyprland.nix
    ./machines/l14/monitors.nix
    ./mako.nix
    ./reminders.nix
    ./screensaver.nix
    ./desktop.nix
  ];

  home.username = "char0";
  home.homeDirectory = "/home/char0";
  home.stateVersion = "26.05";

  programs.home-manager.enable = true;
}

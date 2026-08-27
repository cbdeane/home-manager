{pkgs, ...}: {
  home.packages = with pkgs; [
    # Network utilities
    nmap
    overskride

    # Office
    libreoffice

    # Multimedia
    gimp
    rhythmbox

    # Terminal utilities
    ripgrep
    htop
    btop
    bat
    jq
    eza
    dust
    duf
    nvd
    tree
    fastfetch

    # Image editing
    imagemagick

    # File managers
    nemo
    udiskie

    # Developer utils
    distrobox
    postman

    # Desktop
    pavucontrol
    brightnessctl
    playerctl
    awww
    breeze-hacked-cursor-theme
    kdePackages.breeze

    # Chat
    vesktop
    element-desktop
    signal-desktop
    weechat
    whatsapp-electron
    obs-studio

    # Screenshot stack
    wayfreeze
    slurp
    grim
    wl-clipboard

    # Editors
    vim

    # Browsers
    firefox
    ungoogled-chromium

    # Terminal
    ghostty

    # Languages
    go
    rustup
    nodejs
    bun
    python3
    uv
    gcc
    llvmPackages.clang-unwrapped
    zig

    # Build tooling
    cmake
    pkg-config

    # Shell build tooling
    shfmt
  ];
}

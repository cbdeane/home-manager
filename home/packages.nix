{pkgs, ...}: {
  home.packages = with pkgs; [
    # Network utilities
    nmap
    overskride

    # Office
    libreoffice
    drawio

    # Multimedia
    gimp
    rhythmbox

    # Terminal utilities
    ripgrep
    htop
    bat
    jq
    eza
    dust
    duf
    nvd
    pwgen
    tree
    fastfetch

    # Image editing
    imagemagick

    # Image viewers
    loupe

    # File managers
    file-roller
    udiskie

    # Developer utils
    distrobox
    postman

    # Kubernetes and CI/CD
    kubectl
    talosctl
    k9s
    opentofu
    fluxcd
    glab
    kubeconform
    gitleaks

    # Secrets management and future enrollment tooling
    sops
    age
    ssh-to-age

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

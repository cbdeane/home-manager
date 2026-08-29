{
  lib,
  stdenvNoCC,
  buildNpmPackage,
  fetchFromGitHub,
  fetchurl,
  makeWrapper,
  nodejs,
}:
let
  kubernetes-mcp-server = fetchurl {
    url = "https://github.com/containers/kubernetes-mcp-server/releases/download/v0.0.66/kubernetes-mcp-server-linux-amd64";
    hash = "sha256-aSp7KDqWFAMR/UbxO4NzZXsum/5mCja7ZDToxC2Jnbw=";
  };
in {
  kubernetes-mcp-server = stdenvNoCC.mkDerivation {
    pname = "kubernetes-mcp-server";
    version = "0.0.66";

    src = kubernetes-mcp-server;
    dontUnpack = true;

    installPhase = ''
      install -Dm755 "$src" "$out/bin/kubernetes-mcp-server"
    '';

    meta = {
      description = "Kubernetes Model Context Protocol server";
      homepage = "https://github.com/containers/kubernetes-mcp-server";
      platforms = [ "x86_64-linux" ];
    };
  };

  mcp-proxmox = buildNpmPackage {
    pname = "mcp-proxmox";
    version = "unstable-2026-07-08";

    src = fetchFromGitHub {
      owner = "gilby125";
      repo = "mcp-proxmox";
      rev = "6186c715b5ff393adc9fdf597a791c35bc2f90c7";
      hash = "sha256-23JHHHhszwDXehA20Kuz732fQwzCn/equlWEgyD2m/A=";
    };

    npmDepsHash = "sha256-KziR5cqAB2wo21jckLgVegi8vKeBLw6OXdjBzWT0+0g=";
    dontNpmBuild = true;

    postPatch = ''
      cp ${./mcp-proxmox-package-lock.json} package-lock.json
    '';

    nativeBuildInputs = [ makeWrapper ];

    installPhase = ''
      install -Dm755 index.js "$out/lib/mcp-proxmox/index.js"
      cp -r node_modules "$out/lib/mcp-proxmox/node_modules"
      makeWrapper ${nodejs}/bin/node "$out/bin/mcp-proxmox" \
        --add-flags "$out/lib/mcp-proxmox/index.js" \
        --prefix NODE_PATH : "$out/lib/mcp-proxmox/node_modules"
    '';

    meta = {
      description = "Proxmox Model Context Protocol server";
      homepage = "https://github.com/gilby125/mcp-proxmox";
      license = lib.licenses.mit;
      platforms = lib.platforms.linux;
    };
  };
}

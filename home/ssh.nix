{ config, ... }:

{
  sops.secrets = {
    sshArturo = {
      sopsFile = ../encrypted/ssh-arturo.enc;
      format = "binary";
      mode = "0600";
    };
    sshBeelink = {
      sopsFile = ../encrypted/ssh-beelink.enc;
      format = "binary";
      mode = "0600";
    };
    sshNtfy = {
      sopsFile = ../encrypted/ssh-ntfy.enc;
      format = "binary";
      mode = "0600";
    };
    sshGitHub = {
      sopsFile = ../encrypted/ssh-github.enc;
      format = "binary";
      mode = "0600";
    };
    sshGitLab = {
      sopsFile = ../encrypted/ssh-gitlab.enc;
      format = "binary";
      mode = "0600";
    };
    sshKnownHosts = {
      sopsFile = ../encrypted/ssh-known-hosts.enc;
      format = "binary";
      mode = "0600";
    };
  };

  programs.ssh = {
    enable = true;
    enableDefaultConfig = false;
    settings = {
      "*" = {
        AddKeysToAgent = "no";
        Compression = false;
        ForwardAgent = false;
        HashKnownHosts = false;
        ServerAliveCountMax = 3;
        ServerAliveInterval = 0;
        UserKnownHostsFile = config.sops.secrets.sshKnownHosts.path;
      };
      "github.com" = {
        User = "git";
        IdentityFile = config.sops.secrets.sshGitHub.path;
        IdentitiesOnly = true;
      };
      "gitlab.com" = {
        User = "git";
        IdentityFile = config.sops.secrets.sshGitLab.path;
        IdentitiesOnly = true;
      };
      arturo = {
        HostName = "arturo";
        User = "root";
        IdentityFile = config.sops.secrets.sshArturo.path;
        IdentitiesOnly = true;
      };
      beelink = {
        HostName = "beelink";
        User = "root";
        IdentityFile = config.sops.secrets.sshBeelink.path;
        IdentitiesOnly = true;
      };
      ntfy = {
        HostName = "ntfy";
        User = "ubuntu";
        IdentityFile = config.sops.secrets.sshNtfy.path;
        IdentitiesOnly = true;
      };
    };
  };
}

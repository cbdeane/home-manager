{ config, inputs, pkgs, ... }:
let
  mcpPackages = pkgs.callPackage ../pkgs/mcp.nix { };
  memoryGitlab = pkgs.writeShellApplication {
    name = "opencode-memory-gitlab";
    runtimeInputs = [ pkgs.glab pkgs.jq ];
    text = ''
      operation="''${1:-}"
      if [ -z "$operation" ]; then
        echo "usage: opencode-memory-gitlab <file-create|file-update|issue-create|issue-note> ..." >&2
        exit 2
      fi
      shift

      validate_project() {
        if [[ ! "$1" =~ ^luhono/[A-Za-z0-9][A-Za-z0-9_.-]*(/[A-Za-z0-9][A-Za-z0-9_.-]*)*$ || "$1" == *"/.."* ]]; then
          echo "issue project must be a canonical path in the luhono namespace" >&2
          exit 2
        fi
      }

      case "$operation" in
        file-create)
          if [ "$#" -ne 3 ]; then
            echo "usage: opencode-memory-gitlab file-create <path> <message> <content>" >&2
            exit 2
          fi
          path="$1"
          if [[ -z "$path" || "$path" == /* || "$path" == ".." || "$path" == ../* || "$path" == */../* || "$path" == */.. || "$path" == *$'\n'* || "$path" == *$'\r'* ]]; then
            echo "memory path must be a safe relative path" >&2
            exit 2
          fi
          encoded_path="$(jq -nr --arg path "$path" '$path | @uri')"
          glab api --hostname gitlab.com --method POST "projects/luhono%2Fengineering-memory/repository/files/$encoded_path" \
            --raw-field "branch=main" \
            --raw-field "commit_message=$2" \
            --raw-field "content=$3"
          ;;
        file-update)
          if [ "$#" -ne 4 ]; then
            echo "usage: opencode-memory-gitlab file-update <path> <last-commit-id> <message> <content>" >&2
            exit 2
          fi
          path="$1"
          if [[ -z "$path" || "$path" == /* || "$path" == ".." || "$path" == ../* || "$path" == */../* || "$path" == */.. || "$path" == *$'\n'* || "$path" == *$'\r'* ]]; then
            echo "memory path must be a safe relative path" >&2
            exit 2
          fi
          encoded_path="$(jq -nr --arg path "$path" '$path | @uri')"
          glab api --hostname gitlab.com --method PUT "projects/luhono%2Fengineering-memory/repository/files/$encoded_path" \
            --raw-field "branch=main" \
            --raw-field "last_commit_id=$2" \
            --raw-field "commit_message=$3" \
            --raw-field "content=$4"
          ;;
        issue-create)
          if [ "$#" -ne 3 ]; then
            echo "usage: opencode-memory-gitlab issue-create <project> <title> <description>" >&2
            exit 2
          fi
          validate_project "$1"
          glab issue create --repo "https://gitlab.com/$1" --title "$2" --description "$3" --yes
          ;;
        issue-note)
          if [ "$#" -ne 3 ]; then
            echo "usage: opencode-memory-gitlab issue-note <project> <issue-id> <message>" >&2
            exit 2
          fi
          validate_project "$1"
          if [[ ! "$2" =~ ^[0-9]+$ ]]; then
            echo "issue ID must be numeric" >&2
            exit 2
          fi
          glab issue note "$2" --repo "https://gitlab.com/$1" --message "$3"
          ;;
        *)
          echo "unknown operation: $operation" >&2
          exit 2
          ;;
      esac
    '';
  };
  gitPushScript = ''
    if [ "$#" -ne 0 ]; then
      echo "usage: opencode-git-push" >&2
      exit 2
    fi

    branch="$(git symbolic-ref --quiet --short HEAD)" || {
      echo "refusing to push from a detached HEAD" >&2
      exit 1
    }
    git check-ref-format --branch "$branch" >/dev/null || {
      echo "current branch name is invalid" >&2
      exit 1
    }
    case "$branch" in
      main | master | production | prod | release | release/*)
        echo "refusing to push protected branch: $branch" >&2
        exit 1
        ;;
    esac

    mapfile -t push_urls < <(git remote get-url --all --push origin) || {
      echo "origin remote is required" >&2
      exit 1
    }
    if [ "''${#push_urls[@]}" -ne 1 ]; then
      echo "origin must have exactly one push URL" >&2
      exit 1
    fi
    origin="''${push_urls[0]}"
    case "$origin" in
      git@gitlab.com:luhono/* | https://gitlab.com/luhono/* | ssh://git@gitlab.com/luhono/*)
        project="''${origin#*gitlab.com[:/]luhono/}"
        project="''${project%.git}"
        ;;
      *)
        echo "origin push URL must be a GitLab.com luhono project" >&2
        exit 1
        ;;
    esac
    if [[ ! "$project" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*(/[A-Za-z0-9][A-Za-z0-9_.-]*)*$ || "$project" == *"/.."* ]]; then
      echo "origin push URL does not name a canonical luhono project" >&2
      exit 1
    fi

    project_id="$(jq -nr --arg project "luhono/$project" '$project | @uri')"
    protected_patterns="$(glab api --hostname gitlab.com --paginate "projects/$project_id/protected_branches?per_page=100" | jq -sr '.[][] | .name')"
    while IFS= read -r pattern; do
      # shellcheck disable=SC2053 # GitLab protected-branch names may be globs.
      if [ -n "$pattern" ] && [[ "$branch" == $pattern ]]; then
        echo "refusing to push GitLab-protected branch: $branch" >&2
        exit 1
      fi
    done <<<"$protected_patterns"

    exec git push origin "HEAD:$branch"
  '';
  gitPush = pkgs.writeShellApplication {
    name = "opencode-git-push";
    runtimeInputs = [ pkgs.git pkgs.glab pkgs.jq ];
    text = gitPushScript;
  };
  gitlabMergeScript = ''
      if [ "$#" -ne 4 ]; then
        echo "usage: opencode-gitlab-merge <luhono/project> <mr-iid> <expected-head-sha> <expected-target-branch>" >&2
        exit 2
      fi

      project="$1"
      iid="$2"
      expected_sha="$3"
      expected_target="$4"
      if [[ ! "$project" =~ ^luhono/[A-Za-z0-9][A-Za-z0-9_.-]*(/[A-Za-z0-9][A-Za-z0-9_.-]*)*$ || "$project" == *"/.."* ]]; then
        echo "project must be a canonical GitLab.com path in the luhono namespace" >&2
        exit 2
      fi
      if [[ ! "$iid" =~ ^[0-9]+$ || ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
        echo "MR IID must be numeric and expected head SHA must be a lowercase full SHA" >&2
        exit 2
      fi
      if [[ ! "$expected_target" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ || "$expected_target" == *".."* || "$expected_target" == *"//"* || "$expected_target" == */ || "$expected_target" == *. ]]; then
        echo "expected target branch is invalid" >&2
        exit 2
      fi

      protected_branch() {
        case "$1" in
          main | master | production | prod | release | release/*) return 0 ;;
          *) return 1 ;;
        esac
      }

      project_id="$(jq -nr --arg project "$project" '$project | @uri')"
      mr="$(glab api --hostname gitlab.com "projects/$project_id/merge_requests/$iid")"
      actual_sha="$(jq -er '.sha' <<<"$mr")"
      actual_target="$(jq -er '.target_branch' <<<"$mr")"
      source_branch="$(jq -er '.source_branch' <<<"$mr")"
      source_project_id="$(jq -er '.source_project_id' <<<"$mr")"
      target_project_id="$(jq -er '.target_project_id' <<<"$mr")"

      if [ "$actual_sha" != "$expected_sha" ] || [ "$actual_target" != "$expected_target" ]; then
        echo "MR head SHA or target branch changed since approval" >&2
        exit 1
      fi
      if [ "$(jq -er '.state' <<<"$mr")" != "opened" ] || [ "$(jq -r '.draft // .work_in_progress // false' <<<"$mr")" = "true" ]; then
        echo "MR is not an open, ready-for-review merge request" >&2
        exit 1
      fi
      if [ "$source_project_id" != "$target_project_id" ] || protected_branch "$source_branch"; then
        echo "refusing forked or protected-source merge request" >&2
        exit 1
      fi
      if [ "$(jq -r '.head_pipeline.status // empty' <<<"$mr")" != "success" ]; then
        echo "MR head pipeline is not successful" >&2
        exit 1
      fi
      if [ "$(jq -r '.detailed_merge_status // .merge_status // empty' <<<"$mr")" != "mergeable" ]; then
        echo "MR has an unresolved merge blocking state" >&2
        exit 1
      fi
      if [ "$(jq -r '.blocking_discussions_resolved // true' <<<"$mr")" != "true" ]; then
        echo "MR has unresolved blocking discussions" >&2
        exit 1
      fi
      unresolved_discussions="$(glab api --hostname gitlab.com --paginate "projects/$project_id/merge_requests/$iid/discussions?per_page=100" | jq -s '[.[][] | .notes[]? | select((.resolvable // false) and ((.resolved // false) | not))] | length')"
      if [ "$unresolved_discussions" -ne 0 ]; then
        echo "MR has unresolved resolvable discussions" >&2
        exit 1
      fi
      approval_state="$(glab api --hostname gitlab.com "projects/$project_id/merge_requests/$iid/approval_state")"
      if ! jq -e '(.rules | type == "array") and all(.rules[]; .approved == true)' <<<"$approval_state" >/dev/null; then
        echo "MR still requires GitLab approvals" >&2
        exit 1
      fi
      if [ "$(jq -r '.merge_when_pipeline_succeeds // false' <<<"$mr")" = "true" ] || [ "$(jq -r '.auto_merge_enabled // false' <<<"$mr")" = "true" ] || [ "$(jq -r '.merge_after // empty' <<<"$mr")" != "" ]; then
        echo "refusing auto-merge or delayed merge request" >&2
        exit 1
      fi

      exec glab api --hostname gitlab.com --method PUT "projects/$project_id/merge_requests/$iid/merge" --raw-field "sha=$expected_sha" --raw-field "merge_when_pipeline_succeeds=false"
  '';
  gitlabMerge = pkgs.writeShellApplication {
    name = "opencode-gitlab-merge";
    runtimeInputs = [ pkgs.glab pkgs.jq ];
    text = gitlabMergeScript;
  };
in {
  home.packages = [
    inputs.opencode.packages.${pkgs.stdenv.hostPlatform.system}.opencode
    mcpPackages.kubernetes-mcp-server
    mcpPackages.mcp-proxmox
    memoryGitlab
    gitPush
    gitlabMerge
  ];

  home.sessionVariables = {
    KUBECONFIG = config.sops.secrets.kubeconfig.path;
    TALOSCONFIG = config.sops.secrets.talosconfig.path;
  };

  sops = {
    age.keyFile = "${config.home.homeDirectory}/.config/sops/age/keys.txt";
    secrets = {
      kubeconfig = {
        sopsFile = ../encrypted/kubeconfig.enc;
        format = "binary";
        mode = "0600";
      };
      proxmox-token = {
        sopsFile = ../encrypted/proxmox-token.enc;
        format = "binary";
        mode = "0600";
      };
      talosconfig = {
        sopsFile = ../encrypted/talosconfig.enc;
        format = "binary";
        mode = "0600";
      };
    };
  };

  home.file = {
    ".config/opencode/opencode.jsonc" = {
      force = true;
      text = builtins.toJSON {
        "$schema" = "https://opencode.ai/config.json";
        autoupdate = false;
        default_agent = "build";
        small_model = "openai/gpt-5.6-luna";
        enabled_providers = [ "openai" ];
        plugin = [ "@mohak34/opencode-notifier@0.2.8" ];
        permission.bash = {
          "*" = "allow";
          "*git push*" = "deny";
          "*git* push*" = "deny";
          "*git reset*" = "deny";
          "*git* reset*" = "deny";
          "*git rebase*" = "deny";
          "*git* rebase*" = "deny";
          "*git commit*--amend*" = "deny";
          "*git* commit*--amend*" = "deny";
          "*git commit*--no-verify*" = "deny";
          "*git* commit*--no-verify*" = "deny";
          "*git commit -n*" = "deny";
          "*git merge*--no-verify*" = "deny";
          "*git *--no-verify*" = "deny";
          "*core.hooksPath*" = "deny";
          "*git branch -[dD]*" = "deny";
          "*git branch --delete*" = "deny";
          "*git branch --force*" = "deny";
          "*git tag -d*" = "deny";
          "*git tag --delete*" = "deny";
          "*git remote remove*" = "deny";
          "*git remote set-url*" = "deny";
          "*git* remote add*" = "deny";
          "*git* remote rename*" = "deny";
          "*git* remote set-branches*" = "deny";
          "*git* remote set-head*" = "deny";
          "*git* config*remote.*" = "deny";
          "*git* config*url.*" = "deny";
          "*git update-ref*" = "deny";
          "*git filter-*" = "deny";
          "*git reflog expire*" = "deny";
          "*git gc *--prune*" = "deny";
          "*git clean*" = "deny";
          "*git stash clear*" = "deny";
          "*git stash drop*" = "deny";
          "bash -c *" = "deny";
          "sh -c *" = "deny";
          "zsh -c *" = "deny";
          "eval *" = "deny";
          "*glab* mr merge*" = "deny";
          "*glab* api*" = "deny";
          "opencode-git-push" = "allow";
          "*opencode-gitlab-merge*" = "ask";
          "opencode-gitlab-merge *" = "ask";
        };
        agent = {
          build = {
            model = "openai/gpt-5.6-sol";
            permission.task = {
              "*" = "deny";
              engineer = "allow";
              investigate = "allow";
              memory = "allow";
              review = "allow";
              scout = "allow";
            };
            tools."proxmox_*" = true;
            permission."proxmox_*" = "ask";
          };
          engineer = {
            tools."proxmox_*" = true;
            permission."proxmox_*" = "ask";
          };
        };
        mcp = {
          kubernetes = {
            type = "local";
            command = [ "${mcpPackages.kubernetes-mcp-server}/bin/kubernetes-mcp-server" "--read-only" "--kubeconfig" config.sops.secrets.kubeconfig.path ];
            enabled = true;
          };
          proxmox = {
            type = "local";
            command = [ "${mcpPackages.mcp-proxmox}/bin/mcp-proxmox" ];
            enabled = true;
            environment = {
              PROXMOX_HOST = "proxmox0002.pacific.luhono.com";
              PROXMOX_PORT = "8006";
              PROXMOX_USER = "root@pam";
              PROXMOX_TOKEN_NAME = "tofu";
              PROXMOX_TOKEN_VALUE = "{file:${config.sops.secrets.proxmox-token.path}}";
              PROXMOX_ALLOW_ELEVATED = "true";
              PROXMOX_VERIFY_TLS = "false";
            };
          };
        };
        tools."proxmox_*" = false;
      };
    };
    ".config/opencode/AGENTS.md" = {
      force = true;
      source = ./opencode/AGENTS.md;
    };
    ".config/opencode/opencode-notifier.json" = {
      force = true;
      text = builtins.toJSON {
        sound = false;
      };
    };
    ".config/opencode/agents/engineer.md" = {
      force = true;
      source = ./opencode/agents/engineer.md;
    };
    ".config/opencode/agents/investigate.md" = {
      force = true;
      source = ./opencode/agents/investigate.md;
    };
    ".config/opencode/agents/memory.md" = {
      force = true;
      source = ./opencode/agents/memory.md;
    };
    ".config/opencode/agents/review.md" = {
      force = true;
      source = ./opencode/agents/review.md;
    };
    ".config/opencode/agents/scout.md" = {
      force = true;
      source = ./opencode/agents/scout.md;
    };
  };
}

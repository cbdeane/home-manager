{ pkgs, ... }:

{
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;

    plugins = with pkgs.vimPlugins; [
      vim-sleuth
      dracula-nvim
      direnv-vim
      lspkind-nvim
      gitsigns-nvim
      which-key-nvim
      telescope-nvim
      telescope-fzf-native-nvim
      telescope-ui-select-nvim
      nvim-web-devicons
      plenary-nvim
      lazydev-nvim
      luvit-meta
      nvim-lspconfig
      fidget-nvim
      conform-nvim
      nvim-cmp
      luasnip
      friendly-snippets
      cmp_luasnip
      cmp-nvim-lsp
      cmp-path
      cmp-buffer
      cmp-cmdline
      todo-comments-nvim
      mini-nvim
      nvim-treesitter
      nvim-autopairs
      neo-tree-nvim
      nui-nvim
      trouble-nvim
      lsp_signature-nvim
      nvim-notify
      nvim-lint
      nvim-dap
      nvim-dap-ui
      nvim-nio
      nvim-dap-go
      indent-blankline-nvim
      (nvim-treesitter.withPlugins (parsers: with parsers; [
        bash
        c
        cmake
        css
        diff
        go
        html
        javascript
        json
        lua
        luadoc
        markdown
        markdown_inline
        nix
        python
        query
        rust
        sql
        toml
        tsx
        typescript
        vim
        vimdoc
        yaml
      ]))
    ];

    extraPackages = with pkgs; [
      ripgrep
      fd
      gcc
      gnumake
      clang-tools
      ruff
      pyright
      rust-analyzer
      gopls
      nixd
      cmake-language-server
      css-variables-language-server
      vscode-langservers-extracted
      emmet-language-server
      quick-lint-js
      lua-language-server
      typescript-language-server
      sqls
      stylua
      alejandra
      python313Packages.debugpy
      delve
      markdownlint-cli
    ];

    initLua = builtins.readFile ./nvim/init.lua;
  };
}

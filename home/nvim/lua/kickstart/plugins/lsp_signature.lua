return {
  'ray-x/lsp_signature.nvim',
  event = 'InsertEnter',
  opts = {
    bind = true,
    floating_window = true,
    floating_window_above_cur_line = true,
    floating_window_off_y = -1,
    handler_opts = {
      border = 'rounded',
    },
    hint_enable = false,
    doc_lines = 8,
    max_height = 12,
    wrap = true,
    always_trigger = false,
  },
}

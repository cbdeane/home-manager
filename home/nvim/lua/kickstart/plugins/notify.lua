return {
  'rcarriga/nvim-notify',
  opts = {
    timeout = 3000,
    stages = 'fade_in_slide_out',
    background_colour = '#282a36',
  },
  config = function(_, opts)
    local notify = require 'notify'
    notify.setup(opts)
    vim.notify = notify

    vim.keymap.set('n', '<leader>un', function()
      notify.dismiss { silent = true, pending = true }
    end, { desc = 'Dismiss notifications' })
  end,
}

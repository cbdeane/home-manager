return {
  'folke/trouble.nvim',
  cmd = 'Trouble',
  keys = {
    { '<leader>a', '<cmd>Trouble symbols toggle focus=false<CR>', desc = 'Document symbols' },
  },
  opts = {
    modes = {
      symbols = {
        format = '{kind_icon} {symbol.name}',
      },
    },
  },
}

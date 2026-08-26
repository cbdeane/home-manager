{ ... }:

{
  services.mako = {
    enable = true;

    settings = {
      font = "Hack 11";
      width = 360;
      height = 140;
      margin = "12,20,0";
      padding = "12,14";
      border-size = 2;
      border-radius = 12;

      background-color = "#282a36";
      text-color = "#f8f8f2";
      border-color = "#bd93f9";
      progress-color = "over #44475a";

      icons = true;
      max-icon-size = 48;
      markup = true;
      actions = true;

      default-timeout = 5000;
      ignore-timeout = false;
      max-visible = 4;
      max-history = 20;
      sort = "-time";
      layer = "overlay";
      anchor = "top-right";

      "urgency=low" = {
        border-color = "#6272a4";
        default-timeout = 3000;
      };

      "urgency=normal" = {
        border-color = "#bd93f9";
        default-timeout = 5000;
      };

      "urgency=high" = {
        border-color = "#ff5555";
        default-timeout = 0;
      };
    };
  };
}

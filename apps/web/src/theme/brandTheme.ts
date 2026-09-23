import { defineTheme, type DefineThemeInput } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export const brandTheme = defineTheme({
  name: "brand",
  extends: neutralTheme,
  tokens: {
    "--color-brand-primary": "#FF6B1A",
    "--color-brand-secondary": "#FFE066",
    "--color-brand-accent": "#E63946",
  } as DefineThemeInput["tokens"],
});

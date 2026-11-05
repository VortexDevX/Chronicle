import { z } from "zod";

export const readerFonts = [
  {value:"serif",label:"Book serif",family:'Georgia, "Times New Roman", serif'},
  {value:"literata",label:"Literata",family:"var(--font-literata), Georgia, serif"},
  {value:"lora",label:"Lora",family:"var(--font-lora), Georgia, serif"},
  {value:"sans-serif",label:"Manrope",family:"var(--font-interface), sans-serif"},
  {value:"inter",label:"Inter",family:"var(--font-inter), sans-serif"},
  {value:"roboto",label:"Roboto",family:"var(--font-roboto), sans-serif"},
  {value:"josephin",label:"Josefin Sans",family:"var(--font-josefin), sans-serif"},
  {value:"system",label:"System",family:"system-ui, sans-serif"},
  {value:"monospace",label:"Fira Code",family:"var(--font-index-face), monospace"},
] as const;
export const readerSettingsSchema = z.object({
  theme:z.enum(["dark","light","night","amoled"]),fontSize:z.number().min(12).max(40),
  fontFamily:z.enum(["serif","literata","lora","sans-serif","inter","roboto","josephin","system","monospace"]),
  lineHeight:z.number().min(1.2).max(2.6),brightness:z.number().min(50).max(120),mode:z.enum(["scroll","paged"]),
  contentWidth:z.number().min(480).max(960).default(720),
  tint:z.enum(["default","warm","sepia","cool","green"]).default("default"),
  paragraphSpacing:z.number().min(.5).max(2).default(1.3),textAlign:z.enum(["left","justify"]).default("left"),
});
export type ReaderSettings = z.infer<typeof readerSettingsSchema>;
export const defaultSettings:ReaderSettings = {theme:"dark",fontSize:20,fontFamily:"serif",lineHeight:1.8,brightness:100,mode:"scroll",contentWidth:720,tint:"default",paragraphSpacing:1.3,textAlign:"left"};

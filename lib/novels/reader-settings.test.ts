import {expect,it} from "vitest";
import {defaultSettings,readerFonts,readerSettingsSchema} from "./reader-settings";
it("accepts every offered font and restored appearance controls",()=>{
  for(const font of readerFonts) expect(readerSettingsSchema.parse({...defaultSettings,fontFamily:font.value,contentWidth:960,tint:"sepia",textAlign:"justify",paragraphSpacing:2,fontSize:40}).fontFamily).toBe(font.value);
});
it("loads legacy settings with defaults for restored controls",()=>{
  const {contentWidth: _width,tint:_tint,paragraphSpacing:_gap,textAlign:_align,...legacy}=defaultSettings;
  expect(readerSettingsSchema.parse(legacy)).toEqual(defaultSettings);
});
it("rejects invalid fonts and out-of-range widths",()=>{
  expect(readerSettingsSchema.safeParse({...defaultSettings,fontFamily:"untrusted font"}).success).toBe(false);
  expect(readerSettingsSchema.safeParse({...defaultSettings,contentWidth:100000}).success).toBe(false);
});

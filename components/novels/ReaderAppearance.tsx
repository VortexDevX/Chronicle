"use client";
import {useState} from "react";
import {defaultSettings,readerFonts,type ReaderSettings} from "@/lib/novels/reader-settings";

export default function ReaderAppearance({settings,onChange,onSave,onFocus}:{settings:ReaderSettings;onChange:(value:ReaderSettings)=>void;onSave:()=>void;onFocus:()=>void}) {
  const [tab,setTab]=useState("appearance");
  function value<K extends keyof ReaderSettings>(key:K,next:ReaderSettings[K]) {onChange({...settings,[key]:next});}
  return <><div className="reader-settings-tabs" role="tablist" aria-label="Reader settings sections">{["appearance","reading"].map(name=><button type="button" role="tab" aria-selected={tab===name} key={name} onClick={()=>setTab(name)}>{name === "appearance" ? "Appearance" : "Reading"}</button>)}</div><div className="reader-settings">
    {tab === "appearance" ? <>
      <label>Theme<select aria-label="Theme" value={settings.theme} onChange={e=>value("theme",e.target.value as ReaderSettings["theme"])}>{["dark","light","night","amoled"].map(name=><option key={name}>{name}</option>)}</select></label>
      <label>Font<select aria-label="Reading font" value={settings.fontFamily} onChange={e=>value("fontFamily",e.target.value as ReaderSettings["fontFamily"])}>{readerFonts.map(font=><option value={font.value} key={font.value}>{font.label}</option>)}</select></label>
      <label>Font size<output>{settings.fontSize}px</output><input aria-label="Font size" type="range" min="12" max="40" value={settings.fontSize} onChange={e=>value("fontSize",Number(e.target.value))}/></label>
      <label>Line spacing<output>{settings.lineHeight}</output><input aria-label="Line spacing" type="range" min="1.2" max="2.6" step="0.1" value={settings.lineHeight} onChange={e=>value("lineHeight",Number(e.target.value))}/></label>
      <label>Paragraph spacing<output>{settings.paragraphSpacing}×</output><input aria-label="Paragraph spacing" type="range" min="0.5" max="2" step="0.1" value={settings.paragraphSpacing} onChange={e=>value("paragraphSpacing",Number(e.target.value))}/></label>
      <label>Page width<output>{settings.contentWidth}px</output><input aria-label="Page width" type="range" min="480" max="960" step="40" value={settings.contentWidth} onChange={e=>value("contentWidth",Number(e.target.value))}/></label>
      <label>Brightness<output>{settings.brightness}%</output><input aria-label="Brightness" type="range" min="50" max="120" value={settings.brightness} onChange={e=>value("brightness",Number(e.target.value))}/></label>
      <fieldset className="reader-tint-options" disabled={settings.theme==="amoled"}><legend>Page tint</legend><div>{["default","warm","sepia","cool","green"].map(name=><button type="button" key={name} data-tint={name} aria-pressed={settings.tint===name} onClick={()=>value("tint",name as ReaderSettings["tint"])}>{name === "default" ? "Natural" : name}</button>)}</div>{settings.theme==="amoled" && <small>AMOLED keeps the page black.</small>}</fieldset>
      <label>Text alignment<select value={settings.textAlign} onChange={e=>value("textAlign",e.target.value as ReaderSettings["textAlign"])}><option value="left">Left aligned</option><option value="justify">Justified</option></select></label>
    </> : <><label>Reading mode<select aria-label="Reading mode" value={settings.mode} onChange={e=>value("mode",e.target.value as ReaderSettings["mode"])}><option value="scroll">Continuous</option><option value="paged">Paged</option></select></label><button type="button" className="reader-action" onClick={onFocus}>Enter focus mode</button><p className="reader-shortcuts">Tap the reading canvas or press M to toggle focus. Escape brings controls back. Arrow keys move through text. S opens settings.</p></>}
    <div className="reader-settings-actions"><button type="button" onClick={()=>onChange({...defaultSettings})}>Reset defaults</button><button type="button" className="reader-action" onClick={onSave}>Save settings</button></div>
  </div></>;
}

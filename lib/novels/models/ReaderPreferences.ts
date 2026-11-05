import mongoose from "mongoose";
const schema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  theme: { type: String, default: "dark", enum: ["light", "dark", "night", "amoled"] },
  fontSize: { type: Number, default: 20, min: 12, max: 40 },
  fontFamily: { type: String, default: "serif", enum: ["serif", "sans-serif", "monospace", "literata", "lora", "inter", "roboto", "josephin", "system"] },
  lineHeight: { type: Number, default: 1.8, min: 1.2, max: 2.6 },
  brightness: { type: Number, default: 100, min: 50, max: 120 },
  mode: { type: String, default: "scroll", enum: ["scroll", "paged"] },
  contentWidth:{type:Number,default:720,min:480,max:960},
  tint:{type:String,default:"default",enum:["default","warm","sepia","cool","green"]},
  paragraphSpacing:{type:Number,default:1.3,min:.5,max:2},
  textAlign:{type:String,default:"left",enum:["left","justify"]},
});
export const ReaderPreferences = mongoose.models.ReaderPreferences || mongoose.model("ReaderPreferences", schema);

"use client";

import { useEffect } from "react";
import { animate, stagger, type JSAnimation } from "animejs";
import { MOTION_EVENT, motionDisabled } from "@/lib/client/motionPreference";

const ENTRANCES = [
  ".page-intro", ".current-volume", ".reading-queue", ".home-panel", ".media-card",
  ".media-list-row", ".nocturne-novel-card", ".novel-spotlight", ".analytics-panel",
  ".analytics-hero-stat", ".shelf-card", ".update-row", ".bookmark-list>article",
  ".auth-container", ".auth-story", ".simple-hero-copy",
  ".simple-feature-list>article", "[data-motion-reveal]", ".shelf-gallery-card",
  ".novel-upload", ".novel-explore-header", ".home-empty", ".empty-state", ".shelves-empty-state", ".novel-empty",
].join(",");
const SAVED = '.story-log.is-saved, .home-save.is-saved, .product-toast[data-tone="success"]';

type Spark = {
  x: number; y: number; angle: number; distance: number; size: number;
  birth: number; duration: number; kind: "slash" | "ring" | "puff"; color: string;
};

/** Original, Sakuga-inspired drawn effects. Native controls keep all their semantics. */
export function SakugaEffects() {
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let localDisabled = motionDisabled();
    let reduced = preference.matches || localDisabled;
    let disposed = false;
    let frame = 0;
    let scanFrame = 0;
    let sparks: Spark[] = [];
    const animations = new Set<JSAnimation>();
    const seen = new WeakSet<Element>();
    const seenSuccesses = new WeakSet<Element>();
    let lastAccent = -Infinity;
    const canvas = document.createElement("canvas");
    canvas.className = "sakuga-effects";
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    let width = innerWidth;
    let height = innerHeight;

    const resize = () => {
      width = innerWidth;
      height = innerHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();

    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      sparks = [];
      ctx?.clearRect(0, 0, width, height);
      for (const animation of animations) animation.revert();
      animations.clear();
    };

    const updatePreference = (event?: Event) => {
      localDisabled = event instanceof CustomEvent ? Boolean(event.detail) : motionDisabled();
      reduced = preference.matches || localDisabled;
      document.documentElement.dataset.motion = reduced ? "reduced" : "full";
      if (reduced) clear();
    };
    updatePreference();

    const draw = (now: number) => {
      frame = 0;
      if (!ctx || reduced || document.hidden || disposed) return;
      ctx.clearRect(0, 0, width, height);
      sparks = sparks.filter((spark) => now - spark.birth < spark.duration);
      for (const spark of sparks) {
        const t = Math.max(0, (now - spark.birth) / spark.duration);
        const travel = 1 - Math.pow(1 - t, 3);
        const x = spark.x + Math.cos(spark.angle) * spark.distance * travel;
        const y = spark.y + Math.sin(spark.angle) * spark.distance * travel;
        ctx.save();
        ctx.globalAlpha = Math.pow(1 - t, 1.3);
        ctx.strokeStyle = spark.color;
        ctx.fillStyle = spark.color;
        ctx.lineWidth = 1.8;
        ctx.translate(x, y);
        ctx.rotate(spark.angle);
        ctx.beginPath();
        if (spark.kind === "slash") {
          const length = spark.size * (1 - t * .7);
          ctx.moveTo(-length, -2);
          ctx.lineTo(length, 0);
          ctx.lineTo(-length * .5, 2);
          ctx.fill();
        } else if (spark.kind === "ring") {
          ctx.ellipse(0, 0, spark.size * (1 + travel * 2), spark.size * (.6 + travel), 0, -.4, Math.PI * 1.4);
          ctx.stroke();
        } else {
          const size = spark.size * (1 + travel);
          ctx.arc(-size * .3, 0, size * .55, 0, Math.PI * 2);
          ctx.arc(size * .3, -size * .25, size * .5, 0, Math.PI * 2);
          ctx.arc(size * .55, size * .2, size * .3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (sparks.length) frame = requestAnimationFrame(draw);
    };

    const burst = (target: Element) => {
      if (reduced || !ctx || document.hidden) return;
      const now = performance.now();
      if (now - lastAccent < 1200) return;
      lastAccent = now;
      // A native dialog occupies the top layer; draw inside it, without intercepting input.
      const host = target.closest("dialog") || document.body;
      if (canvas.parentElement !== host) {
        sparks = [];
        host.append(canvas);
        resize();
      }
      const box = target.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue("--accent").trim() || "#735299";
      const paper = styles.getPropertyValue("--action").trim() || "#c5b0ea";
      const count = 5;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2 - .25;
        sparks.push({
          x: box.x + box.width / 2 + Math.cos(angle) * Math.min(box.width / 2, 70),
          y: box.y + box.height / 2 + Math.sin(angle) * box.height / 2,
          angle, distance: 12 + i % 2 * 5,
          size: 3,
          birth: now, duration: 380,
          kind: i % 5 === 0 ? "puff" : i % 4 === 0 ? "ring" : "slash",
          color: i % 3 === 0 ? paper : accent,
        });
      }
      sparks = sparks.slice(-64);
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const saved = (node: Element) => {
      if (seenSuccesses.has(node)) return;
      seenSuccesses.add(node);
      burst(node.matches(".product-toast") ? node.querySelector("svg") || node : node);
    };

    const reveal = new IntersectionObserver((entries) => {
      const targets = entries.filter((entry) => entry.isIntersecting).map((entry) => entry.target);
      targets.forEach((target) => reveal.unobserve(target));
      if (!targets.length || reduced || document.hidden) return;
      const animation = animate(targets.slice(0, 24), {
        opacity: [.7, 1], y: [8, 0], duration: 360,
        delay: stagger([0, 100]), ease: "out(4)",
        onComplete: (self) => { self.revert(); animations.delete(self); },
      });
      animations.add(animation);
    }, { threshold: .06 });

    const scan = () => {
      scanFrame = 0;
      document.querySelectorAll(ENTRANCES).forEach((node) => {
        if (seen.has(node)) return;
        seen.add(node);
        if (!reduced) reveal.observe(node);
      });
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) {
          if (record.target.matches(SAVED)) saved(record.target);
          else seenSuccesses.delete(record.target);
        }
        for (const added of record.addedNodes) {
          if (!(added instanceof Element)) continue;
          if (added.matches(SAVED)) saved(added);
          added.querySelectorAll(SAVED).forEach(saved);
        }
      }
      for (const record of records) for (const removed of record.removedNodes) {
        if (!(removed instanceof Element)) continue;
        if (removed.contains(canvas) && !canvas.isConnected) { clear(); document.body.append(canvas); }
        reveal.unobserve(removed);
        removed.querySelectorAll(ENTRANCES).forEach((node) => reveal.unobserve(node));
      }
      if (records.some((record) => record.addedNodes.length) && !scanFrame) scanFrame = requestAnimationFrame(scan);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    scan();
    const visibility = () => { if (document.hidden) clear(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    window.addEventListener(MOTION_EVENT, updatePreference);
    window.addEventListener("storage", updatePreference);
    preference.addEventListener("change", updatePreference);
    return () => {
      disposed = true;
      clear();
      cancelAnimationFrame(scanFrame);
      observer.disconnect();
      reveal.disconnect();
      canvas.remove();
      delete document.documentElement.dataset.motion;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize);
      window.removeEventListener(MOTION_EVENT, updatePreference);
      window.removeEventListener("storage", updatePreference);
      preference.removeEventListener("change", updatePreference);
    };
  }, []);
  return null;
}

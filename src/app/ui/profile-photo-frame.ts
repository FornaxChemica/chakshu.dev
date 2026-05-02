"use client";

import Image from "next/image";
import { createElement, useEffect, useRef } from "react";

const ASCII_CHARS = "█▓▒░╔╗╚╝║═╠╣╦╩╬▪·○◦∙√∞≡∩";

function randomChar() {
  return ASCII_CHARS[Math.floor(Math.random() * ASCII_CHARS.length)] ?? "·";
}

function buildAsciiGrid(columns: number, rows: number) {
  const lines: string[] = [];

  for (let row = 0; row < rows; row += 1) {
    let line = "";
    for (let column = 0; column < columns; column += 1) {
      line += randomChar();
    }
    lines.push(line);
  }

  return lines.join("\n");
}

export default function ProfilePhotoFrame() {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const asciiRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const inner = innerRef.current;
    const asciiLayer = asciiRef.current;

    if (!inner || !asciiLayer) {
      return;
    }

    let currentText = "";

    const renderGrid = () => {
      const rect = inner.getBoundingClientRect();
      const computed = window.getComputedStyle(asciiLayer);
      const fontSize = Number.parseFloat(computed.fontSize) || 7.5;
      const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize;

      // Intentionally overfill and clip to avoid any mid-animation rectangular "gap" artifacts.
      const denseCharWidth = Math.max(1, fontSize * 0.45);
      const denseLineHeight = Math.max(1, lineHeight * 0.78);
      const columns = Math.max(28, Math.ceil(rect.width / denseCharWidth) + 10);
      const rows = Math.max(22, Math.ceil(rect.height / denseLineHeight) + 8);
      currentText = buildAsciiGrid(columns, rows);
      asciiLayer.textContent = currentText;
    };

    const mutateGrid = () => {
      if (!currentText) {
        return;
      }

      const chars = currentText.split("");
      let mutations = 0;
      let attempts = 0;

      while (mutations < 50 && attempts < chars.length * 2) {
        const index = Math.floor(Math.random() * chars.length);
        attempts += 1;

        if (chars[index] === "\n") {
          continue;
        }

        chars[index] = randomChar();
        mutations += 1;
      }

      currentText = chars.join("");
      asciiLayer.textContent = currentText;
    };

    renderGrid();

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(renderGrid) : null;
    resizeObserver?.observe(inner);

    const intervalId = window.setInterval(mutateGrid, 55);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
    }, 4300);

    return () => {
      resizeObserver?.disconnect();
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  return createElement(
    "div",
    { className: "photo-frame" },
    createElement("div", { className: "photo-radar photo-radar-a", "aria-hidden": "true" }),
    createElement("div", { className: "photo-radar photo-radar-b", "aria-hidden": "true" }),
    createElement("div", { className: "photo-corner photo-corner-tl", "aria-hidden": "true" }),
    createElement("div", { className: "photo-corner photo-corner-tr", "aria-hidden": "true" }),
    createElement("div", { className: "photo-corner photo-corner-bl", "aria-hidden": "true" }),
    createElement("div", { className: "photo-corner photo-corner-br", "aria-hidden": "true" }),
    createElement(
      "div",
      { className: "photo-inner", ref: innerRef },
      createElement(Image, {
        className: "photo-img",
        src: "/profile_photo.jpg",
        alt: "Profile photo of Chakshu Jain",
        fill: true,
        priority: true,
        sizes: "(max-width: 680px) 120px, (max-width: 1200px) 42vw, 380px",
      }),
      createElement("div", { className: "scan-bar", "aria-hidden": "true" }),
        createElement("div", { className: "ascii-layer", "aria-hidden": "true", ref: asciiRef })
    )
  );
}
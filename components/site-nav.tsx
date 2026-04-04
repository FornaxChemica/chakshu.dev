"use client";

import { List, X } from "@phosphor-icons/react";
import { useState } from "react";

const links = [
  ["Experience", "#experience"],
  ["Projects", "#projects"],
  ["Stack", "#stack"],
  ["Orbital", "#orbital"],
  ["Terminal", "#terminal"],
  ["Book a call", "https://cal.com/chakshujain"]
] as const;

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav>
        <a className="nav-logo" href="#hero" aria-label="Go to top">
          CJ<span>.</span>
        </a>
        <button
          className="ham-btn"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
        </button>
        <ul className={`nav-links ${open ? "open" : ""}`}>
          {links.map(([label, href]) => {
            const isExternal = href.startsWith("http");
            return (
              <li key={label}>
                <a
                  href={href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      {open ? <button className="nav-overlay open" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
    </>
  );
}

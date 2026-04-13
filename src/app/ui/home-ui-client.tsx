"use client";

import { useEffect } from "react";

export default function HomeUiClient() {
  useEffect(() => {
    const hamBtn = document.getElementById("hamBtn") as HTMLButtonElement | null;
    const navLinks = document.getElementById("navLinks");
    const navOverlay = document.getElementById("navOverlay");
    const progressEl = document.getElementById("scroll-progress");
    const stackSection = document.getElementById("stack");

    if (!hamBtn || !navLinks || !navOverlay || !progressEl) {
      return;
    }

    const updateScrollProgress = () => {
      const total = document.body.scrollHeight - window.innerHeight;
      const pct = total > 0 ? (window.scrollY / total) * 100 : 0;
      (progressEl as HTMLElement).style.width = `${Math.min(100, Math.max(0, pct))}%`;
    };

    const setNavOpen = (isOpen: boolean) => {
      hamBtn.setAttribute("aria-expanded", String(isOpen));
      hamBtn.classList.toggle("open", isOpen);
      navLinks.classList.toggle("open", isOpen);
      navOverlay.classList.toggle("open", isOpen);
    };

    const onHamClick = () => {
      const next = hamBtn.getAttribute("aria-expanded") !== "true";
      setNavOpen(next);
    };

    const onOverlayClick = () => setNavOpen(false);

    const onNavClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("a")) {
        setNavOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    };

    const onResize = () => {
      if (window.innerWidth > 700) {
        setNavOpen(false);
      }
    };

    const runTypewriter = () => {
      const groups = document.querySelectorAll("#stack .skill-group");
      let globalDelay = 0;

      groups.forEach((group) => {
        const tags = group.querySelectorAll(".tag");
        tags.forEach((tag, index) => {
          window.setTimeout(() => {
            tag.classList.add("typed");
          }, globalDelay + index * 80);
        });
        globalDelay += tags.length * 80 + 60;
      });
    };

    let stackObserver: IntersectionObserver | null = null;

    stackObserver =
      stackSection && "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  runTypewriter();
                  stackObserver?.disconnect();
                }
              });
            },
            { threshold: 0.15 }
          )
        : null;

    hamBtn.addEventListener("click", onHamClick);
    navOverlay.addEventListener("click", onOverlayClick);
    navLinks.addEventListener("click", onNavClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", updateScrollProgress);
    updateScrollProgress();

    if (stackObserver && stackSection) {
      stackObserver.observe(stackSection);
    }

    return () => {
      hamBtn.removeEventListener("click", onHamClick);
      navOverlay.removeEventListener("click", onOverlayClick);
      navLinks.removeEventListener("click", onNavClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", updateScrollProgress);
      stackObserver?.disconnect();
    };
  }, []);

  return null;
}

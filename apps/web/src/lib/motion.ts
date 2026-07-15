/** Single GSAP entry point: plugins registered once, reduced-motion respected. */
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(Flip, ScrollTrigger);

export function motionOK(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, Flip, ScrollTrigger };

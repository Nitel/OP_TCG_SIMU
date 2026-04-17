import { gsap } from 'gsap';
import { Container, Graphics } from 'pixi.js';

const CARD_W = 60;
const CARD_H = 84;

/**
 * Flash rouge sur la zone Life (dégât leader).
 */
export function flashLife(animLayer: Container, x: number, y: number): void {
  const g = new Graphics();
  g.rect(x, y, CARD_W, CARD_H);
  g.fill({ color: 0xff2222, alpha: 0.8 });
  animLayer.addChild(g);
  gsap.to(g, {
    alpha: 0,
    duration: 0.5,
    ease: 'power2.out',
    onComplete: () => { animLayer.removeChild(g); g.destroy(); },
  });
}

/**
 * Fade-out + montée (carte envoyée à la trash).
 */
export function koFade(animLayer: Container, x: number, y: number): void {
  const g = new Graphics();
  g.rect(x, y, CARD_W, CARD_H);
  g.fill({ color: 0xaaaaaa, alpha: 0.7 });
  animLayer.addChild(g);
  gsap.to(g, {
    alpha: 0,
    y: y - 40,
    duration: 0.4,
    ease: 'power2.out',
    onComplete: () => { animLayer.removeChild(g); g.destroy(); },
  });
}

/**
 * Scale-in sur un DisplayObject (carte posée sur le board).
 */
export function scaleIn(target: Container): void {
  target.scale.set(0.4);
  target.alpha = 0;
  gsap.to(target.scale, {
    x: 1,
    y: 1,
    duration: 0.3,
    ease: 'back.out(2)',
  });
  gsap.to(target, {
    alpha: 1,
    duration: 0.2,
    ease: 'power2.out',
  });
}

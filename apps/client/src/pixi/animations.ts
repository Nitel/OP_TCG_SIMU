import { gsap } from 'gsap';
import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export function killContainerTweens(c: Container): void {
  gsap.killTweensOf(c);
  gsap.killTweensOf(c.scale);
}

const CARD_W = 86;
const CARD_H = 120;

export function flashLife(animLayer: Container, x: number, y: number): void {
  const g = new Graphics();
  g.roundRect(x, y, CARD_W, CARD_H, 6);
  g.fill({ color: 0xff2222, alpha: 0.85 });
  animLayer.addChild(g);
  gsap.timeline()
    .to(g, { alpha: 0.9, duration: 0.05, ease: 'power1.in' })
    .to(g, { alpha: 0, duration: 0.5, ease: 'power2.out',
      onComplete: () => { animLayer.removeChild(g); g.destroy(); },
    });
}

export function koFade(animLayer: Container, x: number, y: number): void {
  const g = new Graphics();
  g.roundRect(x, y, CARD_W, CARD_H, 6);
  g.fill({ color: 0xaaaaaa, alpha: 0.7 });
  animLayer.addChild(g);
  gsap.to(g, {
    alpha: 0,
    y: y - 50,
    duration: 0.45,
    ease: 'power2.out',
    onComplete: () => { animLayer.removeChild(g); g.destroy(); },
  });
}

export function scaleIn(target: Container): void {
  target.scale.set(0.3);
  target.alpha = 0;
  gsap.to(target.scale, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
  gsap.to(target, { alpha: 1, duration: 0.2, ease: 'power2.out' });

  const flash = new Graphics();
  flash.rect(0, 0, CARD_W, CARD_H);
  flash.fill({ color: 0xffffff, alpha: 0.6 });
  target.addChild(flash);
  gsap.to(flash, {
    alpha: 0,
    duration: 0.15,
    ease: 'power2.out',
    onComplete: () => { target.removeChild(flash); flash.destroy(); },
  });
}

let _hoverGlow: Graphics | null = null;

export function hoverLift(card: Container, animLayer: Container): void {
  gsap.killTweensOf(card.scale);
  gsap.killTweensOf(card);
  gsap.to(card.scale, { x: 1.1, y: 1.1, duration: 0.15, ease: 'back.out(2)' });
  gsap.to(card, { y: card.y - 10, duration: 0.15, ease: 'power2.out' });

  if (_hoverGlow) {
    animLayer.removeChild(_hoverGlow);
    _hoverGlow.destroy();
    _hoverGlow = null;
  }
  const glow = new Graphics();
  glow.roundRect(card.x - 4, card.y - 4, CARD_W + 8, CARD_H + 8, 8);
  glow.fill({ color: 0xffd700, alpha: 0 });
  glow.stroke({ width: 3, color: 0xffd700, alpha: 0.8 });
  animLayer.addChild(glow);
  _hoverGlow = glow;
  gsap.to(glow, { alpha: 1, duration: 0.15 });
}

export function hoverReset(card: Container, originalY: number, animLayer: Container): void {
  gsap.killTweensOf(card.scale);
  gsap.killTweensOf(card);
  gsap.to(card.scale, { x: 1, y: 1, duration: 0.15, ease: 'power2.out' });
  gsap.to(card, { y: originalY, duration: 0.15, ease: 'power2.out' });

  if (_hoverGlow) {
    const g = _hoverGlow;
    _hoverGlow = null;
    gsap.to(g, {
      alpha: 0, duration: 0.15,
      onComplete: () => { animLayer.removeChild(g); g.destroy(); },
    });
  }
}

export function attackSwoosh(
  from: { x: number; y: number },
  to: { x: number; y: number },
  animLayer: Container,
): void {
  const trail = new Graphics();
  animLayer.addChild(trail);

  const marker = new Graphics();
  marker.circle(0, 0, 12);
  marker.fill({ color: 0xffd700, alpha: 0.9 });
  marker.x = from.x + CARD_W / 2;
  marker.y = from.y + CARD_H / 2;
  animLayer.addChild(marker);

  const tl = gsap.timeline({
    onComplete: () => {
      animLayer.removeChild(trail);
      animLayer.removeChild(marker);
      trail.destroy();
      marker.destroy();
    },
  });

  tl.to(marker, {
    x: to.x + CARD_W / 2,
    y: to.y + CARD_H / 2,
    duration: 0.22,
    ease: 'power2.in',
    onUpdate() {
      trail.clear();
      trail.moveTo(from.x + CARD_W / 2, from.y + CARD_H / 2);
      trail.lineTo(marker.x, marker.y);
      trail.stroke({ width: 3, color: 0xffd700, alpha: 0.5 });
    },
  })
  .to(marker, { alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 0.12, ease: 'power2.out' })
  .to(marker, {
    x: from.x + CARD_W / 2,
    y: from.y + CARD_H / 2,
    alpha: 0,
    duration: 0.15,
    ease: 'power2.out',
    onUpdate() {
      trail.clear();
    },
  });
}

export function turnBanner(
  text: string,
  animLayer: Container,
  canvasW: number,
  canvasH: number,
): void {
  const bg = new Graphics();
  bg.rect(0, canvasH / 2 - 60, canvasW, 120);
  bg.fill({ color: 0x040814, alpha: 0.92 });
  bg.x = -canvasW;
  animLayer.addChild(bg);

  const borderTop = new Graphics();
  borderTop.rect(0, canvasH / 2 - 62, canvasW, 3);
  borderTop.fill({ color: 0xb8860b, alpha: 0.9 });
  borderTop.x = -canvasW;
  animLayer.addChild(borderTop);

  const borderBot = new Graphics();
  borderBot.rect(0, canvasH / 2 + 59, canvasW, 3);
  borderBot.fill({ color: 0xb8860b, alpha: 0.9 });
  borderBot.x = -canvasW;
  animLayer.addChild(borderBot);

  const label = new Text({
    text,
    style: new TextStyle({
      fontFamily: 'Cinzel, serif',
      fontSize: 52,
      fontWeight: '700',
      fill: '#ffd700',
      dropShadow: { color: '#b8860b', blur: 12, distance: 0, alpha: 0.9 },
    }),
  });
  label.anchor.set(0.5, 0.5);
  label.x = canvasW / 2 - canvasW;
  label.y = canvasH / 2;
  animLayer.addChild(label);

  const items = [bg, borderTop, borderBot, label];

  const tl = gsap.timeline({
    onComplete: () => {
      items.forEach(i => { animLayer.removeChild(i); i.destroy(); });
    },
  });

  tl.to(items, { x: 0, duration: 0.3, ease: 'power3.out', stagger: 0 })
   .to({}, { duration: 0.9 })
   .to(items, { x: canvasW, duration: 0.3, ease: 'power3.in' });
}

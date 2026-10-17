/*
 * SoundVisualizer — CaYaDev Ses Görselleştirici
 * Copyright (c) 2026 Çağan Turgut (CaYatur) — CaYaDev, https://cayadev.com
 * https://github.com/CaYatur/SoundVisualizer
 * SPDX-License-Identifier: MIT
 */
'use strict';
// P7 adaptation: spectrum-history artwork, not PCM or a reconstructed waveform.
// getSpectrumCurve(n): finite Float32 values in [-1, 1], ordered log-frequency.
// spectrumRevision changes only when a fresh native FFT packet arrives.
/* Şerit: dalga formunun geçmişi. Her karede o anki dalga kaydedilir, eski
   dalgalar yukarı kayarak solar — perspektifli bir "kâğıt şerit" hissi verir.

   Dalga sabit sayıda noktaya indirgenir (ekran genişliğinden bağımsız), böylece
   çizim maliyeti çözünürlükten etkilenmez. */
(function () {
  const POINTS = 168; // dalga başına nokta
  const LAYERS = 26; // saklanan geçmiş dalga sayısı

  class RibbonMode {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.glow = new window.SVGlow();
      this.hist = [];
      this.lastSpectrumRevision = null;
    }
    resize() {}

    draw(audio, cfg, t, dt) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const v = cfg.visualizer;
      ctx.clearRect(0, 0, W, H);

      const data = audio.getSpectrumCurve(POINTS);
      if (!data) return;

      // Yeni dalgayı sabit aralıklarla ekle (kare hızından bağımsız akış)
      if (audio.spectrumRevision !== this.lastSpectrumRevision) {
        this.lastSpectrumRevision = audio.spectrumRevision;
        // Düşecek en eski satırın dizisi yenisine (kare başına ayırma yok)
        const old = this.hist.length >= LAYERS ? this.hist.pop() : null;
        const row = old && old.length === POINTS ? old : new Float32Array(POINTS);
        const step = data.length / POINTS;
        for (let i = 0; i < POINTS; i++) {
          const value = data[Math.min(data.length - 1, (i * step) | 0)];
          row[i] = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
        }
        this.hist.unshift(row);
        if (this.hist.length > LAYERS) this.hist.length = LAYERS;
      }
      if (!this.hist.length) return;

      const amp = H * 0.20 * (v.thickness || 0.42) * 2 * (v.sensitivity || 1);
      const topY = H * 0.22;
      const spanY = H * 0.56;

      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Eskiden yeniye çiz ki yeni dalga en önde kalsın
      for (let l = this.hist.length - 1; l >= 0; l--) {
        const row = this.hist[l];
        const k = l / LAYERS; // 0 = en yeni
        const y0 = topY + spanY * k;
        // uzaklaştıkça daralt ve solgunlaştır (perspektif hissi)
        const shrink = 1 - k * 0.45;
        const a = (1 - k) * (1 - k) * 0.95;
        if (a < 0.02) continue;

        ctx.globalAlpha = a;
        ctx.lineWidth = Math.max(1, (v.lineWidth || 3) * (1 - k * 0.55));
        const colorMode = v.colorMode || (v.rainbow ? 'rainbow' : 'custom');
        if (colorMode === 'theme') {
          ctx.strokeStyle = window.SV.sampleThemeColor(cfg, 1 - k);
        } else if (colorMode === 'rainbow') {
          const hue = ((1 - k) * 260 + t * 26) % 360;
          ctx.strokeStyle = `hsl(${hue}, 88%, ${58 - k * 14}%)`;
        } else {
          ctx.strokeStyle = k < 0.5 ? v.color : v.color2 || v.color;
        }

        ctx.beginPath();
        for (let i = 0; i < POINTS; i++) {
          const px = (W * 0.5) + ((i / (POINTS - 1)) - 0.5) * W * shrink;
          const py = y0 + row[i] * amp * shrink;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();

      this.glow.apply(this.canvas, v.glow, 1.0);
    }
    dispose() {}
  }

  window.SVModes = window.SVModes || {};
  window.SVModes.ribbon = RibbonMode;
})();


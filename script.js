// Masonry: each column gets the next card in order, always into the shortest column,
// so the gap between cards stays the same whatever their heights.
(function () {
    const boxes = [...document.querySelectorAll('.masonry')];
    if (!boxes.length) return;
    const GAP = 24, MIN = 300;
    boxes.forEach(b => { b._items = [...b.children]; });

    function layout(box) {
        const n = Math.max(1, Math.min(box._items.length, Math.floor((box.clientWidth + GAP) / (MIN + GAP))));
        box.classList.add('masonry-on');
        box.replaceChildren();
        const cols = Array.from({ length: n }, () => {
            const col = document.createElement('div');
            col.className = 'masonry-col';
            box.appendChild(col);
            return col;
        });
        for (const item of box._items) {
            let best = cols[0];
            for (const col of cols) if (col.offsetHeight < best.offsetHeight) best = col;
            best.appendChild(item);
        }
    }

    const all = () => boxes.forEach(layout);
    let timer;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(all, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
    window.addEventListener('load', all);
    all();
})();

// Interactive hexagons in the hero. Every hexagon sits on a class of the legend scale (grey, green,
// yellow, amber, orange, red). Under the pointer the hexagons show ONE class above their own;
// a click (or drag) paints them with that class. A row painted in a single class sets off a wave.
(function () {
    const hero = document.querySelector('.hero');
    const svg = hero && hero.querySelector('.hexes');
    if (!svg) return;

    // A new, spatially coherent classification on every load: a few random "hot spots" spread
    // over the honeycomb, ranked and cut into classes with a bell-shaped share (few greys and
    // few reds, most hexagons in the middle). Neighbours end up with similar classes.
    (function randomise() {
        const polys = [...svg.querySelectorAll('polygon')];
        const pts = polys.map(el => { const b = el.getBBox(); return [b.x + b.width / 2, b.y + b.height / 2]; });
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const span = Math.max(x1 - x0, y1 - y0);
        const blobs = Array.from({ length: 3 + Math.floor(Math.random() * 2) }, () => ({
            x: x0 + Math.random() * (x1 - x0), y: y0 + Math.random() * (y1 - y0),
            r: span * (0.28 + Math.random() * 0.22), w: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6)
        }));
        const ang = Math.random() * Math.PI * 2, tilt = 0.5 * Math.random();
        const score = pts.map(([x, y]) => {
            let v = tilt * (((x - x0) * Math.cos(ang) + (y - y0) * Math.sin(ang)) / span);
            for (const b of blobs) v += b.w * Math.exp(-(((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r)));
            return v + (Math.random() - 0.5) * 0.18;
        });
        const order = score.map((v, i) => i).sort((a, b) => score[a] - score[b]);
        const share = [0.07, 0.19, 0.28, 0.24, 0.15, 0.07];
        const pal = (svg.dataset.palette || '').split(',');
        let from = 0;
        share.forEach((s, lvl) => {
            const to = lvl === share.length - 1 ? order.length : from + Math.round(s * order.length);
            for (let k = from; k < to; k++) {
                const el = polys[order[k]];
                el.dataset.l = lvl;
                if (pal[lvl]) el.style.fill = pal[lvl];
            }
            from = to;
        });
    })();

    // On phones the honeycomb is only a background: no interaction
    if (window.matchMedia('(max-width: 760px)').matches) return;

    const NS = 'http://www.w3.org/2000/svg';
    // The pastel scale comes from the markup, so the page and the script share one source
    const PALETTE = (svg.dataset.palette || '#d3d3d0,#96bd3c,#e6d20f,#f3ad00,#ea670f,#ec1a37').split(',');
    const REST = 0.96;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // One class up, but never past the top class (it does not wrap back to grey)
    const next = l => Math.min(l + 1, PALETTE.length - 1);

    const hexes = [...svg.querySelectorAll('polygon')].map(el => {
        const b = el.getBBox();
        el.style.transformBox = 'fill-box';
        el.style.transformOrigin = 'center';
        return { el, cx: b.x + b.width / 2, cy: b.y + b.height / 2, lvl: +el.dataset.l, row: null };
    });

    // Distance between neighbouring centres, used as the unit for "close to the pointer"
    let spacing = Infinity;
    for (let i = 1; i < hexes.length; i++) {
        spacing = Math.min(spacing, Math.hypot(hexes[0].cx - hexes[i].cx, hexes[0].cy - hexes[i].cy));
    }

    // Rows: hexagons sharing the same vertical centre
    const rows = new Map();
    for (const h of hexes) {
        const k = Math.round(h.cy);
        if (!rows.has(k)) rows.set(k, { hexes: [], done: -1 });
        h.row = rows.get(k);
        h.row.hexes.push(h);
    }
    rows.forEach(r => r.hexes.sort((a, b) => a.cx - b.cx));

    const fx = document.createElementNS(NS, 'g');
    svg.appendChild(fx);

    function toSvg(e) {
        const m = svg.getScreenCTM();
        return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : null;
    }

    const dist = (h, pt) => Math.hypot(h.cx - pt.x, h.cy - pt.y);

    function under(pt) {
        let best = null, bd = Infinity;
        for (const h of hexes) {
            const d = dist(h, pt);
            if (d < bd) { bd = d; best = h; }
        }
        return bd < spacing * 0.62 ? best : null;
    }

    let raf = 0, last = null, brush = -1;
    function paint() {
        raf = 0;
        const hover = last && brush < 0;
        for (const h of hexes) {
            const raised = hover && dist(h, last) <= spacing * 1.15;
            h.el.style.fill = PALETTE[raised ? next(h.lvl) : h.lvl];
            h.el.style.opacity = raised ? 1 : REST;
        }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

    function hexPoints(r) {
        let out = '';
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (30 + 60 * i);
            out += (r * Math.cos(a)).toFixed(2) + ',' + (r * Math.sin(a)).toFixed(2) + ' ';
        }
        return out;
    }

    // A wave runs along the row: each hexagon spins a sixth of a turn and swells,
    // then throws small hexagons of the same colour into the air.
    function celebrate(row, color) {
        if (calm) return;
        row.hexes.forEach((h, i) => {
            const delay = i * 80;
            h.el.animate([
                { transform: 'scale(1) rotate(0deg)', fill: color, opacity: REST },
                { transform: 'scale(1.4) rotate(30deg)', fill: '#ffffff', opacity: 1, offset: 0.45 },
                { transform: 'scale(1) rotate(60deg)', fill: color, opacity: REST }
            ], { duration: 800, delay, easing: 'cubic-bezier(.3,1.4,.5,1)' });

            for (let k = 0; k < 8; k++) {
                // The group positions the particle; the polygon inside is what gets animated
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('transform', `translate(${h.cx.toFixed(1)} ${h.cy.toFixed(1)})`);
                const p = document.createElementNS(NS, 'polygon');
                p.setAttribute('points', hexPoints(5 + Math.random() * 8));
                p.style.fill = k % 3 === 2 ? PALETTE[3] : color;
                p.style.opacity = '0';
                g.appendChild(p);
                fx.appendChild(g);
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
                const dist2 = 40 + Math.random() * 80;
                const a = p.animate([
                    { transform: 'translate(0,0) rotate(0deg) scale(.4)', opacity: 0.95 },
                    { transform: `translate(${Math.cos(ang) * dist2}px, ${Math.sin(ang) * dist2}px) rotate(${(Math.random() - 0.5) * 240}deg) scale(1)`, opacity: 0.8, offset: 0.55 },
                    { transform: `translate(${Math.cos(ang) * dist2 * 1.25}px, ${Math.sin(ang) * dist2 * 1.25 + 24}px) rotate(${(Math.random() - 0.5) * 360}deg) scale(.2)`, opacity: 0 }
                ], { duration: 1100 + Math.random() * 500, delay: delay + 120, easing: 'ease-out', fill: 'backwards' });
                a.onfinish = () => g.remove();
            }
        });
    }

    // Every hexagon painted in the top class: a big show. Rings, a ripple from the last click and
    // hexagons thrown far out, all in the colours of the scale.
    function celebrateAll(origin) {
        if (calm) return;
        const top = PALETTE.length - 1, color = PALETTE[top];
        const mix = [color, PALETTE[3], PALETTE[2], '#ffffff', PALETTE[1]];
        let maxD = 1;
        for (const h of hexes) { h._d = Math.hypot(h.cx - origin.cx, h.cy - origin.cy); maxD = Math.max(maxD, h._d); }
        for (const h of hexes) {
            const delay = (h._d / maxD) * 900;
            h.el.animate([
                { transform: 'scale(1) rotate(0deg)', fill: color, opacity: REST },
                { transform: 'scale(1.75) rotate(60deg)', fill: '#ffffff', opacity: 1, offset: 0.3 },
                { transform: 'scale(0.8) rotate(120deg)', fill: PALETTE[3], opacity: 1, offset: 0.6 },
                { transform: 'scale(1) rotate(180deg)', fill: color, opacity: REST }
            ], { duration: 1400, delay, easing: 'cubic-bezier(.3,1.3,.5,1)' });

            const base = Math.atan2(h.cy - origin.cy, h.cx - origin.cx);
            for (let k = 0; k < 6; k++) {
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('transform', `translate(${h.cx.toFixed(1)} ${h.cy.toFixed(1)})`);
                const p = document.createElementNS(NS, 'polygon');
                p.setAttribute('points', hexPoints(5 + Math.random() * 11));
                p.style.fill = mix[k % mix.length];
                p.style.opacity = '0';
                g.appendChild(p);
                fx.appendChild(g);
                const ang = base + (Math.random() - 0.5) * 1.8;
                const far = 90 + Math.random() * 200;
                const a = p.animate([
                    { transform: 'translate(0,0) rotate(0deg) scale(.3)', opacity: 1 },
                    { transform: `translate(${Math.cos(ang) * far * 0.6}px, ${Math.sin(ang) * far * 0.6}px) rotate(${(Math.random() - 0.5) * 400}deg) scale(1.1)`, opacity: 0.9, offset: 0.5 },
                    { transform: `translate(${Math.cos(ang) * far}px, ${Math.sin(ang) * far + 40}px) rotate(${(Math.random() - 0.5) * 720}deg) scale(.2)`, opacity: 0 }
                ], { duration: 1500 + Math.random() * 900, delay: delay + 80, easing: 'ease-out', fill: 'backwards' });
                a.onfinish = () => g.remove();
            }
        }
        // Expanding hexagon rings from the click
        for (let r = 0; r < 3; r++) {
            const g = document.createElementNS(NS, 'g');
            g.setAttribute('transform', `translate(${origin.cx.toFixed(1)} ${origin.cy.toFixed(1)})`);
            const ring = document.createElementNS(NS, 'polygon');
            ring.setAttribute('points', hexPoints(28));
            ring.style.fill = 'none';
            ring.style.stroke = mix[r];
            ring.style.strokeWidth = '4';
            g.appendChild(ring);
            fx.appendChild(g);
            const anim = ring.animate([
                { transform: 'scale(0.4)', opacity: 0.95 },
                { transform: `scale(${(maxD / 28) * 2.2})`, opacity: 0 }
            ], { duration: 1700, delay: r * 260, easing: 'ease-out', fill: 'backwards' });
            anim.onfinish = () => g.remove();
        }
    }

    let allDone = false;
    function paintHex(h, lvl) {
        h.lvl = lvl;
        const row = h.row;
        const top = PALETTE.length - 1;
        const everything = hexes.every(x => x.lvl === top);
        if (everything && !allDone) {
            allDone = true;
            row.done = lvl;
            celebrateAll(h);
        } else if (!everything) {
            allDone = false;
            if (row.hexes.every(x => x.lvl === lvl)) {
                if (row.done !== lvl) { row.done = lvl; celebrate(row, PALETTE[lvl]); }
            } else {
                row.done = -1;
            }
        }
        schedule();
    }

    hero.addEventListener('pointermove', e => {
        last = toSvg(e);
        if (brush >= 0 && last) {
            const h = under(last);
            if (h && h.lvl !== brush) paintHex(h, brush);
        }
        schedule();
    });
    hero.addEventListener('pointerleave', () => { last = null; brush = -1; hero.classList.remove('dragging'); schedule(); });
    hero.addEventListener('pointerdown', e => {
        if (e.target.closest('a, button, input')) return;
        const pt = toSvg(e);
        const h = pt && under(pt);
        if (!h) return;
        brush = next(h.lvl);
        hero.classList.add('dragging');
        paintHex(h, brush);
        last = pt;
    });
    const stop = () => { brush = -1; hero.classList.remove('dragging'); schedule(); };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
})();

// Prints open in a modal on the page instead of a new tab
(function () {
    const modal = document.getElementById('modal');
    if (!modal) return;
    const img = modal.querySelector('img');
    const close = () => { modal.hidden = true; img.removeAttribute('src'); document.body.classList.remove('modal-open'); };
    document.addEventListener('click', e => {
        const a = e.target.closest('a[data-zoom]');
        if (a) {
            e.preventDefault();
            img.src = a.getAttribute('href');
            img.alt = (a.querySelector('img') || {}).alt || '';
            modal.hidden = false;
            document.body.classList.add('modal-open');
        } else if (!modal.hidden && !e.target.closest('#modal img')) close();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
})();

const cards = document.querySelectorAll('.card');
const sections = document.querySelectorAll('.category');
const groups = document.querySelectorAll('.subgroup');
const searchInput = document.getElementById('searchbox');
const noResults = document.getElementById('noresults');

function liveSearch() {
    const query = searchInput.value.trim().toLowerCase();
    let total = 0;

    cards.forEach(card => {
        const match = card.textContent.toLowerCase().includes(query);
        card.hidden = !match;
        if (match) total++;
    });

    groups.forEach(group => {
        group.hidden = query !== '' && !group.querySelector('.card:not([hidden])');
    });

    sections.forEach(section => {
        const hasCards = section.querySelector('.card') !== null;
        const noMatch = hasCards ? !section.querySelector('.card:not([hidden])') : true;
        section.hidden = query !== '' && noMatch;
    });

    noResults.hidden = total > 0;
}

let typingTimer;
searchInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(liveSearch, 250);
});


// Interactive hexagons in the hero: they glow near the pointer; a click (or drag) paints
// hexagons with the legend colours (grey, green, yellow, orange, red-orange, red).
// Painting a whole row with one colour sets off a wave of hexagons.
(function () {
    const hero = document.querySelector('.hero');
    const svg = hero && hero.querySelector('.hexes');
    if (!svg) return;

    const NS = 'http://www.w3.org/2000/svg';
    const PALETTE = ['#d3d3d0', '#96bd3c', '#e6d20f', '#f3ad00', '#ea670f', '#ec1a37'];
    const RADIUS = 130, PAINTED = 0.9, GLOW = 0.7;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const hexes = [...svg.querySelectorAll('polygon')].map(el => {
        const b = el.getBBox();
        el.style.transformBox = 'fill-box';
        el.style.transformOrigin = 'center';
        return { el, cx: b.x + b.width / 2, cy: b.y + b.height / 2, base: parseFloat(getComputedStyle(el).opacity) || 0.1, v: -1, row: null };
    });

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

    function nearest(pt) {
        let best = null, bd = Infinity;
        for (const h of hexes) {
            const d = Math.hypot(h.cx - pt.x, h.cy - pt.y);
            if (d < bd) { bd = d; best = h; }
        }
        return bd < 28 ? best : null;
    }

    let raf = 0, last = null;
    function paint() {
        raf = 0;
        for (const h of hexes) {
            let o = h.v >= 0 ? PAINTED : h.base;
            if (last) {
                const t = Math.max(0, 1 - Math.hypot(h.cx - last.x, h.cy - last.y) / RADIUS);
                o = Math.max(o, h.base + (GLOW - h.base) * t * t);
            }
            h.el.style.opacity = o.toFixed(3);
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
                { transform: 'scale(1) rotate(0deg)', fill: color, opacity: 0.9 },
                { transform: 'scale(1.5) rotate(30deg)', fill: '#fff3b0', opacity: 1, offset: 0.45 },
                { transform: 'scale(1) rotate(60deg)', fill: color, opacity: 0.9 }
            ], { duration: 800, delay, easing: 'cubic-bezier(.3,1.4,.5,1)' });

            for (let k = 0; k < 8; k++) {
                // The group positions the particle; the polygon inside is what gets animated
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('transform', `translate(${h.cx.toFixed(1)} ${h.cy.toFixed(1)})`);
                const p = document.createElementNS(NS, 'polygon');
                const size = 6 + Math.random() * 9;
                p.setAttribute('points', hexPoints(size));
                p.style.fill = k % 3 === 2 ? '#e9b72e' : color; // CSS rule on .hexes polygon would beat a fill attribute
                p.style.opacity = '0';
                g.appendChild(p);
                fx.appendChild(g);
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
                const dist = 50 + Math.random() * 90;
                const a = p.animate([
                    { transform: 'translate(0,0) rotate(0deg) scale(.4)', opacity: 0.95 },
                    { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) rotate(${(Math.random() - 0.5) * 240}deg) scale(1)`, opacity: 0.8, offset: 0.55 },
                    { transform: `translate(${Math.cos(ang) * dist * 1.25}px, ${Math.sin(ang) * dist * 1.25 + 24}px) rotate(${(Math.random() - 0.5) * 360}deg) scale(.2)`, opacity: 0 }
                ], { duration: 1100 + Math.random() * 500, delay: delay + 120, easing: 'ease-out', fill: 'backwards' });
                a.onfinish = () => g.remove();
            }
        });
    }

    function paintHex(h, v) {
        h.v = v;
        h.el.style.fill = PALETTE[v];
        const row = h.row;
        const same = row.hexes.every(x => x.v === v);
        if (same) {
            if (row.done !== v) { row.done = v; celebrate(row, PALETTE[v]); }
        } else {
            row.done = -1;
        }
        schedule();
    }

    let brush = -1;
    hero.addEventListener('pointermove', e => {
        last = toSvg(e);
        if (brush >= 0 && last) {
            const h = nearest(last);
            if (h && h.v !== brush) paintHex(h, brush);
        }
        schedule();
    });
    hero.addEventListener('pointerleave', () => { last = null; brush = -1; hero.classList.remove('dragging'); schedule(); });
    hero.addEventListener('pointerdown', e => {
        if (e.target.closest('a, button, input')) return;
        const pt = toSvg(e);
        const h = pt && nearest(pt);
        if (!h) return;
        brush = (h.v + 1) % PALETTE.length;
        hero.classList.add('dragging');
        paintHex(h, brush);
        last = pt;
    });
    const stop = () => { brush = -1; hero.classList.remove('dragging'); };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
})();

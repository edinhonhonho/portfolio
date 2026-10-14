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


// Interactive hexagons in the hero: they glow near the pointer and a click paints one
// with the next colour of the map legend (grey, green, yellow, orange, red-orange, red).
(function () {
    const hero = document.querySelector('.hero');
    const svg = hero && hero.querySelector('.hexes');
    if (!svg) return;

    const PALETTE = ['#d3d3d0', '#96bd3c', '#e6d20f', '#f3ad00', '#ea670f', '#ec1a37'];
    const RADIUS = 130, PAINTED = 0.9, GLOW = 0.7;
    const hexes = [...svg.querySelectorAll('polygon')].map(el => {
        const b = el.getBBox();
        return { el, cx: b.x + b.width / 2, cy: b.y + b.height / 2, base: parseFloat(getComputedStyle(el).opacity) || 0.1, v: -1 };
    });

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
        const pt = last;
        for (const h of hexes) {
            const painted = h.v >= 0;
            let o = painted ? PAINTED : h.base;
            if (pt) {
                const t = Math.max(0, 1 - Math.hypot(h.cx - pt.x, h.cy - pt.y) / RADIUS);
                o = Math.max(o, h.base + (GLOW - h.base) * t * t);
            }
            h.el.style.opacity = o.toFixed(3);
        }
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };

    hero.addEventListener('pointermove', e => { last = toSvg(e); schedule(); });
    hero.addEventListener('pointerleave', () => { last = null; schedule(); });
    hero.addEventListener('pointerdown', e => {
        if (e.target.closest('a, button, input')) return;
        const pt = toSvg(e);
        const h = pt && nearest(pt);
        if (!h) return;
        h.v = (h.v + 1) % PALETTE.length;
        h.el.style.fill = PALETTE[h.v];
        last = pt;
        schedule();
    });
})();
